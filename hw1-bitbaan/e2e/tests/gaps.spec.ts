import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, getOrder, available, expectError, asUser, placeOrderOk, ADDRESS, GUEST } from '../lib/api';
import { baht, SEED } from '../lib/data';

/**
 * ช่องว่างที่เจอตอนเขียน SPEC.md §8 แล้วแก้โค้ด (7 พ.ย. 2026) — TEST-PLAN.md §3.13
 * ชั้น api · ตัวที่ต้องเห็นบนหน้าจออยู่ใน gaps.ui.spec.ts
 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

const S1 = asUser('S1');
const scheduleLot = (data: Record<string, unknown>, headers = S1) => api.post('/api/admin/lots', { data, headers });

test('TC-CAT-10 · พนักงานตั้งล็อตใหม่ ของเข้า "ขายได้" ตรงเวลาเปิดขาย — FR-06 · BR-34', async () => {
  const before = await available(api, 'GPU-V46');
  const r = await scheduleLot({ sku: 'GPU-V46', qty: 3, releaseAt: '2026-11-14T10:00:00+07:00' });
  expect(r.status()).toBe(201);
  const lot = await r.json();
  expect(lot.code).toMatch(/^LOT-GPU-V46-\d+$/);
  expect(lot.released).toBe(false);

  const p = await (await api.get('/api/products/GPU-V46')).json();
  expect(p.nextLot, 'หน้าสินค้าเห็นล็อตถัดไป').toEqual({ qty: 3, releaseAt: '2026-11-14T10:00:00+07:00' });

  await setClock(api, '2026-11-14T09:59:59+07:00');
  expect(await available(api, 'GPU-V46'), '1 วินาทีก่อนเปิด ของยังไม่เข้า').toBe(before);
  await setClock(api, '2026-11-14T10:00:00+07:00');
  expect(await available(api, 'GPU-V46'), 'ถึงเวลา ของเข้าทันที').toBe(before + 3);
});

test('TC-CAT-11 · ตั้งล็อตผิดเงื่อนไขไม่ได้ และลูกค้าตั้งไม่ได้ — FR-06', async () => {
  await expectError(await scheduleLot({ sku: 'GPU-V46', qty: 3, releaseAt: '2026-11-13T10:00:00+07:00' }), 400, 'INVALID_LOT');
  await expectError(await scheduleLot({ sku: 'GPU-V46', qty: 0, releaseAt: '2026-11-14T10:00:00+07:00' }), 400, 'INVALID_LOT');
  await expectError(await scheduleLot({ sku: 'NOPE-1', qty: 1, releaseAt: '2026-11-14T10:00:00+07:00' }), 400, 'INVALID_LOT');
  await expectError(await scheduleLot({ sku: 'GPU-V46', qty: 1, releaseAt: 'พรุ่งนี้' }), 400, 'INVALID_LOT');
  await expectError(await scheduleLot({ sku: 'GPU-V46', qty: 1, releaseAt: '2026-11-14T10:00:00+07:00' }, asUser('C3')), 403, 'FORBIDDEN');
});

test('TC-CAT-12 · ขายหน้าร้านหลายชิ้นพร้อมรหัสสมาชิก นับเข้ายอดสะสม — FR-07 · BR-01', async () => {
  const before = await available(api, 'SSD-1T');
  const meBefore = await (await api.get('/api/me', { headers: asUser('C2') })).json();
  const r = await api.post('/api/admin/store-sale', { data: { sku: 'SSD-1T', qty: 2, customerCode: 'C2' }, headers: S1 });
  expect(r.status()).toBe(200);
  expect((await r.json()).available).toBe(before - 2);
  const meAfter = await (await api.get('/api/me', { headers: asUser('C2') })).json();
  expect(meAfter.spend12m - meBefore.spend12m, 'ยอดหน้าร้าน 2 × ฿2,190 นับเข้ายอด 12 เดือน').toBe(baht(2 * 2_190));
});

test('TC-CANCEL-07 · เห็นยอดคืนทั้งแบบแกะและไม่แกะก่อนยืนยัน และตรงกับยอดที่คืนจริง — FR-48 · BR-38 · R1', async () => {
  const o = await getOrder(api, SEED.c4Returnable, 'C4');
  expect(o.canReturn).toBe(true);
  expect(o.returnPreview).toEqual({
    unopened: { refund: baht(9_333), fee: 0 },
    opened: { refund: baht(8_400), fee: baht(933) },
  });
  const r = await (await api.post(`/api/orders/${SEED.c4Returnable}/return`, { data: { opened: true }, headers: asUser('C4') })).json();
  expect({ refund: r.refund, fee: r.fee }, 'ยอดจริงต้องเท่ากับที่แสดงก่อนยืนยัน').toEqual(o.returnPreview.opened);
  expect((await getOrder(api, SEED.c4Returnable, 'C4')).returnPreview, 'คืนแล้วไม่มีตัวอย่างอีก').toBeNull();
});

// ---- LAB 8 · ผลสำรวจ exploration/C1–C6 · แก้แล้ว 7 พ.ย. (TEST-PLAN.md §3.14) ----

test('TC-CAT-13 · ขายหน้าร้าน qty 0 หรือติดลบต้องไม่หักของ · ไม่ส่ง qty = 1 ชิ้น — FR-07 · C5', async () => {
  const before = await available(api, 'SSD-1T');
  for (const qty of [0, -1]) {
    await expectError(await api.post('/api/admin/store-sale', { data: { sku: 'SSD-1T', qty }, headers: S1 }), 400, 'INVALID_ITEMS');
  }
  expect(await available(api, 'SSD-1T'), 'qty 0 / −1 ไม่หักของ').toBe(before);
  const r = await api.post('/api/admin/store-sale', { data: { sku: 'SSD-1T' }, headers: S1 });
  expect((await r.json()).available, 'ไม่ส่ง qty = 1 ชิ้น').toBe(before - 1);
});

test('TC-ORDER-12 · ของไม่พอแต่ยังเหลือ ต้องบอกจำนวนที่เหลือ ไม่ใช่ "หมดแล้ว" — FR-37 · C5', async () => {
  const left = await available(api, 'SSD-1T');
  const r = await api.post('/api/orders', { data: { items: [{ sku: 'SSD-1T', qty: left + 1 }], shipping: 'standard', guest: GUEST, address: ADDRESS } });
  const body = await expectError(r, 409, 'OUT_OF_STOCK');
  expect(body.message).toContain(`เหลือ ${left} ชิ้น`);
  expect(body.message).not.toContain('หมดแล้ว');
});

test('TC-ORDER-13 · qty ผิดชนิด (1.5 · "2") ได้ INVALID_ITEMS ตามสัญญา — API-CONTRACT · C5', async () => {
  for (const qty of [1.5, '2']) {
    await expectError(await api.post('/api/quote', { data: { items: [{ sku: 'SSD-1T', qty }], shipping: 'standard' } }), 400, 'INVALID_ITEMS');
  }
});

test('TC-CANCEL-09 · ยกเลิกซ้ำ/คืนซ้ำ ได้ข้อความตามสถานะจริง — BR-36 · BR-37 · C6', async () => {
  const c1 = await api.post(`/api/orders/${SEED.c4Cancellable}/cancel`, { headers: asUser('C4') });
  expect(c1.status()).toBe(200);
  const again = await expectError(await api.post(`/api/orders/${SEED.c4Cancellable}/cancel`, { headers: asUser('C4') }), 409, 'CANNOT_CANCEL');
  expect(again.message, 'ไม่ใช่ "ร้านแพ็กของแล้ว"').toBe('ออเดอร์นี้ถูกยกเลิกไปแล้ว');

  expect((await api.post(`/api/orders/${SEED.c4Returnable}/return`, { data: { opened: false }, headers: asUser('C4') })).status()).toBe(200);
  await expectError(await api.post(`/api/orders/${SEED.c4Returnable}/return`, { data: { opened: false }, headers: asUser('C4') }), 409, 'ALREADY_RETURNED');
});

test('TC-COUPON-08 · NEWBIT200 ที่ออเดอร์รอจ่ายถืออยู่ quote ต้องไม่บอกว่าลด 200 — BR-17 · C3', async () => {
  const ok = await (await api.post('/api/quote', { data: { items: [{ sku: 'SSD-1T', qty: 1 }], coupon: 'NEWBIT200', shipping: 'pickup' }, headers: asUser('C2') })).json();
  expect(ok.coupon.status, 'ก่อนสั่ง ใช้ได้').toBe('APPLIED');
  await placeOrderOk(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'pickup' });
  const q = await (await api.post('/api/quote', { data: { items: [{ sku: 'SSD-1T', qty: 1 }], coupon: 'NEWBIT200', shipping: 'pickup' }, headers: asUser('C2') })).json();
  expect(q.coupon.status, 'มีออเดอร์รอจ่ายถือโค้ดอยู่ → quote ต้องตรงกับผลกดสั่ง (409)').toBe('REJECTED');
  expect(q.coupon.reason).toContain('รอชำระ');
});

test('TC-SHIP-06 · วิธีส่งที่ไม่มี และส่งด่วนนอก กทม. ถูกปฏิเสธตั้งแต่ quote — BR-23 · FR-32 · C4', async () => {
  const items = [{ sku: 'SSD-1T', qty: 1 }];
  await expectError(await api.post('/api/quote', { data: { items, shipping: 'drone' } }), 400, 'INVALID_SHIPPING');
  await expectError(await api.post('/api/quote', { data: { items, shipping: 'express', province: 'นนทบุรี' } }), 400, 'EXPRESS_NOT_AVAILABLE');
  expect((await api.post('/api/quote', { data: { items, shipping: 'express' } })).status(), 'ยังไม่กรอกจังหวัด คิดราคาก่อนได้').toBe(200);
});

test('TC-ACCT-11 · สมัครบริษัทโดยไม่กรอกชื่อบริษัท/เลขภาษี ต้องไม่ได้บัญชีทั่วไปแบบเงียบ ๆ — FR-56 · C4', async () => {
  const base = { email: 'c4x-empty@bitbaan.test', password: 'Bit12345', name: 'คุณทดสอบ', phone: '081-400-0099' };
  await expectError(await api.post('/api/auth/register', { data: { ...base, business: true } }), 400, 'INVALID_INPUT');
  await expectError(await api.post('/api/auth/register', { data: { ...base, business: true, company: 'บจก. ทดสอบ' } }), 400, 'INVALID_INPUT');
  const ok = await api.post('/api/auth/register', { data: { ...base, business: true, company: 'บจก. ทดสอบ', taxId: '0105559999999' } });
  expect(ok.status()).toBe(201);
  expect((await ok.json()).tier).toBe('BUSINESS');
});

test('TC-BUILD-20 · งบ 0 · ติดลบ · มีเศษสตางค์ ถูกปฏิเสธ — BR-35 · C1', async () => {
  const parts = { cpu: 'CPU-N5', mb: null, ram: null, gpu: null, ssd: null, psu: null, case: null };
  for (const budget of [0, -100, 150]) {
    await expectError(await api.post('/api/builder/evaluate', { data: { parts, budget } }), 400, 'INVALID_BUDGET');
    await expectError(await api.post('/api/builds', { data: { parts, budget } }), 400, 'INVALID_BUDGET');
  }
  expect((await api.post('/api/builder/evaluate', { data: { parts, budget: 100 } })).status(), '฿1 ใช้ได้').toBe(200);
});

test('TC-BUILD-23 · ส่ง assembly มากับชิ้นเดี่ยวที่ไม่ใช่สเปกเครื่อง ต้องไม่คิดค่าประกอบ — BR-21 · LAB 9 R41', async () => {
  const single = await (await api.post('/api/quote', { data: { items: [{ sku: 'RAM-16', qty: 1 }], shipping: 'pickup', assembly: true } })).json();
  expect(single.assemblyAvailable).toBe(false);
  expect(single.assemblyFee, 'RAM ชิ้นเดียว ประกอบไม่ได้').toBe(0);
  const six = [{ sku: 'CPU-N5', qty: 1 }, { sku: 'MB-B6', qty: 1 }, { sku: 'RAM-D4', qty: 1 }, { sku: 'SSD-1T', qty: 1 }, { sku: 'PSU-550', qty: 1 }, { sku: 'CASE-M', qty: 1 }];
  const spec = await (await api.post('/api/quote', { data: { items: six, shipping: 'pickup', assembly: true } })).json();
  expect(spec.assemblyAvailable).toBe(true);
  expect(spec.assemblyFee, 'สเปก 6 หมวด + ประกอบ = ฿500 (E64)').toBe(baht(500));
});
