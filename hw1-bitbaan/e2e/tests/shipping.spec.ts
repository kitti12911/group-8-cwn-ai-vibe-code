import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, quote, placeOrder, expectError } from '../lib/api';
import { baht, THU_1000, FRI_1230 } from '../lib/data';

/** ค่าส่งและค่าประกอบ — TEST-PLAN.md §3.5 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

test('TC-SHIP-01 · ส่งปกติ ฿60 และฟรีเมื่อยอดสินค้าถึง ฿3,000 — BR-22 · E67–E70', async () => {
  await setClock(api, THU_1000);
  const under = await quote(api, { items: [{ sku: 'SSD-1T', qty: 1 }], shipping: 'standard' });
  expect(under.g4, 'G4 = 2,190').toBe(baht(2_190));
  expect(under.shippingFee).toBe(baht(60));
  expect(under.total, 'Q01').toBe(baht(2_250));

  // Q18: G4 = 3,001 → ส่งฟรี (ค่าที่ใกล้ขอบที่สุดที่ราคาสินค้าจริงไปถึง)
  await setClock(api, FRI_1230);
  const over = await quote(api, { items: [{ sku: 'RAM-D4', qty: 1 }, { sku: 'SSD-1T', qty: 1 }], user: 'C5', shipping: 'standard' });
  expect(over.g4).toBe(baht(3_001));
  expect(over.shippingFee, 'ถึง ฿3,000 แล้วต้องส่งฟรี').toBe(0);
  expect(over.total, 'Q18').toBe(baht(3_001));
});

test('TC-SHIP-01b · ฐานส่งฟรีคิดหลังส่วนลด และไม่นับค่าประกอบ — A-15 · Q6a · Q6b', async () => {
  await setClock(api, THU_1000);
  // Q25: SSD-1T ราคาป้าย 2,190 ใช้ NEWBIT200 → G4 = 1,990 ต่ำกว่า 3,000 → ยังมีค่าส่ง
  const q = await quote(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(q.g4).toBe(baht(1_990));
  expect(q.shippingFee, 'คิดจาก G4 หลังส่วนลด ไม่ใช่ราคาป้าย').toBe(baht(60));
  expect(q.total, 'Q25').toBe(baht(2_050));
});

test('TC-SHIP-02 · ส่งด่วน ฿150 ไม่มีส่งฟรี และเฉพาะกรุงเทพมหานคร — BR-23 · E71–E73', async () => {
  await setClock(api, THU_1000);
  const small = await quote(api, { items: [{ sku: 'RAM-16', qty: 1 }], shipping: 'express', province: 'กรุงเทพมหานคร' });
  expect(small.shippingFee).toBe(baht(150));
  expect(small.total, 'Q12').toBe(baht(2_040));

  const big = await quote(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C4', shipping: 'express', province: 'กรุงเทพมหานคร' });
  expect(big.shippingFee, 'ยอดสูงก็ยังคิดค่าส่งด่วน').toBe(baht(150));

  await expectError(
    await placeOrder(api, { items: [{ sku: 'RAM-16', qty: 1 }], user: 'C2', shipping: 'express', province: 'นนทบุรี' }),
    400, 'EXPRESS_NOT_AVAILABLE');
});

test('TC-SHIP-03 · รับที่ร้านฟรีทุกยอด — BR-24 · E74 · E75', async () => {
  await setClock(api, THU_1000);
  for (const items of [[{ sku: 'RAM-16', qty: 1 }], [{ sku: 'CPU-N7', qty: 1 }, { sku: 'MB-X7', qty: 1 }]]) {
    const q = await quote(api, { items, shipping: 'pickup' });
    expect(q.shippingFee, 'รับที่ร้านต้องฟรีเสมอ').toBe(0);
  }
  const q17 = await quote(api, { items: [{ sku: 'CPU-N7', qty: 1 }, { sku: 'MB-X7', qty: 1 }], shipping: 'pickup' });
  expect(q17.total, 'Q17').toBe(baht(19_280));

  // รับที่ร้านไม่ต้องกรอกที่อยู่
  const r = await api.post('/api/orders', { data: { items: [{ sku: 'RAM-16', qty: 1 }], shipping: 'pickup' }, headers: { 'X-Test-User': 'C2' } });
  expect(r.status(), 'รับที่ร้านสั่งได้โดยไม่ต้องมีที่อยู่').toBe(201);
});

test('TC-BUILD-13 · ค่าประกอบ ฿500 และฟรีเมื่อครบ 7 หมวด — BR-21 · E64–E66', async () => {
  await setClock(api, THU_1000);
  const full = [{ sku: 'CPU-N5', qty: 1 }, { sku: 'MB-B6', qty: 1 }, { sku: 'RAM-D4', qty: 1 }, { sku: 'GPU-V46', qty: 1 }, { sku: 'SSD-1T', qty: 1 }, { sku: 'PSU-550', qty: 1 }, { sku: 'CASE-M', qty: 1 }];
  const six = full.filter((l) => l.sku !== 'GPU-V46');

  const q14 = await quote(api, { items: full, user: 'C2', coupon: 'NEWBIT200', shipping: 'standard', assembly: true });
  expect(q14.assemblyFee, 'ครบ 7 หมวด → ประกอบฟรี').toBe(0);
  expect(q14.total, 'Q14').toBe(baht(28_730));

  const q15 = await quote(api, { items: six, user: 'C2', coupon: 'NEWBIT200', shipping: 'standard', assembly: true });
  expect(q15.assemblyFee, '6 หมวด → เก็บ ฿500').toBe(baht(500));
  expect(q15.total, 'Q15').toBe(baht(17_740));

  const noAssembly = await quote(api, { items: six, user: 'C2', coupon: 'NEWBIT200', shipping: 'standard' });
  expect(noAssembly.assemblyFee, 'ไม่เลือกประกอบ → ฿0').toBe(0);

  // ค่าประกอบต้องไม่ถูกลดด้วยส่วนลดใด (A-37)
  expect(q15.total - q15.g4 - q15.shippingFee, 'ค่าประกอบเข้ายอดเต็ม ๆ').toBe(baht(500));
});
