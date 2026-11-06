import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, placeOrder, placeOrderOk, pay, getOrder, available, expectError, asUser, quote } from '../lib/api';
import { baht, THU_1000, SEED } from '../lib/data';

/** กดสั่ง กันของ จ่ายเงิน — TEST-PLAN.md §3.6 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

test('TC-ORDER-01 · สั่งโดยไม่ล็อกอินต้องกรอกข้อมูลให้ครบ — FR-35', async () => {
  const noGuest = await api.post('/api/orders', { data: { items: [{ sku: 'SSD-1T', qty: 1 }], shipping: 'standard', address: { line: 'x', province: 'กรุงเทพมหานคร' } } });
  await expectError(noGuest, 400, 'GUEST_INFO_REQUIRED');

  const noAddr = await api.post('/api/orders', { data: { items: [{ sku: 'SSD-1T', qty: 1 }], shipping: 'standard', guest: { name: 'บีม', phone: '0810000001', email: 'b@x.test' } } });
  await expectError(noAddr, 400, 'ADDRESS_REQUIRED');

  const ok = await placeOrderOk(api, { items: [{ sku: 'SSD-1T', qty: 1 }], shipping: 'standard' });
  expect(ok.status).toBe('PENDING');
  expect(ok.orderNo, 'รูปแบบเลขออเดอร์ BB-YYMMDD-NNNN (FR-58)').toMatch(/^BB-261113-\d{4}$/);
});

test('TC-ORDER-02 · ชิ้นใดไม่พอ ไม่สร้างออเดอร์เลยและไม่กันของชิ้นอื่น — FR-36', async () => {
  const before = { cpu: await available(api, 'CPU-N5'), ssd: await available(api, 'SSD-1T') };
  const r = await placeOrder(api, {
    items: [{ sku: 'CPU-N5', qty: 1 }, { sku: 'SSD-1T', qty: 1 }, { sku: 'GPU-V57', qty: 2 }],
    user: 'C2', shipping: 'standard',
  });
  // GPU-V57 จำกัดคนละ 1 ใบ จึงถูกปฏิเสธก่อนถึงขั้นกันของ
  expect([409]).toContain(r.status());
  expect(await available(api, 'CPU-N5'), 'ของชิ้นอื่นต้องไม่ถูกกัน').toBe(before.cpu);
  expect(await available(api, 'SSD-1T'), 'ของชิ้นอื่นต้องไม่ถูกกัน').toBe(before.ssd);
  const mine = await (await api.get('/api/orders', { headers: asUser('C2') })).json();
  expect(mine, 'ต้องไม่มีออเดอร์ถูกสร้างเลย').toHaveLength(0);
});

test('TC-ORDER-02b · ของไม่พอจริง ๆ ได้ 409 OUT_OF_STOCK พร้อม sku และไม่สร้างออเดอร์ — FR-36 · FR-37', async () => {
  const before = await available(api, 'CPU-N5');
  const r = await placeOrder(api, { items: [{ sku: 'CPU-N5', qty: 1 }, { sku: 'MB-X7', qty: 4 }], user: 'C2', shipping: 'standard' });
  const body = await expectError(r, 409, 'OUT_OF_STOCK');
  expect(body.sku, 'ต้องบอกชื่อชิ้นที่หมด').toBe('MB-X7');
  expect(await available(api, 'CPU-N5'), 'CPU-N5 ต้องไม่ถูกกัน').toBe(before);
});

test('TC-CAT-08 · จำนวนต่อรายการไม่เกินจำนวนที่ขายได้ — BR-33 · E113–E115', async () => {
  for (const qty of [5, 6]) {
    const r = await placeOrder(api, { items: [{ sku: 'MB-B6', qty }], user: 'C2', shipping: 'standard' });
    expect(r.status(), `MB-B6 × ${qty} ต้องสั่งได้`).toBe(201);
    await reset(api);
  }
  const over = await placeOrder(api, { items: [{ sku: 'MB-B6', qty: 7 }], user: 'C2', shipping: 'standard' });
  await expectError(over, 409, 'OUT_OF_STOCK');
});

test('TC-ORDER-04 · GPU-V57 จำกัดบัญชีละ 1 ใบต่อล็อต — BR-31 · E104–E108', async () => {
  // 2 ใบในออเดอร์เดียว
  await expectError(await placeOrder(api, { items: [{ sku: 'GPU-V57', qty: 2 }], user: 'C4', shipping: 'standard' }), 409, 'LIMIT_REACHED');

  // 1 ใบได้ แล้วสั่งซ้ำไม่ได้ (ของหมดก่อน จึงตรวจที่ available)
  const first = await placeOrderOk(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C4', shipping: 'standard' });
  expect(await available(api, 'GPU-V57')).toBe(0);

  // ยกเลิกแล้วสิทธิ์กลับมา (TC-CANCEL-02)
  expect((await api.post(`/api/orders/${first.orderNo}/cancel`, { headers: asUser('C4') })).status()).toBe(200);
  expect(await available(api, 'GPU-V57'), 'ยกเลิกแล้วของกลับมาขายได้').toBe(1);
  const again = await placeOrder(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C4', shipping: 'standard' });
  expect(again.status(), 'ยกเลิกแล้วสิทธิ์คืน สั่งใหม่ได้').toBe(201);
});

test('TC-ORDER-06 · ขอบ 30 นาทีของการกันของ — BR-30 · E101–E103', async () => {
  const placedAt = '2026-11-13T10:00:00+07:00';
  for (const [offset, expected] of [['10:29:59', 200], ['10:30:00', 200]] as const) {
    await reset(api);
    await setClock(api, placedAt);
    const o = await placeOrderOk(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', shipping: 'standard' });
    await setClock(api, `2026-11-13T${offset}+07:00`);
    const r = await pay(api, o.orderNo, 'C2');
    expect(r.status(), `จ่ายที่ ${offset}`).toBe(expected);
  }

  await reset(api);
  await setClock(api, placedAt);
  const o = await placeOrderOk(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', shipping: 'standard' });
  await setClock(api, '2026-11-13T10:30:01+07:00');
  await expectError(await pay(api, o.orderNo, 'C2'), 409, 'ORDER_EXPIRED');
});

test('TC-ORDER-07 · หมดเวลาแล้วคืนของและคืนสิทธิ์เองภายใน 5 วินาที — FR-41 · NFR-11', async () => {
  await setClock(api, '2026-11-13T10:00:00+07:00');
  const before = await available(api, 'GPU-V57');
  const o = await placeOrderOk(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C4', shipping: 'standard' });
  expect(await available(api, 'GPU-V57'), 'กดสั่งแล้วของถูกกันทันที').toBe(before - 1);

  await setClock(api, '2026-11-13T10:30:01+07:00');
  await expect.poll(async () => available(api, 'GPU-V57'), { timeout: 5_000, message: 'ของต้องกลับมาขายได้เองโดยไม่ต้องเปิดหน้าเว็บ' }).toBe(before);
  expect((await getOrder(api, o.orderNo, 'C4')).status).toBe('EXPIRED');

  const again = await placeOrder(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C4', shipping: 'standard' });
  expect(again.status(), 'ออเดอร์หมดเวลาไม่นับสิทธิ์ (BR-31)').toBe(201);
});

test('TC-ORDER-08 · กดจ่ายซ้ำตัดเงินครั้งเดียว — FR-43', async () => {
  const o = await placeOrderOk(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', shipping: 'standard' });
  const first = await pay(api, o.orderNo, 'C2');
  expect(first.status()).toBe(200);
  const firstPaidAt = (await first.json()).paidAt;

  const second = await pay(api, o.orderNo, 'C2');
  expect(second.status(), 'จ่ายซ้ำต้องได้ผลเดิม ไม่ error').toBe(200);
  expect((await second.json()).paidAt, 'paidAt ต้องไม่ขยับ').toBe(firstPaidAt);
});

test('TC-ORDER-09 · พนักงานตั้งสถานะ PAID เองไม่ได้ และข้ามขั้นไม่ได้ — FR-44', async () => {
  const o = await placeOrderOk(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C2', shipping: 'standard' });
  await expectError(
    await api.post(`/api/admin/orders/${o.orderNo}/status`, { data: { status: 'PAID' }, headers: asUser('S1') }),
    409, 'INVALID_TRANSITION');

  expect((await pay(api, o.orderNo, 'C2')).status()).toBe(200);
  await expectError(
    await api.post(`/api/admin/orders/${o.orderNo}/status`, { data: { status: 'SHIPPED' }, headers: asUser('S1') }),
    409, 'INVALID_TRANSITION');

  for (const s of ['PACKED', 'SHIPPED', 'DELIVERED']) {
    const r = await api.post(`/api/admin/orders/${o.orderNo}/status`, { data: { status: s }, headers: asUser('S1') });
    expect(r.status(), `เปลี่ยนเป็น ${s}`).toBe(200);
  }
});

test('TC-CAT-07 · ขายหน้าร้านหักจากจำนวนเดียวกับเว็บ และขายเกินไม่ได้ — FR-07 · S1', async () => {
  const before = await available(api, 'GPU-V46');
  const sale = await api.post('/api/admin/store-sale', { data: { sku: 'GPU-V46', qty: 1 }, headers: asUser('S1') });
  expect(sale.status()).toBe(200);
  expect(await available(api, 'GPU-V46'), 'เว็บต้องเห็นจำนวนลดทันที').toBe(before - 1);

  await expectError(
    await api.post('/api/admin/store-sale', { data: { sku: 'GPU-V46', qty: 99 }, headers: asUser('S1') }),
    409, 'OUT_OF_STOCK');
});

test('TC-CAT-06 · ล็อตใหม่เปิดขายตรงเวลา 16 พ.ย. 10:00:00 — BR-34 · E116–E118', async () => {
  await setClock(api, '2026-11-16T09:59:59+07:00');
  const detail = await (await api.get('/api/products/GPU-V57')).json();
  expect(detail.nextLot, 'ต้องบอกล็อตถัดไปล่วงหน้า').toMatchObject({ qty: 2 });
  expect(detail.available, 'ก่อนเวลาเปิดขาย ของล็อตใหม่ยังไม่เข้า').toBe(1);

  await setClock(api, '2026-11-16T10:00:00+07:00');
  await expect.poll(async () => (await (await api.get('/api/products/GPU-V57')).json()).available, { timeout: 5_000 }).toBe(3);
});

test('TC-ORDER-11 · ของเหลือ 1 ใบ ยิงทีละคำขอสำเร็จได้คนเดียว — BR-32 · E109', async () => {
  const first = await placeOrder(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C4', shipping: 'standard' });
  expect(first.status()).toBe(201);
  const second = await placeOrder(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C3', shipping: 'standard' });
  await expectError(second, 409, 'OUT_OF_STOCK');
  expect(await available(api, 'GPU-V57')).toBe(0);
});

test('TC-ACCT-09 · เลขออเดอร์ไม่ซ้ำเมื่อสั่งต่อกัน 10 ใบ — FR-58', async () => {
  await setClock(api, THU_1000);
  const nos: string[] = [];
  for (let n = 0; n < 10; n++) {
    const o = await placeOrderOk(api, { items: [{ sku: 'RAM-16', qty: 1 }], user: 'C2', shipping: 'standard' });
    nos.push(o.orderNo);
  }
  expect(new Set(nos).size, 'เลขออเดอร์ต้องไม่ซ้ำ').toBe(10);
  for (const no of nos) expect(no).toMatch(/^BB-261112-\d{4}$/);
});
