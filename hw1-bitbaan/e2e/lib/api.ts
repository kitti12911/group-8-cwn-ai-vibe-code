import { APIRequestContext, expect, request } from '@playwright/test';
import { QuoteCase } from './data';

export type Json = Record<string, any>;

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

/** header แทนการล็อกอิน (API-CONTRACT.md ข้อ 1 · มีเฉพาะ TEST_MODE=1) · 'C1' = ไม่ล็อกอิน */
export const asUser = (code?: string): Record<string, string> => (code && code !== 'C1' ? { 'X-Test-User': code } : {});

export async function newApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL });
}

/** คืนค่าเว็บกลับสู่ TEST-DATA.md และล็อกเวลาที่ ศุกร์ 13 พ.ย. 10:00:00 */
export async function reset(api: APIRequestContext) {
  const r = await api.post('/api/test/reset');
  expect(r.status(), 'POST /api/test/reset').toBe(200);
  expect(await r.json()).toMatchObject({ ok: true });
}

export async function setClock(api: APIRequestContext, now: string, running = false) {
  const r = await api.post('/api/test/clock', { data: { now, running } });
  expect(r.status(), `POST /api/test/clock ${now}`).toBe(200);
  return r.json();
}

export async function getClock(api: APIRequestContext) {
  return (await api.get('/api/test/clock')).json();
}

export async function bugMode(api: APIRequestContext): Promise<number> {
  const body = await (await api.get('/api/test/bug-mode')).json();
  return body.bugMode;
}

export function orderInput(c: Partial<QuoteCase> & { items: { sku: string; qty: number }[] }): Json {
  const body: Json = { items: c.items, shipping: c.shipping ?? 'standard' };
  if (c.coupon) body.coupon = c.coupon;
  if (c.assembly) body.assembly = true;
  if (c.province) body.province = c.province;
  return body;
}

export async function quote(api: APIRequestContext, c: Partial<QuoteCase> & { items: { sku: string; qty: number }[] }) {
  const r = await api.post('/api/quote', { data: orderInput(c), headers: asUser(c.user) });
  expect(r.status(), `POST /api/quote (${c.id ?? 'ad-hoc'})`).toBe(200);
  return r.json();
}

/** ข้อมูลที่คนไม่ล็อกอินต้องกรอก (FR-35 · A-36) */
export const GUEST = { name: 'คุณบีม', phone: '081-000-0001', email: 'beam@bitbaan.test' };
export const ADDRESS = { line: '99/1 ถนนบรมราชชนนี', province: 'กรุงเทพมหานคร' };

export async function placeOrder(
  api: APIRequestContext,
  c: Partial<QuoteCase> & { items: { sku: string; qty: number }[] },
  opts: { guestPhone?: string } = {},
) {
  const body = orderInput(c);
  if (!c.user || c.user === 'C1') body.guest = { ...GUEST, phone: opts.guestPhone ?? GUEST.phone };
  if ((c.shipping ?? 'standard') !== 'pickup') {
    body.address = { ...ADDRESS, province: c.province ?? ADDRESS.province };
  }
  return api.post('/api/orders', { data: body, headers: asUser(c.user) });
}

/** สั่งแล้วยืนยันว่าได้ 201 · คืนเลขออเดอร์ */
export async function placeOrderOk(api: APIRequestContext, c: Parameters<typeof placeOrder>[1], opts?: Parameters<typeof placeOrder>[2]) {
  const r = await placeOrder(api, c, opts);
  expect(r.status(), `POST /api/orders → ${await r.text()}`).toBe(201);
  return (await r.json()) as Json;
}

export async function getOrder(api: APIRequestContext, no: string, user?: string, phone?: string) {
  const q = phone ? `?phone=${encodeURIComponent(phone)}` : '';
  const r = await api.get(`/api/orders/${no}${q}`, { headers: asUser(user) });
  expect(r.status(), `GET /api/orders/${no}`).toBe(200);
  return r.json();
}

export async function pay(api: APIRequestContext, no: string, user?: string, method = 'promptpay') {
  return api.post(`/api/orders/${no}/pay`, { data: { method }, headers: asUser(user) });
}

export async function products(api: APIRequestContext, user?: string) {
  const r = await api.get('/api/products', { headers: asUser(user) });
  expect(r.status()).toBe(200);
  return r.json() as Promise<Json[]>;
}

export async function available(api: APIRequestContext, sku: string): Promise<number> {
  const all = await products(api);
  const p = all.find((x) => x.sku === sku);
  expect(p, `ไม่พบสินค้า ${sku}`).toBeTruthy();
  return p!.available;
}

export async function evaluateBuild(api: APIRequestContext, parts: Record<string, string | null>, extra: Json = {}) {
  const r = await api.post('/api/builder/evaluate', { data: { parts, assembly: false, ...extra } });
  expect(r.status(), 'POST /api/builder/evaluate').toBe(200);
  return r.json();
}

/** error body ตาม API-CONTRACT.md: { error, message } */
export async function expectError(r: { status(): number; json(): Promise<any>; text(): Promise<string> }, status: number, code: string) {
  const body = await r.text();
  expect(r.status(), `คาดว่าได้ ${status} ${code} แต่ได้ ${r.status()} ${body}`).toBe(status);
  const j = JSON.parse(body);
  expect(j.error, `คาดว่า error=${code}`).toBe(code);
  expect(typeof j.message, 'error ต้องมี message ภาษาไทย').toBe('string');
  return j;
}
