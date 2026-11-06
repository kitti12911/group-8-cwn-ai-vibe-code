import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, bugMode, quote, products, getClock, setClock, asUser } from '../lib/api';
import { PRODUCTS, NOW_DEFAULT } from '../lib/data';

/**
 * ชุดเล็กที่ยืนยันว่าเว็บทำตาม `API-CONTRACT.md` — ต้องผ่านก่อนเชื่อ test ชุดอื่น
 * TEST-PLAN.md ขั้น 0 "ทุก endpoint ตอบตามรูปแบบ"
 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

test('contract · ตัวช่วยทดสอบครบ 4 ตัว (TC-NFR-05 · TC-NFR-06 · TC-NFR-08)', async () => {
  expect((await api.get('/api/health')).status()).toBe(200);
  expect(await bugMode(api)).toBe(0);
  expect(await getClock(api)).toMatchObject({ now: NOW_DEFAULT, running: false });

  await setClock(api, '2026-11-13T12:00:00+07:00');
  expect((await getClock(api)).now).toBe('2026-11-13T12:00:00+07:00');
  const t = await (await api.get('/api/time')).json();
  expect(t.flash.active, 'ศุกร์ 12:00:00 ต้องอยู่ในช่วง flash sale').toBe(true);

  await reset(api);
  expect((await getClock(api)).now, 'reset ต้องคืนเวลากลับค่าตั้งต้น').toBe(NOW_DEFAULT);
});

test('contract · GET /api/products คืนสินค้า 15 รายการตามข้อ 6.1 (TC-CAT-01)', async () => {
  const list = await products(api);
  expect(list).toHaveLength(PRODUCTS.length);
  for (const want of PRODUCTS) {
    const got = list.find((p) => p.sku === want.sku);
    expect(got, `ไม่พบ ${want.sku}`).toBeTruthy();
    expect(got!.price, `${want.sku} ราคาป้าย`).toBe(want.price * 100);
    expect(got!.redTag, `${want.sku} ป้ายแดง`).toBe(want.redTag);
    expect(got!.available, `${want.sku} จำนวนที่ขายได้`).toBe(want.available);
    expect(got!.memberPrice, `${want.sku} ไม่ล็อกอินต้องไม่มีราคาสมาชิก`).toBeNull();
  }
  expect(list.find((p) => p.sku === 'GPU-V57')!.perBuyerLimit, 'GPU-V57 จำกัดคนละ 1 ใบ').toBe(1);
  expect(list.find((p) => p.sku === 'MON-27')!.inBuilder, 'จอไม่อยู่ในหน้าจัดสเปก').toBe(false);
});

test('contract · เงินเป็นสตางค์จำนวนเต็ม และยอดชำระเป็นบาทเต็ม (TC-NFR-04)', async () => {
  const q = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }, { sku: 'MB-B6', qty: 1 }], user: 'C3', shipping: 'standard' });
  for (const key of ['listTotal', 'flashDiscount', 'g1', 'bundleDiscount', 'g2', 'memberDiscount', 'g3', 'g4', 'assemblyFee', 'shippingFee', 'total', 'vat', 'preVat']) {
    expect(Number.isInteger(q[key]), `${key} ต้องเป็นจำนวนเต็มสตางค์ ได้ ${q[key]}`).toBe(true);
  }
  expect(q.total % 100, 'ยอดชำระต้องเป็นบาทเต็ม (BR-14)').toBe(0);
  expect(q.vat + q.preVat, 'preVat + vat = total').toBe(q.total);
});

test('contract · รูปแบบ Quote สอดคล้องกันเอง g1→g4 (TC-PRICE-08)', async () => {
  const q = await quote(api, {
    items: [{ sku: 'GPU-V46', qty: 1 }, { sku: 'CPU-N5', qty: 1 }],
    user: 'C4', coupon: 'GAMER5', shipping: 'standard',
  });
  const sum = q.lines.reduce((a: number, l: any) => a + l.amount, 0);
  expect(sum, 'Σ lines.amount = g1').toBe(q.g1);
  expect(q.g1).toBe(q.listTotal - q.flashDiscount);
  expect(q.g2).toBe(q.g1 - q.bundleDiscount);
  expect(q.g3).toBe(q.g2 - q.memberDiscount);
  expect(q.g4).toBe(q.g3 - q.coupon.amount);
  expect(q.total).toBe(q.g4 + q.assemblyFee + q.shippingFee);
});

test('contract · เวลาเป็น ISO 8601 +07:00 เสมอ (NFR-14)', async () => {
  const q = await quote(api, { items: [{ sku: 'SSD-1T', qty: 1 }], shipping: 'standard' });
  expect(q.pricedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/);
});

test('contract · endpoint ที่ไม่มีได้ 404 NOT_FOUND', async () => {
  const r = await api.get('/api/not-a-real-endpoint');
  expect(r.status()).toBe(404);
  expect((await r.json()).error).toBe('NOT_FOUND');
});

test('contract · หลังร้านเปิดได้เฉพาะพนักงาน (TC-ACCT-10 · NFR-13)', async () => {
  expect((await api.get('/api/admin/stock', { headers: asUser('C3') })).status()).toBe(403);
  const ok = await api.get('/api/admin/stock', { headers: asUser('S1') });
  expect(ok.status()).toBe(200);
  const rows = await ok.json();
  const v57 = rows.find((r: any) => r.sku === 'GPU-V57');
  expect(v57).toMatchObject({ onHand: 1, held: 0, available: 1 });
});
