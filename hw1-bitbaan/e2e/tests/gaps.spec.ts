import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, getOrder, available, expectError, asUser } from '../lib/api';
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
