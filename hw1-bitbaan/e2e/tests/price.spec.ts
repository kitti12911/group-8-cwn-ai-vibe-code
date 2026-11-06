import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, quote, placeOrderOk, pay, getOrder } from '../lib/api';
import { QUOTES, baht, THU_1000, FRI_1230 } from '../lib/data';

/** ราคาและส่วนลด — TEST-PLAN.md §3.3 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

const satang = (bahtWithDecimals: number) => Math.round(bahtWithDecimals * 100);

test.describe('TC-PRICE-10 · ตาราง quote 27 แถวจาก TEST-DATA.md ข้อ 5', () => {
  for (const c of QUOTES) {
    test(`${c.id} → ฿${c.total.toLocaleString()} · VAT ฿${c.vat}${c.note ? ` (${c.note})` : ''}`, async () => {
      await setClock(api, c.now);
      const q = await quote(api, c);
      expect(q.total, `${c.id} ยอดชำระ`).toBe(baht(c.total));
      expect(q.vat, `${c.id} VAT`).toBe(satang(c.vat));
      expect(q.preVat, `${c.id} มูลค่าก่อน VAT`).toBe(baht(c.total) - satang(c.vat));
    });
  }
});

test('TC-PRICE-01 · ขอบ flash sale เป็นช่วง [12:00:00, 13:00:00) — BR-06 · E14–E17', async () => {
  const cases: [string, number][] = [
    ['2026-11-13T11:59:59+07:00', 4_590],
    ['2026-11-13T12:00:00+07:00', 4_131],
    ['2026-11-13T12:59:59+07:00', 4_131],
    ['2026-11-13T13:00:00+07:00', 4_590],
  ];
  for (const [now, want] of cases) {
    await setClock(api, now);
    const q = await quote(api, { items: [{ sku: 'MB-B6', qty: 1 }], shipping: 'pickup' });
    expect(q.lines[0].amount, `MB-B6 ที่ ${now}`).toBe(baht(want));
  }
});

test('TC-PRICE-02 · flash sale มีเฉพาะวันศุกร์ — BR-07 · E18–E20', async () => {
  const cases: [string, number][] = [
    ['2026-11-12T12:30:00+07:00', 4_590], // พฤหัส
    ['2026-11-13T12:30:00+07:00', 4_131], // ศุกร์
    ['2026-11-14T12:30:00+07:00', 4_590], // เสาร์
  ];
  for (const [now, want] of cases) {
    await setClock(api, now);
    const q = await quote(api, { items: [{ sku: 'MB-B6', qty: 1 }], shipping: 'pickup' });
    expect(q.lines[0].amount, `MB-B6 ที่ ${now}`).toBe(baht(want));
  }
});

test('TC-PRICE-03 · flash sale ลดเฉพาะป้ายแดง 4 รายการ — BR-08 · E21–E24', async () => {
  await setClock(api, FRI_1230);
  const want: Record<string, number> = { 'MB-B6': 4_131, 'RAM-32': 3_141, 'SSD-1T': 1_971, 'GPU-V46': 10_341, 'CPU-N5': 6_290, 'RAM-16': 1_890 };
  for (const [sku, amount] of Object.entries(want)) {
    const q = await quote(api, { items: [{ sku, qty: 1 }], shipping: 'pickup' });
    expect(q.lines[0].amount, `${sku} ในช่วง flash sale`).toBe(baht(amount));
  }
});

test('TC-PRICE-04 · ราคาล็อกตอนกดสั่ง ไม่ใช่ตอนจ่าย — BR-09 · E25–E28', async () => {
  await setClock(api, '2026-11-13T12:59:30+07:00');
  const order = await placeOrderOk(api, { items: [{ sku: 'MB-B6', qty: 1 }], user: 'C3', shipping: 'pickup' });
  expect(order.quote.total, 'กดสั่ง 12:59:30 ต้องได้ราคา flash sale (Q05)').toBe(baht(4_008));

  await setClock(api, '2026-11-13T13:02:00+07:00');
  const paid = await pay(api, order.orderNo, 'C3');
  expect(paid.status(), 'จ่ายหลัง 13:00 แต่ยังอยู่ในเวลากันของ').toBe(200);
  const after = await getOrder(api, order.orderNo, 'C3');
  expect(after.quote.total, 'ราคาต้องไม่เปลี่ยนหลังจ่าย').toBe(baht(4_008));

  // กดสั่งหลัง 13:00 ได้ราคาปกติ (Q06)
  const later = await placeOrderOk(api, { items: [{ sku: 'MB-B6', qty: 1 }], user: 'C3', shipping: 'pickup' });
  expect(later.quote.total).toBe(baht(4_453));
});

test('TC-PRICE-05 · ชุดประกอบ ฿500 ต่อคู่ CPU+เมนบอร์ด — BR-10 · E29–E32', async () => {
  await setClock(api, THU_1000);
  const cases: [{ sku: string; qty: number }[], number][] = [
    [[{ sku: 'CPU-N5', qty: 1 }], 0],
    [[{ sku: 'CPU-N5', qty: 1 }, { sku: 'MB-B6', qty: 1 }], 500],
    [[{ sku: 'CPU-N5', qty: 2 }, { sku: 'MB-B6', qty: 1 }], 500],
    [[{ sku: 'CPU-N5', qty: 5 }, { sku: 'MB-B6', qty: 5 }], 2_500],
  ];
  for (const [items, want] of cases) {
    const q = await quote(api, { items, shipping: 'pickup' });
    expect(q.bundleDiscount, `${items.map((i) => `${i.sku}×${i.qty}`).join(' + ')}`).toBe(baht(want));
  }
});

test('TC-PRICE-06 · ส่วนลดสมาชิกปัดลงเป็นบาทเต็ม — BR-11 · A-11', async () => {
  await setClock(api, FRI_1230);
  // Q03: G2 = 9,921 · Silver 3% = 297.63 → ปัดลงเป็น 297
  const q = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }, { sku: 'MB-B6', qty: 1 }], user: 'C3', shipping: 'standard' });
  expect(q.g2).toBe(baht(9_921));
  expect(q.memberDiscount, 'ปัดลง ไม่ใช่ 297.63 และไม่ใช่ 298').toBe(baht(297));
  expect(q.g3).toBe(baht(9_624));
});

test('TC-PRICE-07 · ส่วนลดซ้อนกันตามลำดับ flash → ชุด → สมาชิก → คูปอง — BR-12 · E36–E38', async () => {
  await setClock(api, FRI_1230);
  const q = await quote(api, { items: [{ sku: 'GPU-V46', qty: 1 }], user: 'C4', coupon: 'GAMER5', shipping: 'standard' });
  expect(q.flashDiscount, 'flash 10% ของ 11,490').toBe(baht(1_149));
  expect(q.memberDiscount, 'Gold 5% ของ 10,341 = 517.05 → 517').toBe(baht(517));
  expect(q.coupon.amount, 'GAMER5 5% ของ 10,341 × 95% = 491.19 → 491').toBe(baht(491));
  expect(q.total, 'Q07').toBe(baht(9_333));
});

test('TC-PRICE-09 · คิดซ้ำ 100 ครั้งได้ยอดเดิม — BR-14 · NFR-06 · E42', async () => {
  await setClock(api, FRI_1230);
  const items = [{ sku: 'CPU-N5', qty: 1 }, { sku: 'MB-B6', qty: 1 }, { sku: 'GPU-V46', qty: 1 }];
  const first = await quote(api, { items, user: 'C3', coupon: 'GAMER5', shipping: 'standard' });
  for (let n = 0; n < 99; n++) {
    const again = await quote(api, { items, user: 'C3', coupon: 'GAMER5', shipping: 'standard' });
    expect(again.total, `รอบที่ ${n + 2}`).toBe(first.total);
    expect(again.vat).toBe(first.vat);
  }
  expect(first.total % 100, 'ยอดชำระเป็นบาทเต็ม').toBe(0);
});

test('TC-PRICE-12 · ส่วนลดสมาชิก 4 ระดับคิดอัตโนมัติ — BR-01 ถึง BR-03 · E01–E09', async () => {
  await setClock(api, THU_1000);
  const cases: [string, string | null, number, number][] = [
    // user, tier, อัตรา, ยอด CPU-N5 (รับที่ร้าน)
    ['C1', null, 0, 6_290],
    ['C7', 'GENERAL', 0, 6_290],   // ยอด 19,999 → ทั่วไป
    ['C3', 'SILVER', 3, 6_102],    // ยอด 20,000 พอดี → Silver · 188.70 → 188
    ['C9', 'GOLD', 5, 5_976],      // ยอด 100,000 พอดี → Gold · 314.50 → 314
    ['C11', 'BUSINESS', 8, 5_787], // Business ยอด 0 → 8% · 503.20 → 503
  ];
  for (const [user, tier, rate, total] of cases) {
    const q = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user, shipping: 'pickup' });
    expect(q.tier, `${user} ระดับ`).toBe(tier);
    expect(q.memberRate, `${user} อัตรา`).toBe(rate);
    expect(q.total, `${user} ยอดชำระ`).toBe(baht(total));
  }
});

test('TC-ACCT-05 · ระดับคิดตามกฎ ไม่ใช่ตามป้ายในตาราง 6.2 — BR-05 · E13 · Q13', async () => {
  await setClock(api, THU_1000);
  const q = await quote(api, { items: [{ sku: 'RAM-32', qty: 1 }], user: 'C6', shipping: 'standard' });
  expect(q.tier, 'C6 ยอด ฿18,000 ต้องเป็นทั่วไป ไม่ใช่ Silver').toBe('GENERAL');
  expect(q.total).toBe(baht(3_490));
});

test('TC-ACCT-04 · ขอบ 365 วันของยอดสะสม — BR-04 · E10–E12', async () => {
  // C10 มียอด ฿20,000 ลงวันที่ 13 พ.ย. 2025 10:00:00 → อายุ 365 วันพอดีที่ "วันนี้"
  const atEdge = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C10', shipping: 'pickup' });
  expect(atEdge.tier, '365 วันพอดี ยังนับ → Silver').toBe('SILVER');

  await setClock(api, '2026-11-14T10:00:00+07:00'); // 366 วัน
  const expired = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C10', shipping: 'pickup' });
  expect(expired.tier, '366 วัน ไม่นับแล้ว → ทั่วไป').toBe('GENERAL');
});
