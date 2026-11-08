import { test, expect, APIRequestContext } from '@playwright/test';
import fc from 'fast-check';
import { newApi, reset, setClock, quote as apiQuote, orderInput, asUser } from '../lib/api';
import { PRODUCTS, USERS, baht } from '../lib/data';
import { ORACLE_READY, quote as oracleQuote } from './oracle/price';

/**
 * การบ้านขั้น 3 · property-based testing ด้วย fast-check
 *
 * seed บันทึกทุกครั้งเพื่อให้รันซ้ำได้: `SEED=2026 npm run test:property`
 * P1 ต้องมี oracle อิสระก่อน (ดู `oracle/price.ts`) · P2–P6 ตรวจได้โดยไม่ต้องรู้กฎเงิน
 * จึงรันได้ตั้งแต่ตอนนี้ และยังจับบั๊กได้จริงแม้ oracle จะผิดตรงกับเว็บพอดี
 */
const SEED = Number(process.env.SEED ?? 2026);
const RUNS = Number(process.env.RUNS ?? 1000);

let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); await reset(api); });

test.describe.configure({ timeout: 900_000 });

const BUYABLE = PRODUCTS.filter((p) => p.available > 0);
const TIERS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C11'] as const;
const COUPONS = [undefined, 'NEWBIT200', 'GAMER5', 'OLD2025', 'ไม่มีโค้ดนี้'] as const;
const SHIPPING = ['standard', 'express', 'pickup'] as const;
/** บัญชีที่ยังไม่มีออเดอร์ที่จ่ายแล้ว → ใช้ NEWBIT200 ได้ (BR-16) */
const FIRST_ORDER = new Set(['C2', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11']);

/** สุ่มตะกร้า 1–4 บรรทัด จำนวนไม่เกินของที่มี */
const arbCart = fc
  .uniqueArray(fc.constantFrom(...BUYABLE.map((p) => p.sku)), { minLength: 1, maxLength: 4 })
  .chain((skus) =>
    fc.tuple(...skus.map((sku) => fc.integer({ min: 1, max: Math.min(3, BUYABLE.find((p) => p.sku === sku)!.available) })))
      .map((qtys) => skus.map((sku, i) => ({ sku, qty: qtys[i] }))),
  );

/** เวลาใด ๆ ใน 13–14 พ.ย. ทุกครึ่งชั่วโมง — ครอบทั้งในและนอกช่วง flash sale */
const arbNow = fc
  .tuple(fc.integer({ min: 12, max: 14 }), fc.integer({ min: 0, max: 47 }))
  .map(([day, half]) => {
    const h = String(Math.floor(half / 2)).padStart(2, '0');
    const m = half % 2 === 0 ? '00' : '30';
    return `2026-11-${day}T${h}:${m}:00+07:00`;
  });

const arbCase = fc.record({
  items: arbCart,
  now: arbNow,
  user: fc.constantFrom(...TIERS),
  coupon: fc.constantFrom(...COUPONS),
  shipping: fc.constantFrom(...SHIPPING),
  assembly: fc.boolean(),
});

type Case = { items: { sku: string; qty: number }[]; now: string; user: string; coupon?: string; shipping: string; assembly: boolean };

async function priceIt(c: Case) {
  await setClock(api, c.now);
  const body: any = orderInput({ items: c.items, shipping: c.shipping as any, assembly: c.assembly });
  if (c.coupon) body.coupon = c.coupon;
  if (c.shipping === 'express') body.province = 'กรุงเทพมหานคร';
  const r = await api.post('/api/quote', { data: body, headers: asUser(c.user) });
  return { status: r.status(), body: await r.json() };
}

test(`TC-PROP-03 · P3 · ใบสรุปราคาสอดคล้องกันเองทุกครั้ง (${RUNS} แบบ · seed ${SEED})`, async () => {
  await fc.assert(
    fc.asyncProperty(arbCase, async (c) => {
      const { status, body: q } = await priceIt(c as Case);
      expect(status).toBe(200);
      expect(q.g1).toBe(q.listTotal - q.flashDiscount);
      expect(q.g2).toBe(q.g1 - q.bundleDiscount);
      expect(q.g3).toBe(q.g2 - q.memberDiscount);
      expect(q.g4).toBe(q.g3 - q.coupon.amount);
      expect(q.total).toBe(q.g4 + q.assemblyFee + q.shippingFee);
      expect(q.vat + q.preVat).toBe(q.total);
      expect(q.lines.reduce((a: number, l: any) => a + l.amount, 0)).toBe(q.g1);
    }),
    { numRuns: RUNS, seed: SEED, verbose: true },
  );
});

test(`TC-PROP-05 · P5 · ยอดเงินอยู่ในกรอบที่เป็นไปได้เสมอ (${RUNS} แบบ · seed ${SEED})`, async () => {
  await fc.assert(
    fc.asyncProperty(arbCase, async (c) => {
      const { body: q } = await priceIt(c as Case);
      expect(q.total, 'ยอดชำระห้ามติดลบ').toBeGreaterThanOrEqual(0);
      expect(q.total % 100, 'ยอดชำระเป็นบาทเต็มเสมอ (BR-14)').toBe(0);
      expect(q.coupon.amount, 'ส่วนลดคูปองห้ามเกินเพดาน ฿1,000').toBeLessThanOrEqual(baht(1_000));
      expect(q.coupon.amount, 'ส่วนลดคูปองห้ามเกินยอดสินค้า').toBeLessThanOrEqual(q.g3);
      expect(q.memberDiscount, 'ส่วนลดสมาชิกห้ามเกินอัตราของระดับ').toBeLessThanOrEqual(Math.floor((q.g2 * q.memberRate) / 100));
      expect(q.flashDiscount, 'flash sale ลดได้ไม่เกิน 10% ของราคาป้าย').toBeLessThanOrEqual(Math.floor(q.listTotal / 10));
      expect([0, baht(60), baht(150)], 'ค่าส่งมีได้แค่ 3 ค่า').toContain(q.shippingFee);
      expect([0, baht(500)], 'ค่าประกอบมีได้แค่ 2 ค่า').toContain(q.assemblyFee);
    }),
    { numRuns: RUNS, seed: SEED },
  );
});

test(`TC-PROP-04 · P4 · metamorphic — เพิ่มของลงตะกร้าแล้วยอดสินค้าไม่ลดลง (${RUNS} แบบ · seed ${SEED})`, async () => {
  await fc.assert(
    fc.asyncProperty(arbCase, fc.constantFrom(...BUYABLE.map((p) => p.sku)), async (c, extra) => {
      const base = c as Case;
      if (base.items.some((i) => i.sku === extra)) return; // เพิ่มของที่มีอยู่แล้วเป็นอีกเคสหนึ่ง
      const before = await priceIt(base);
      const after = await priceIt({ ...base, items: [...base.items, { sku: extra, qty: 1 }] });
      expect(after.body.g4, `เพิ่ม ${extra} แล้วยอดสินค้าลดลง`).toBeGreaterThanOrEqual(before.body.g4);
    }),
    { numRuns: RUNS, seed: SEED },
  );
});

test(`TC-PROP-06 · P6 · คิดซ้ำด้วย input เดิมและเวลาเดิม ได้ผลเดิมเสมอ (${RUNS} แบบ · seed ${SEED})`, async () => {
  await fc.assert(
    fc.asyncProperty(arbCase, async (c) => {
      const a = await priceIt(c as Case);
      const b = await priceIt(c as Case);
      expect(b.body.total).toBe(a.body.total);
      expect(b.body.vat).toBe(a.body.vat);
      expect(b.body.coupon.amount).toBe(a.body.coupon.amount);
    }),
    { numRuns: RUNS, seed: SEED },
  );
});

test(`TC-PROP-02 · P2 · ตะกร้าที่ผิดกฎต้องถูกปฏิเสธเสมอ ไม่เงียบ (${RUNS} แบบ · seed ${SEED})`, async () => {
  const arbBad = fc.oneof(
    // จำนวนเกินของที่มี
    fc.constantFrom(...BUYABLE.map((p) => p.sku)).map((sku) => ({
      body: { items: [{ sku, qty: 999 }], shipping: 'standard' },
      wants: ['OUT_OF_STOCK', 'LIMIT_REACHED'],
    })),
    // sku ไม่มีจริง
    fc.string({ minLength: 1, maxLength: 8 }).map((sku) => ({
      body: { items: [{ sku, qty: 1 }], shipping: 'standard' },
      wants: ['INVALID_ITEMS'],
    })),
    // qty < 1
    fc.constantFrom(...BUYABLE.map((p) => p.sku)).map((sku) => ({
      body: { items: [{ sku, qty: 0 }], shipping: 'standard' },
      wants: ['INVALID_ITEMS'],
    })),
    // ส่งด่วนนอกกรุงเทพมหานคร
    fc.constantFrom('นนทบุรี', 'เชียงใหม่', 'ภูเก็ต').map((province) => ({
      body: { items: [{ sku: 'SSD-1T', qty: 1 }], shipping: 'express', province },
      wants: ['EXPRESS_NOT_AVAILABLE'],
    })),
  );

  // reset ครั้งเดียวพอ — ทุกเคสใน P2 คาดว่าถูก **ปฏิเสธ** จึงไม่มีเคสไหนเปลี่ยนสถานะฐานข้อมูลเลย
  // เดิมเรียก reset ในทุกรอบ พอขึ้นเป็น 1,000 รอบกลายเป็นล้าง+seed ฐานข้อมูล 1,000 ครั้งรวด
  // จน POST /api/test/reset ตอบ 500 ที่รอบ ~903 (ดู PROPERTY-REPORT.md ข้อ 5) — เป็นข้อจำกัดของ harness ไม่ใช่บั๊กของเว็บ
  await reset(api);

  await fc.assert(
    fc.asyncProperty(arbBad, async (bad) => {
      const r = await api.post('/api/orders', {
        data: { ...bad.body, address: { line: '99/1', province: (bad.body as any).province ?? 'กรุงเทพมหานคร' } },
        headers: asUser('C2'),
      });
      expect(r.status(), `${JSON.stringify(bad.body)} ต้องถูกปฏิเสธด้วย 4xx`).toBeGreaterThanOrEqual(400);
      expect(r.status()).toBeLessThan(500);
      const body = await r.json();
      expect(bad.wants, `ได้ error=${body.error}`).toContain(body.error);
    }),
    { numRuns: RUNS, seed: SEED },
  );
});

test(`TC-PROP-01 · P1 · ยอดชำระตรงกับ oracle อิสระทุกแบบ (${RUNS} แบบ · seed ${SEED})`, async () => {
  test.skip(!ORACLE_READY, 'ยังไม่มี oracle อิสระ — ดู e2e/property/oracle/price.ts และ prompts/05-oracle-independent.txt');
  await fc.assert(
    fc.asyncProperty(arbCase, async (c) => {
      const got = await priceIt(c as Case);
      const u = (c as Case).user;
      const want = oracleQuote({
        items: (c as Case).items,
        now: (c as Case).now,
        tier: u === 'C1' ? null : USERS[u].tier,
        loggedIn: u !== 'C1',
        firstOrder: FIRST_ORDER.has(u),
        coupon: (c as Case).coupon,
        shipping: (c as Case).shipping as any,
        assembly: (c as Case).assembly,
      });
      expect(got.body.total).toBe(want.total);
      expect(got.body.vat).toBe(want.vat);
    }),
    { numRuns: RUNS, seed: SEED },
  );
});
