import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, expectError, asUser, placeOrderOk, pay, available, quote, getOrder } from '../lib/api';
import { baht, SEED, USERS, FRI_1230, FULL_BUILD } from '../lib/data';

/** ลูกค้าบริษัท ใบเสนอราคา และภาษี — TEST-PLAN.md §3.8 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

test('TC-BIZ-01 · เฉพาะบัญชี Business ออกใบเสนอราคาได้ — FR-51', async () => {
  const biz = await api.post('/api/quotes', { data: { items: [{ sku: 'MON-27', qty: 2 }] }, headers: asUser('C5') });
  expect(biz.status()).toBe(201);
  const body = await biz.json();
  expect(body.quoteNo, 'รูปแบบ Q-YYMMDD-NNNN').toMatch(/^Q-261113-\d{4}$/);
  expect(body.validUntil, 'ยืนราคาถึงสิ้นวันที่ 7').toBe('2026-11-20T23:59:59+07:00');

  await expectError(
    await api.post('/api/quotes', { data: { items: [{ sku: 'MON-27', qty: 2 }] }, headers: asUser('C3') }),
    403, 'FORBIDDEN');
});

test('TC-BIZ-02 · ใบเสนอราคายืนราคาถึงสิ้นวันที่ 7 และไม่กันของ — BR-39 · E132–E134', async () => {
  const before = await available(api, 'MON-27');
  const q = await (await api.get(`/api/quotes/${SEED.c5Quote}`, { headers: asUser('C5') })).json();
  expect(q.validUntil).toBe('2026-11-13T23:59:59+07:00');
  expect(q.expired).toBe(false);
  expect(q.quote.total, 'ใบที่ seed ไว้ ฿35,754').toBe(baht(35_754));
  expect(await available(api, 'MON-27'), 'ใบเสนอราคาต้องไม่กันของ').toBe(before);

  // สั่งจากใบเสนอราคาด้วยราคาในใบ
  const order = await api.post(`/api/quotes/${SEED.c5Quote}/order`, {
    data: { shipping: 'pickup' }, headers: asUser('C5'),
  });
  expect(order.status()).toBe(201);
  expect((await order.json()).quote.total, 'ใช้ราคาที่ล็อกไว้').toBe(baht(35_754));
});

test('TC-BIZ-02b · ใบเสนอราคาหมดอายุสั่งไม่ได้ — BR-39', async () => {
  await setClock(api, '2026-11-13T23:59:59+07:00');
  expect((await (await api.get(`/api/quotes/${SEED.c5Quote}`, { headers: asUser('C5') })).json()).expired, 'วินาทีสุดท้ายยังไม่หมดอายุ').toBe(false);

  await setClock(api, '2026-11-14T00:00:00+07:00');
  expect((await (await api.get(`/api/quotes/${SEED.c5Quote}`, { headers: asUser('C5') })).json()).expired).toBe(true);
  await expectError(
    await api.post(`/api/quotes/${SEED.c5Quote}/order`, { data: { shipping: 'pickup' }, headers: asUser('C5') }),
    409, 'QUOTE_EXPIRED');
});

test('TC-BIZ-03 · VAT คิดครั้งเดียวทั้งบิล ปัดครึ่งขึ้น — BR-40 · E135–E141 · Q11', async () => {
  await setClock(api, '2026-11-12T10:00:00+07:00');
  const o = await placeOrderOk(api, {
    items: [{ sku: 'CPU-N5', qty: 5 }, { sku: 'MB-B6', qty: 5 }, { sku: 'RAM-D4', qty: 5 }],
    user: 'C5', shipping: 'standard',
  });
  expect(o.quote.total, 'Q11').toBe(baht(53_682));
  expect(o.quote.vat, 'คิดทั้งบิล = ฿3,511.91 · ถ้าคิดต่อบรรทัดจะได้ ฿3,511.92 ซึ่งผิด').toBe(351_191);
  expect(o.quote.preVat + o.quote.vat).toBe(o.quote.total);

  expect((await pay(api, o.orderNo, 'C5')).status()).toBe(200);
  const inv = await (await api.get(`/api/orders/${o.orderNo}/invoice`, { headers: asUser('C5') })).json();
  expect(inv.total).toBe(baht(53_682));
  expect(inv.vat).toBe(351_191);
  expect(inv.preVat).toBe(baht(53_682) - 351_191);
  expect(inv.buyer.taxId, 'เลขผู้เสียภาษี 13 หลักของบริษัท').toBe('0105559000123');
  expect(inv.invoiceNo).toMatch(/^INV-/);
});

test('TC-BIZ-04 · ใบกำกับภาษีออกได้เฉพาะออเดอร์ที่จ่ายแล้ว — FR-53', async () => {
  const o = await placeOrderOk(api, { items: [{ sku: 'MON-27', qty: 1 }], user: 'C5', shipping: 'standard' });
  await expectError(await api.get(`/api/orders/${o.orderNo}/invoice`, { headers: asUser('C5') }), 409, 'NOT_PAID');

  expect((await pay(api, o.orderNo, 'C5')).status()).toBe(200);
  const inv = await api.get(`/api/orders/${o.orderNo}/invoice`, { headers: asUser('C5') });
  expect(inv.status()).toBe(200);
});

test('TC-ACCT-06 · สมัคร เข้าสู่ระบบ ออกจากระบบ และกันอีเมลซ้ำ — FR-54', async () => {
  const ctx = await newApi();
  const email = `tester${Date.now() % 100000}@bitbaan.test`;
  const reg = await ctx.post('/api/auth/register', { data: { email, password: 'Bit12345', name: 'ผู้ทดสอบ', phone: '0810009999' } });
  expect(reg.status()).toBe(201);
  expect((await reg.json()).tier, 'สมัครใหม่ยอด 0 → ทั่วไป').toBe('GENERAL');

  await expectError(
    await ctx.post('/api/auth/register', { data: { email, password: 'Bit12345', name: 'ซ้ำ', phone: '0810009999' } }),
    409, 'EMAIL_TAKEN');

  expect((await ctx.post('/api/auth/logout')).status()).toBe(200);
  await expectError(await ctx.get('/api/me'), 401, 'LOGIN_REQUIRED');

  const bad = await ctx.post('/api/auth/login', { data: { email, password: 'ผิดแน่นอน' } });
  const e = await expectError(bad, 401, 'INVALID_LOGIN');
  expect(e.message).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

  const ok = await ctx.post('/api/auth/login', { data: { email, password: 'Bit12345' } });
  expect(ok.status()).toBe(200);
  expect((await ctx.get('/api/me')).status(), 'cookie ต้องใช้ได้ต่อ').toBe(200);
  await ctx.dispose();
});

test('TC-ACCT-07 · สมัคร Business เองได้ 8% ทันที และเลขผู้เสียภาษีต้อง 13 หลัก — FR-56 · BR-40', async () => {
  const ctx = await newApi();
  for (const taxId of ['012345678901', '01234567890123']) {
    await expectError(
      await ctx.post('/api/auth/register', { data: { email: `t${taxId}@bitbaan.test`, password: 'Bit12345', name: 'x', phone: '0810000000', company: 'บริษัท ทดสอบ', taxId } }),
      400, 'INVALID_TAX_ID');
  }
  const good = await ctx.post('/api/auth/register', {
    data: { email: `biz${Date.now() % 100000}@bitbaan.test`, password: 'Bit12345', name: 'ผู้ซื้อ', phone: '0810000000', company: 'บริษัท ทดสอบ จำกัด', taxId: '0105569000999' },
  });
  expect(good.status()).toBe(201);
  const me = await good.json();
  expect(me.tier, 'สมัครแล้วได้ Business ทันที (บ.21)').toBe('BUSINESS');
  expect(me.memberRate).toBe(8);
  await ctx.dispose();
});

test('TC-ACCT-08 · หน้าบัญชีบอกระดับ ยอด 12 เดือน และยอดที่ขาดถึงระดับถัดไป — FR-29 · FR-57', async () => {
  const me = await (await api.get('/api/me', { headers: asUser('C3') })).json();
  expect(me.tier).toBe('SILVER');
  expect(me.spend12m, 'ยอด 12 เดือนของ C3 = ฿20,000').toBe(baht(USERS.C3.spend12m));
  expect(me.nextTier).toBe('GOLD');
  expect(me.toNextTier, 'อีก ฿80,000 เป็น Gold').toBe(baht(80_000));

  const biz = await (await api.get('/api/me', { headers: asUser('C5') })).json();
  expect(biz.nextTier, 'Business ไม่มีระดับถัดไป').toBeNull();
  expect(biz.taxId).toBe('0105559000123');
});

/**
 * TC-BUILD-18 อยู่ในแผนข้อ 3.2 (หน้าจัดสเปก) แต่เป็น TC ชั้น `api` ที่ยังไม่มี test
 * จึงถูกเติมไว้ที่ไฟล์นี้ — `builder.spec.ts` มีเจ้าของอื่นถืออยู่ตอนเขียน
 */
