import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, quote, placeOrderOk, pay, expectError, placeOrder, asUser } from '../lib/api';
import { baht, THU_1000, FRI_1230 } from '../lib/data';

/** คูปอง — TEST-PLAN.md §3.4 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

test('TC-COUPON-01 · NEWBIT200 ใช้ได้เมื่อยอดหลังส่วนลดสมาชิกถึง ฿2,000 — BR-15 · E43–E47', async () => {
  await setClock(api, THU_1000);
  const under = await quote(api, { items: [{ sku: 'RAM-16', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(under.coupon.status, 'G3 = 1,890 ยังไม่ถึง ฿2,000').toBe('REJECTED');
  expect(under.coupon.reason).toBe('ยอดไม่ถึง ฿2,000');
  expect(under.total, 'Q19').toBe(baht(1_950));

  const over = await quote(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(over.coupon.status, 'G3 = 2,190 ถึงแล้ว').toBe('APPLIED');
  expect(over.total, 'Q25').toBe(baht(2_050));

  // ชิ้นเดียวกันในช่วง flash sale เหลือ 1,971 → กลับไปใช้ไม่ได้ (ขอบที่เลื่อนตามเวลา)
  await setClock(api, FRI_1230);
  const flash = await quote(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(flash.coupon.status, 'ช่วง flash sale ยอดเหลือ 1,971 ใช้โค้ดไม่ได้').toBe('REJECTED');
});

test('TC-COUPON-02 · NEWBIT200 เฉพาะออเดอร์แรกและต้องล็อกอิน — BR-16 · E48–E51', async () => {
  await setClock(api, THU_1000);

  // C3 มี BB-260910-0001 อยู่แล้ว
  const used = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C3', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(used.coupon.status).toBe('REJECTED');
  expect(used.coupon.reason).toBe('โค้ดนี้ใช้ได้กับออเดอร์แรกเท่านั้น');
  expect(used.total, 'Q20').toBe(baht(6_102));

  // ไม่ล็อกอินใช้ไม่ได้
  const guest = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], coupon: 'NEWBIT200', shipping: 'standard' });
  expect(guest.coupon.reason).toBe('ต้องเข้าสู่ระบบก่อนใช้โค้ดนี้');

  // C2 ใช้ได้ → จ่ายแล้วใช้อีกไม่ได้
  const first = await placeOrderOk(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(first.quote.total, 'Q02').toBe(baht(6_090));
  expect((await pay(api, first.orderNo, 'C2')).status()).toBe(200);

  const second = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(second.coupon.status, 'จ่ายออเดอร์แรกแล้ว ใช้โค้ดอีกไม่ได้').toBe('REJECTED');
});

test('TC-COUPON-02b · ออเดอร์ที่ยกเลิกไม่นับเป็นออเดอร์แรก — BR-16 · Q3b', async () => {
  await setClock(api, THU_1000);
  const o = await placeOrderOk(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect((await pay(api, o.orderNo, 'C2')).status()).toBe(200);
  expect((await api.post(`/api/orders/${o.orderNo}/cancel`, { headers: asUser('C2') })).status()).toBe(200);

  const again = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(again.coupon.status, 'ยกเลิกแล้วยังถือว่ายังไม่มีออเดอร์แรก').toBe('APPLIED');
});

test('TC-COUPON-04 · GAMER5 คิดจากหมวดการ์ดจอ/จอหลังสมาชิก และชนเพดาน ฿1,000 — BR-18 · E53–E58', async () => {
  await setClock(api, THU_1000);

  // ไม่มีการ์ดจอหรือจอในตะกร้า → ใช้ไม่ได้
  const noEligible = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C4', coupon: 'GAMER5', shipping: 'standard' });
  expect(noEligible.coupon.reason).toBe('โค้ดนี้ใช้ได้เฉพาะการ์ดจอและจอ');

  // ชนเพดาน: Q08 GPU-V57 + PSU-750 · 5% ของ 23,990 × 95% = 1,139 → ตัดเหลือ 1,000
  const capped = await quote(api, { items: [{ sku: 'GPU-V57', qty: 1 }, { sku: 'PSU-750', qty: 1 }], user: 'C4', coupon: 'GAMER5', shipping: 'standard' });
  expect(capped.coupon.amount, 'เพดานต่อออเดอร์').toBe(baht(1_000));
  expect(capped.total, 'Q08').toBe(baht(24_916));

  // ฐานคิดเฉพาะหมวดที่เข้าเงื่อนไข: Q22 การ์ดจอ + CPU → 5% ของการ์ดจออย่างเดียว
  const mixed = await quote(api, { items: [{ sku: 'GPU-V46', qty: 1 }, { sku: 'CPU-N5', qty: 1 }], user: 'C4', coupon: 'GAMER5', shipping: 'standard' });
  expect(mixed.coupon.amount, '5% ของ 11,490 × 95% = 545.77 → 545').toBe(baht(545));
  expect(mixed.total, 'Q22').toBe(baht(16_346));

  // ไม่ล็อกอินใช้ได้ (A-41) และอัตราสมาชิกเป็น 0
  await setClock(api, FRI_1230);
  const guest = await quote(api, { items: [{ sku: 'GPU-V46', qty: 1 }], coupon: 'GAMER5', shipping: 'standard' });
  expect(guest.coupon.status).toBe('APPLIED');
  expect(guest.total, 'Q24').toBe(baht(9_824));
});

test('TC-COUPON-05 · บัญชี Business ใช้คูปองได้ — BR-19 · E59 · E60', async () => {
  await setClock(api, '2026-11-13T10:00:00+07:00');
  const q = await quote(api, { items: [{ sku: 'MON-27', qty: 5 }], user: 'C5', coupon: 'GAMER5', shipping: 'standard' });
  expect(q.coupon.status, 'Business ใช้คูปองได้ (K8 → A-08)').toBe('APPLIED');
  expect(q.total, 'Q09').toBe(baht(35_754));
});

test('TC-COUPON-06 · OLD2025 หมดอายุแล้ว — BR-20 · E61–E63', async () => {
  await setClock(api, THU_1000);
  const q = await quote(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', coupon: 'OLD2025', shipping: 'standard' });
  expect(q.coupon.status).toBe('REJECTED');
  expect(q.coupon.reason).toBe('โค้ดหมดอายุแล้ว');
});

test('TC-COUPON-07 · เหตุผลที่โค้ดใช้ไม่ได้ครบทุกแบบ และ /api/quote ไม่ error — FR-27', async () => {
  await setClock(api, THU_1000);
  const unknown = await quote(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', coupon: 'ไม่มีโค้ดนี้จริง', shipping: 'standard' });
  expect(unknown.coupon.status).toBe('REJECTED');
  expect(unknown.coupon.reason).toBe('ไม่พบโค้ดนี้');
  expect(unknown.total, 'โค้ดผิดต้องไม่ทำให้ราคาผิด').toBe(baht(2_250));

  // แต่ตอนกดสั่งจริงต้องไม่เงียบ — ได้ 400 COUPON_REJECTED
  const r = await placeOrder(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', coupon: 'ไม่มีโค้ดนี้จริง', shipping: 'standard' });
  await expectError(r, 400, 'COUPON_REJECTED');
});
