import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, getOrder, available, expectError, asUser, placeOrderOk, pay } from '../lib/api';
import { baht, SEED } from '../lib/data';

/** ยกเลิกและคืนของ — TEST-PLAN.md §3.7 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

const cancel = (no: string, user: string) => api.post(`/api/orders/${no}/cancel`, { headers: asUser(user) });
const ret = (no: string, user: string, opened: boolean) => api.post(`/api/orders/${no}/return`, { data: { opened }, headers: asUser(user) });

test('TC-CANCEL-01 · ยกเลิกได้ก่อนแพ็ก คืนเต็มรวมค่าส่ง — BR-36 · E123–E125 · R2', async () => {
  // รอจ่าย → ยกเลิกได้ ไม่มีเงินคืน
  const pending = await placeOrderOk(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', shipping: 'standard' });
  const c1 = await cancel(pending.orderNo, 'C2');
  expect(c1.status()).toBe(200);
  expect((await c1.json()).refund, 'ยังไม่จ่าย จึงไม่มีเงินคืน').toBe(0);

  // จ่ายแล้วยังไม่แพ็ก → คืนเต็มรวมค่าส่ง (R2)
  const c2 = await cancel(SEED.c4Cancellable, 'C4');
  expect(c2.status()).toBe(200);
  expect((await c2.json()).refund, 'R2 · คืน ฿1,286 รวมค่าส่ง ฿60').toBe(baht(1_286));

  // แพ็กแล้ว → ยกเลิกไม่ได้
  await expectError(await cancel(SEED.c5Packed, 'C5'), 409, 'CANNOT_CANCEL');
});

test('TC-CANCEL-02 · ยกเลิกแล้วคืนจำนวนที่ขายได้ — FR-47', async () => {
  const before = await available(api, 'RAM-D4');
  const o = await placeOrderOk(api, { items: [{ sku: 'RAM-D4', qty: 2 }], user: 'C2', shipping: 'standard' });
  expect(await available(api, 'RAM-D4')).toBe(before - 2);
  expect((await pay(api, o.orderNo, 'C2')).status()).toBe(200);
  expect((await cancel(o.orderNo, 'C2')).status()).toBe(200);
  expect(await available(api, 'RAM-D4'), 'ยกเลิกแล้วของต้องกลับมาขายได้').toBe(before);
});

test('TC-CANCEL-03 · ขอคืนของได้ถึงสิ้นวันที่ 7 นับจากวันได้รับ — BR-37 · E126–E128', async () => {
  // BB-261106-0041 ได้รับ ศุกร์ 6 พ.ย. 15:00 → คืนได้ถึง 13 พ.ย. 23:59:59
  const o = await getOrder(api, SEED.c4Returnable, 'C4');
  expect(o.status).toBe('DELIVERED');
  expect(o.returnUntil, 'ขอบวันคืนของ').toBe('2026-11-13T23:59:59+07:00');
  expect(o.canReturn, 'วันนี้ 13 พ.ย. 10:00 ยังคืนได้').toBe(true);

  await setClock(api, '2026-11-13T23:59:59+07:00');
  expect((await getOrder(api, SEED.c4Returnable, 'C4')).canReturn, 'วินาทีสุดท้ายยังคืนได้').toBe(true);

  await setClock(api, '2026-11-14T00:00:00+07:00');
  await expectError(await ret(SEED.c4Returnable, 'C4', false), 409, 'RETURN_WINDOW_CLOSED');
});

test('TC-CANCEL-04 · ค่าธรรมเนียมแกะกล่อง 10% ปัดลง และไม่คืนค่าส่ง — BR-38 · E129–E131 · R1', async () => {
  const opened = await ret(SEED.c4Returnable, 'C4', true);
  expect(opened.status()).toBe(200);
  const body = await opened.json();
  expect(body.fee, 'R1 · 10% ของ 9,333 = 933.30 → ปัดลง 933').toBe(baht(933));
  expect(body.refund, 'R1 · คืน ฿8,400 · ไม่คืนค่าส่ง ฿150').toBe(baht(8_400));
  expect(body.status).toBe('RETURNED');
});

test('TC-CANCEL-04b · ยังไม่แกะกล่อง ไม่หักค่าธรรมเนียม — BR-38 · R1b', async () => {
  const unopened = await ret(SEED.c4Returnable, 'C4', false);
  expect(unopened.status()).toBe(200);
  const body = await unopened.json();
  expect(body.fee).toBe(0);
  expect(body.refund, 'R1b · คืน ฿9,333 · ยังไม่คืนค่าส่ง ฿150').toBe(baht(9_333));
});

test('TC-CANCEL-06 · สถานะเงินคืน รอโอนคืน → โอนคืนแล้ว และไม่สัญญาจำนวนวัน — FR-50 · A-25', async () => {
  expect((await cancel(SEED.c4Cancellable, 'C4')).status()).toBe(200);
  const o = await getOrder(api, SEED.c4Cancellable, 'C4');
  expect(o.refunds).toHaveLength(1);
  expect(o.refunds[0]).toMatchObject({ kind: 'CANCEL', status: 'PENDING', amount: baht(1_286) });
  expect(o.refunds[0].refundedAt, 'ยังไม่โอน ต้องไม่มีวันที่').toBeNull();

  const done = await api.post(`/api/admin/refunds/${o.refunds[0].id}/done`, { headers: asUser('S1') });
  expect(done.status()).toBe(200);
  const after = await getOrder(api, SEED.c4Cancellable, 'C4');
  expect(after.refunds[0].status).toBe('DONE');
  expect(after.refunds[0].refundedAt).toBeTruthy();
});

test('TC-CANCEL-05 · ออเดอร์ของคนอื่นเปิดไม่ได้ — FR-46 · ความปลอดภัย', async () => {
  const r = await api.get(`/api/orders/${SEED.c4Cancellable}`, { headers: asUser('C3') });
  expect(r.status(), 'ไม่ใช่ของตัวเองต้องได้ 404 ไม่ใช่ 200').toBe(404);
});