test('TC-BUILD-18 · คนที่เปิดลิงก์สั่งเองได้ และส่วนลดคิดตามบัญชีคนสั่ง — FR-22 · Q16 · B1b', async () => {
  await setClock(api, FRI_1230);

  // ลิงก์ BEAM35K ถูกบันทึกโดย "คนไม่ล็อกอิน" (TEST-DATA.md ข้อ 4) — คนบันทึกจึงไม่มีระดับสมาชิกเลย
  const link = await api.get(`/api/builds/${SEED.buildCode}`);
  expect(link.status(), 'เปิดลิงก์ได้โดยไม่ต้องล็อกอิน').toBe(200);
  const build = await link.json();
  expect(build.assembly, 'สเปกนี้ขอให้ร้านประกอบ').toBe(true);
  expect(build.items.map((it: any) => it.sku).sort(), 'ครบชุด 7 ชิ้น').toEqual([...FULL_BUILD].sort());
  expect(build.evaluation.remaining, 'B1b · ศุกร์ 12:30 เหลืองบ ฿7,397').toBe(baht(7_397));

  const items = build.items.map((it: any) => ({ sku: it.sku, qty: 1 }));

  // ราคาของ "คนที่บันทึกลิงก์" (ไม่ล็อกอิน) = 29,430 − 1,827 (flash) − 500 (ชุดประกอบ) = 27,103
  const asSaver = await quote(api, { items, user: 'C1', shipping: 'standard', assembly: true });
  expect(asSaver.memberDiscount, 'คนบันทึกไม่มีส่วนลดสมาชิก').toBe(0);
  expect(asSaver.total, 'ราคาของคนบันทึกลิงก์ = ฿27,103').toBe(baht(27_103));

  // คนที่เปิดลิงก์ (C4 Gold) สั่งเอง → ต้องได้ส่วนลด Gold ของตัวเอง ไม่ใช่ของคนบันทึก (Q16)
  const o = await placeOrderOk(api, { items, user: 'C4', shipping: 'standard', assembly: true });
  expect(o.quote.g2, 'ก่อนส่วนลดสมาชิกเท่ากับราคาของคนบันทึก').toBe(baht(27_103));
  expect(o.quote.tier, 'ใช้ระดับของคนสั่ง').toBe('GOLD');
  expect(o.quote.memberRate).toBe(5);
  expect(o.quote.memberDiscount, '5% ของ 27,103 = 1,355.15 → ปัดลง 1,355').toBe(baht(1_355));
  expect(o.quote.assemblyFee, 'ครบ 7 หมวด ค่าประกอบฟรี').toBe(0);
  expect(o.quote.shippingFee, 'เกิน ฿3,000 ส่งฟรี').toBe(0);
  expect(o.quote.total, 'Q16 · ฿25,748').toBe(baht(25_748));
  expect(o.quote.vat, 'Q16 · VAT ฿1,684.45').toBe(168_445);
  expect(o.quote.preVat + o.quote.vat).toBe(o.quote.total);
  expect(o.quote.total, 'ถูกกว่าราคาของคนบันทึกลิงก์พอดีเท่าส่วนลด Gold').toBe(baht(27_103) - baht(1_355));

  const full = await getOrder(api, o.orderNo, 'C4');
  expect(full.buyer.code, 'เจ้าของออเดอร์คือคนที่เปิดลิงก์').toBe('C4');
  expect(full.quote.lines).toHaveLength(7);
});
