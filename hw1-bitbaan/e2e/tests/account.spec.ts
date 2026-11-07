import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, quote, placeOrderOk, getOrder, available, asUser, expectError, GUEST, ADDRESS } from '../lib/api';
import { baht, THU_1000, NOW_DEFAULT, PASSWORD } from '../lib/data';

/**
 * ระดับสมาชิก สต็อกที่กันไว้ และคุณภาพชั้นข้อมูล — TEST-PLAN.md §3.9 และ §3.10
 *
 * ทุกตัวเลขในไฟล์นี้มาจาก `TEST-DATA.md` (E01–E09) และ `TEST-PLAN.md` โดยตรง
 * ถ้าเว็บไม่ตรง = เว็บผิด ห้ามแก้ค่าที่คาดให้ตรงกับหน้าจอ (TEST-PLAN.md §2.4)
 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

// ───────────────────────────── ตัวช่วย ─────────────────────────────

/** `GET /api/me` ของผู้ใช้ทดสอบ (API-CONTRACT.md §3.5) */
async function me(user: string) {
  const r = await api.get('/api/me', { headers: asUser(user) });
  expect(r.status(), `GET /api/me (${user})`).toBe(200);
  return r.json();
}

/** `GET /api/admin/stock` แถวเดียว (API-CONTRACT.md §3.6 · ต้องเป็นพนักงาน) */
async function adminStock(sku: string) {
  const r = await api.get('/api/admin/stock', { headers: asUser('S1') });
  expect(r.status(), 'GET /api/admin/stock').toBe(200);
  const row = ((await r.json()) as any[]).find((x) => x.sku === sku);
  expect(row, `ไม่พบ ${sku} ใน /api/admin/stock`).toBeTruthy();
  return row as { sku: string; onHand: number; held: number; available: number };
}

type PgRows = { rows: any[]; rowCount: number | null };
type PgClient = { connect(): Promise<void>; query(sql: string, params?: unknown[]): Promise<PgRows>; end(): Promise<void> };

/**
 * ต่อตรงเข้า PostgreSQL ของเว็บ (docker-compose.yml · พอร์ตเครื่องเรา 5434 · user/password/db = bitbaan)
 * ใช้ 2 อย่างเท่านั้น: ตรวจว่ารหัสผ่านถูกแฮช (TC-NFR-10) และตั้งยอดสะสมให้ตรงค่าขอบที่ราคาสินค้าไปไม่ถึง (E03 · E06 · E09)
 * `pg` ไม่มี type declaration ในโปรเจกต์ จึงโหลดผ่าน require (มี @types/node อยู่แล้ว) และโหลดแบบ lazy
 * เพื่อให้ test ที่ไม่ใช้ฐานข้อมูลไม่พังตามถ้าไลบรารีหาย
 */
async function loadPg(): Promise<{ Client: new (cfg: Record<string, unknown>) => PgClient }> {
  if (typeof require === 'function') return require('pg');
  const spec = 'pg';
  const mod: any = await import(spec);
  return mod.Client ? mod : mod.default;
}

async function withDb<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T> {
  const { Client } = await loadPg();
  const client = new Client({
    host: '127.0.0.1', port: 5434, user: 'bitbaan', password: 'bitbaan', database: 'bitbaan',
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  try {
    return await fn(async (sql, params) => (await client.query(sql, params)).rows);
  } finally {
    await client.end();
  }
}

/**
 * ดันยอดสะสม 12 เดือนของบัญชีให้เป็นตัวเลขที่ต้องการเป๊ะ ๆ โดยเพิ่มแถวใน `spend_ledger`
 * (ราคาสินค้าถูกสุดคือ ฿1,290 จึงซื้อให้ได้ 20,001 หรือ 100,001 พอดีไม่ได้ · TEST-DATA.md ข้อ 7 ใช้วิธีเดียวกันที่ชั้น unit)
 * ทุก test เรียก `POST /api/test/reset` ก่อน แถวที่เพิ่มจึงหายไปเองทุกครั้ง
 */
async function setSpendTo(user: string, targetBaht: number) {
  const before = (await me(user)).spend12m as number;
  const deltaBaht = targetBaht - before / 100;
  expect(deltaBaht, `ยอดของ ${user} (฿${before / 100}) ต้องน้อยกว่าเป้าหมาย ฿${targetBaht}`).toBeGreaterThan(0);
  await withDb(async (q) => {
    const rows = await q(
      `INSERT INTO spend_ledger (user_id, amount, source, occurred_at)
       SELECT id, $2, 'store', $3 FROM users WHERE code = $1 RETURNING id`,
      [user, deltaBaht, '2026-06-01T12:00:00+07:00'],
    );
    expect(rows.length, `เพิ่มยอดให้ ${user} ไม่สำเร็จ`).toBe(1);
  });
  const after = await me(user);
  expect(after.spend12m, `ยอดสะสมของ ${user} หลังตั้งค่า`).toBe(baht(targetBaht));
  return after;
}

/** ยิง `POST /api/orders` พร้อมกัน n คำขอ ตรงเข้า API ไม่ผ่านหน้าเว็บ · ผู้ซื้อคนละเบอร์ = คนละคน (BR-31 · A-18) */
async function fireConcurrent(n: number, sku: string) {
  const results = await Promise.all(
    Array.from({ length: n }, (_, k) =>
      api.post('/api/orders', {
        data: {
          items: [{ sku, qty: 1 }],
          shipping: 'standard',
          guest: { ...GUEST, name: `ผู้ซื้อตรง ${k}`, phone: `0830000${String(k).padStart(3, '0')}`, email: `direct${k}@bitbaan.test` },
          address: ADDRESS,
        },
      }),
    ),
  );
  return {
    created: results.filter((r) => r.status() === 201),
    conflicts: results.filter((r) => r.status() === 409),
    other: results.filter((r) => r.status() !== 201 && r.status() !== 409),
  };
}

// ──────────────────────── TC-ACCT · ระดับสมาชิก ────────────────────────

test('TC-ACCT-01 · ขอบ Silver ที่ ฿20,000 — BR-01 · E01–E03', async () => {
  await setClock(api, THU_1000); // พฤหัส ไม่มี flash sale · CPU-N5 ไม่ใช่ป้ายแดงอยู่แล้ว

  // E01 · C7 ยอด ฿19,999 = ทั่วไป · CPU-N5 เต็มราคา ฿6,290 (G4 ≥ ฿3,000 จึงส่งฟรี BR-22)
  const c7 = await me('C7');
  expect(c7.spend12m, 'C7 ยอดสะสมตั้งต้น').toBe(baht(19_999));
  expect(c7.tier, 'ยอด ฿19,999 ยังไม่ถึงขอบ ฿20,000').toBe('GENERAL');
  expect(c7.memberRate).toBe(0);
  const q19999 = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C7', shipping: 'standard' });
  expect(q19999.tier).toBe('GENERAL');
  expect(q19999.memberDiscount, 'ทั่วไปไม่มีส่วนลดสมาชิก').toBe(0);
  expect(q19999.total, 'E01 · ยอด ฿19,999 ซื้อ CPU-N5').toBe(baht(6_290));

  // E02 · C3 ยอด ฿20,000 พอดี = Silver 3% → 6,290 − 188 (3% = 188.70 ปัดลง) = 6,102 (ตรงกับ Q20)
  const c3 = await me('C3');
  expect(c3.spend12m, 'C3 ยอดสะสมตั้งต้น').toBe(baht(20_000));
  expect(c3.tier, 'ยอด ฿20,000 พอดีต้องเป็น Silver — "ตั้งแต่ ฿20,000"').toBe('SILVER');
  expect(c3.memberRate).toBe(3);
  const q20000 = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C3', shipping: 'standard' });
  expect(q20000.tier).toBe('SILVER');
  expect(q20000.memberDiscount, '3% ของ ฿6,290 = ฿188.70 ปัดลงเป็น ฿188').toBe(baht(188));
  expect(q20000.total, 'E02 · ยอด ฿20,000 ซื้อ CPU-N5').toBe(baht(6_102));

  // E03 · ยอด ฿20,001 = Silver (ยังไม่ใช่ Gold) — ราคาสินค้าถูกสุด ฿1,290 ซื้อให้ได้ +2 บาทพอดีไม่ได้ จึงตั้งยอดที่ ledger
  const c7plus = await setSpendTo('C7', 20_001);
  expect(c7plus.tier, 'ยอด ฿20,001 ต้องเป็น Silver').toBe('SILVER');
  expect(c7plus.memberRate).toBe(3);
  expect(c7plus.nextTier, 'ขั้นถัดไปของ Silver คือ Gold').toBe('GOLD');
  const q20001 = await quote(api, { items: [{ sku: 'CPU-N5', qty: 1 }], user: 'C7', shipping: 'standard' });
  expect(q20001.tier).toBe('SILVER');
  expect(q20001.total, 'E03 · ยอด ฿20,001 ซื้อ CPU-N5 ได้ราคา Silver เท่ากับ ฿20,000').toBe(baht(6_102));
});

test('TC-ACCT-02 · ขอบ Gold ที่ ฿100,000 — BR-02 · E04–E06', async () => {
  await setClock(api, THU_1000);

  // E04 · C8 ยอด ฿99,999 = Silver 3% → 10,990 − 329 (3% = 329.70 ปัดลง) = 10,661
  const c8 = await me('C8');
  expect(c8.spend12m, 'C8 ยอดสะสมตั้งต้น').toBe(baht(99_999));
  expect(c8.tier, 'ยอด ฿99,999 ยังไม่ถึงขอบ ฿100,000').toBe('SILVER');
  expect(c8.memberRate).toBe(3);
  const q99999 = await quote(api, { items: [{ sku: 'CPU-N7', qty: 1 }], user: 'C8', shipping: 'standard' });
  expect(q99999.tier).toBe('SILVER');
  expect(q99999.memberDiscount, '3% ของ ฿10,990 = ฿329.70 ปัดลงเป็น ฿329').toBe(baht(329));
  expect(q99999.total, 'E04 · ยอด ฿99,999 ซื้อ CPU-N7').toBe(baht(10_661));

  // E05 · C9 ยอด ฿100,000 พอดี = Gold 5% → 10,990 − 549 (5% = 549.50 ปัดลง) = 10,441
  const c9 = await me('C9');
  expect(c9.spend12m, 'C9 ยอดสะสมตั้งต้น').toBe(baht(100_000));
  expect(c9.tier, 'ยอด ฿100,000 พอดีต้องเป็น Gold').toBe('GOLD');
  expect(c9.memberRate).toBe(5);
  expect(c9.nextTier, 'Gold คือระดับสูงสุดของบัญชีทั่วไป').toBeNull();
  const q100000 = await quote(api, { items: [{ sku: 'CPU-N7', qty: 1 }], user: 'C9', shipping: 'standard' });
  expect(q100000.tier).toBe('GOLD');
  expect(q100000.memberDiscount, '5% ของ ฿10,990 = ฿549.50 ปัดลงเป็น ฿549').toBe(baht(549));
  expect(q100000.total, 'E05 · ยอด ฿100,000 ซื้อ CPU-N7').toBe(baht(10_441));

  // E06 · ยอด ฿100,001 = Gold — ดัน C8 (Silver 99,999) ข้ามขอบขึ้นมา +2 บาทพอดี
  const c8plus = await setSpendTo('C8', 100_001);
  expect(c8plus.tier, 'ยอด ฿100,001 ต้องเป็น Gold').toBe('GOLD');
  expect(c8plus.memberRate).toBe(5);
  const q100001 = await quote(api, { items: [{ sku: 'CPU-N7', qty: 1 }], user: 'C8', shipping: 'standard' });
  expect(q100001.tier).toBe('GOLD');
  expect(q100001.total, 'E06 · ยอด ฿100,001 ซื้อ CPU-N7 ได้ราคา Gold').toBe(baht(10_441));
});

test('TC-ACCT-03 · Business ได้ 8% ไม่ขึ้นกับยอดสะสม — BR-03 · E07–E09 · Q21', async () => {
  await setClock(api, THU_1000);

  // E07 · C11 เป็น Business ที่ยอดสะสม ฿0 ก็ยังได้ 8% (Q21)
  //      SSD-1T ฿2,190 − 175 (8% = 175.20 ปัดลง) = 2,015 · G4 < ฿3,000 จึงมีค่าส่ง ฿60 → รวม ฿2,075
  const c11 = await me('C11');
  expect(c11.spend12m, 'C11 ยอดสะสม ฿0').toBe(0);
  expect(c11.tier, 'Business ตัดสินจากประเภทบัญชี ไม่ใช่ยอดสะสม').toBe('BUSINESS');
  expect(c11.memberRate).toBe(8);
  const q21 = await quote(api, { items: [{ sku: 'SSD-1T', qty: 1 }], user: 'C11', shipping: 'standard' });
  expect(q21.tier).toBe('BUSINESS');
  expect(q21.memberRate).toBe(8);
  expect(q21.memberDiscount, '8% ของ ฿2,190 = ฿175.20 ปัดลงเป็น ฿175').toBe(baht(175));
  expect(q21.shippingFee, 'G4 ฿2,015 ยังไม่ถึง ฿3,000').toBe(baht(60));
  expect(q21.total, 'E07 · Q21 · Business ยอด ฿0 ซื้อ SSD-1T').toBe(baht(2_075));

  // E08 · C5 เป็น Business ยอด ฿480,000 ก็ได้ 8% เท่ากัน · MON-27 ฿7,990 − 639 (8% = 639.20) = 7,351
  // ยอด ฿480,000 ของ C5 ครบก็ต่อเมื่อออเดอร์ BB-261112-0001 (จ่าย พฤ. 14:05) เข้ายอดแล้ว จึงต้องอ่านที่เวลาตั้งต้น ศ. 10:00
  // MON-27 ไม่ใช่ป้ายแดงและ 10:00 ก็อยู่นอกช่วง flash sale ราคาจึงเท่ากับวันพฤหัสทุกประการ
  await setClock(api, NOW_DEFAULT);
  const c5 = await me('C5');
  expect(c5.spend12m, 'C5 ยอดสะสมตั้งต้น').toBe(baht(480_000));
  expect(c5.tier).toBe('BUSINESS');
  expect(c5.memberRate, 'ยอดสูงก็ยังเป็น 8% เท่าเดิม ไม่เพิ่มตามยอด').toBe(8);
  const q480kBiz = await quote(api, { items: [{ sku: 'MON-27', qty: 1 }], user: 'C5', shipping: 'standard' });
  expect(q480kBiz.memberDiscount, '8% ของ ฿7,990 = ฿639.20 ปัดลงเป็น ฿639').toBe(baht(639));
  expect(q480kBiz.total, 'E08 · Business ยอด ฿480,000 ซื้อ MON-27').toBe(baht(7_351));

  // E09 · บัญชี **ทั่วไป** ที่ยอด ฿480,000 เท่ากันเป๊ะ ต้องได้ Gold 5% ไม่ใช่ 8%
  //      ดัน C4 (บัญชีบุคคล ไม่ใช่ Business) ขึ้นมาที่ ฿480,000 เพื่อเทียบกับ C5 แบบยอดเท่ากัน
  const c4 = await setSpendTo('C4', 480_000);
  expect(c4.taxId, 'C4 เป็นบัญชีบุคคล ไม่มีเลขผู้เสียภาษี').toBeNull();
  expect(c4.company, 'C4 ไม่มีชื่อบริษัท').toBeNull();
  expect(c4.tier, 'E09 · ยอดสูงแค่ไหนก็ไม่ทำให้บัญชีทั่วไปเป็น Business').toBe('GOLD');
  expect(c4.memberRate, 'E09 · ต้องเป็น 5% ไม่ใช่ 8%').toBe(5);
  const q480kGold = await quote(api, { items: [{ sku: 'MON-27', qty: 1 }], user: 'C4', shipping: 'standard' });
  expect(q480kGold.tier).toBe('GOLD');
  expect(q480kGold.memberDiscount, '5% ของ ฿7,990 = ฿399.50 ปัดลงเป็น ฿399').toBe(baht(399));
  expect(q480kGold.total, 'E09 · ทั่วไปยอด ฿480,000 ซื้อ MON-27 ต้องแพงกว่าของ Business').toBe(baht(7_591));
  expect(q480kGold.total, 'ยอดเท่ากันแต่ Business ถูกกว่า').toBeGreaterThan(q480kBiz.total);
});

// ─────────────── TC-CAT-04 · จำนวนที่ขายได้ = ในคลัง − ที่กันไว้ ───────────────

test('TC-CAT-04 · จำนวนที่ขายได้ = ในคลัง − ที่กันไว้ — FR-04 · BR-32', async () => {
  await setClock(api, THU_1000);

  const before = await adminStock('MB-B6');
  expect(before.onHand, 'MB-B6 ในคลังหลัง reset').toBe(6);
  expect(before.held, 'ยังไม่มีใครกันของ').toBe(0);
  expect(before.available).toBe(6);
  expect(await available(api, 'MB-B6'), 'หน้าเว็บเห็น 6 ชิ้น').toBe(6);

  // สั่ง 2 ชิ้นแล้ว **ไม่จ่าย** — ของต้องถูกกันทันทีตั้งแต่กดสั่ง ไม่ใช่ตอนจ่าย (BR-30)
  const order = await placeOrderOk(api, { items: [{ sku: 'MB-B6', qty: 2 }], user: 'C2', shipping: 'standard' });
  expect(order.status, 'ยังไม่จ่าย').toBe('PENDING');

  expect(await available(api, 'MB-B6'), 'จำนวนที่ขายได้ต้องลดทันที 6 → 4').toBe(4);
  const after = await adminStock('MB-B6');
  expect(after.onHand, 'ของยังอยู่ในคลังครบ 6 ชิ้น ยังไม่ได้ส่งออกไปไหน').toBe(6);
  expect(after.held, 'กันไว้ให้ออเดอร์ที่รอจ่าย 2 ชิ้น').toBe(2);
  expect(after.available, 'ขายได้ = ในคลัง 6 − ที่กันไว้ 2').toBe(4);

  // ยกเลิกออเดอร์ที่ยังไม่จ่าย → ของกลับมาขายได้ และยอดในคลังยังเท่าเดิม
  const cancel = await api.post(`/api/orders/${order.orderNo}/cancel`, { headers: asUser('C2') });
  expect(cancel.status(), `POST /api/orders/${order.orderNo}/cancel`).toBe(200);
  const released = await adminStock('MB-B6');
  expect(released.held, 'ยกเลิกแล้วไม่กันของอีก').toBe(0);
  expect(released.onHand, 'ในคลังไม่เปลี่ยนตลอดทั้งเรื่อง').toBe(6);
  expect(released.available).toBe(6);
});

// ──────────────────────── TC-NFR · คุณภาพ ────────────────────────

test('TC-NFR-03 · กันขายเกินอยู่ที่ชั้นข้อมูล ไม่ใช่แค่หน้าเว็บ — NFR-04', async () => {
  // ยิง `POST /api/orders` ตรงเข้า API ไม่เปิดเบราว์เซอร์เลย ปุ่มที่ disabled บนหน้าเว็บจึงช่วยอะไรไม่ได้

  // ของเหลือ 1 ชิ้น · 10 คำขอพร้อมกัน ต้องสำเร็จ 1
  expect(await available(api, 'GPU-V57'), 'GPU-V57 หลัง reset').toBe(1);
  const one = await fireConcurrent(10, 'GPU-V57');
  expect(one.other, 'ต้องไม่มี 5xx หรือสถานะแปลก').toHaveLength(0);
  expect(one.created.length, 'ของเหลือ 1 ชิ้น สำเร็จได้พอดี 1 คำขอ').toBe(1);
  expect(one.conflicts.length).toBe(9);
  for (const r of one.conflicts) {
    const body = await r.json();
    expect(body.error, 'ผู้แพ้ต้องได้ 409 OUT_OF_STOCK (ผู้ซื้อคนละเบอร์ จึงไม่ใช่เรื่องสิทธิ์คนละ 1 ใบ)').toBe('OUT_OF_STOCK');
    expect(typeof body.message, 'error ต้องมีข้อความไทย').toBe('string');
  }
  expect(await available(api, 'GPU-V57'), 'จำนวนที่ขายได้ห้ามติดลบ').toBe(0);

  // ของเหลือ 3 ชิ้น · 10 คำขอพร้อมกัน ต้องสำเร็จพอดี 3 ไม่ใช่ 4 (BR-32 "สำเร็จเท่าจำนวนที่เหลือ")
  expect(await available(api, 'MB-X7'), 'MB-X7 หลัง reset').toBe(3);
  const three = await fireConcurrent(10, 'MB-X7');
  expect(three.other, 'ต้องไม่มี 5xx หรือสถานะแปลก').toHaveLength(0);
  expect(three.created.length, 'สำเร็จเท่าจำนวนที่เหลือพอดี').toBe(3);
  expect(three.conflicts.length).toBe(7);
  expect(await available(api, 'MB-X7'), 'จำนวนที่ขายได้ห้ามติดลบ').toBe(0);

  // ชั้นข้อมูลต้องยังสมเหตุสมผลหลังโดนยิงรัว: ไม่มีจำนวนติดลบ และของในคลังไม่หายไปเกินที่ขายได้จริง
  const rows = (await (await api.get('/api/admin/stock', { headers: asUser('S1') })).json()) as any[];
  expect(rows.length, 'สินค้า 15 รายการ').toBe(15);
  for (const row of rows) {
    expect(row.available, `${row.sku} ขายได้ห้ามติดลบ`).toBeGreaterThanOrEqual(0);
    expect(row.held, `${row.sku} ที่กันไว้ห้ามติดลบ`).toBeGreaterThanOrEqual(0);
  }
  const v57 = rows.find((x) => x.sku === 'GPU-V57');
  expect(v57.onHand, 'ของในคลังไม่หายไปไหน ยังมี 1 ชิ้น แค่ถูกกันไว้').toBe(1);
  expect(v57.held, 'GPU-V57 ถูกกันไว้แค่ใบเดียวที่ชนะ').toBe(1);
  const x7 = rows.find((x) => x.sku === 'MB-X7');
  expect(x7.onHand, 'MB-X7 ยังอยู่ในคลัง 3 ชิ้น').toBe(3);
  expect(x7.held, 'MB-X7 ถูกกันไว้ 3 ชิ้นตามผู้ชนะ 3 คน').toBe(3);
});

test('TC-NFR-09 · ปล่อยของหมดเวลาภายใน 5 วินาที โดยไม่ต้องเปิดหน้าเว็บ — NFR-11 · A-17', async () => {
  await setClock(api, '2026-11-13T10:00:00+07:00');
  const before = await available(api, 'GPU-V57');
  expect(before).toBe(1);

  const order = await placeOrderOk(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C4', shipping: 'standard' });
  expect(order.holdUntil, 'กันของ 30 นาทีนับจากกดสั่ง (BR-30)').toBe('2026-11-13T10:30:00+07:00');
  expect(await available(api, 'GPU-V57'), 'กดสั่งแล้วของถูกกันทันที').toBe(before - 1);

  // ครบ 30:00 พอดี ยังอยู่ในเวลากันของ ของต้องยังไม่ถูกปล่อย (BR-30 · 30:00 ✓)
  await setClock(api, '2026-11-13T10:30:00+07:00');
  expect(await available(api, 'GPU-V57'), 'ที่ 30:00 พอดี ของยังถูกกันอยู่').toBe(before - 1);
  expect((await getOrder(api, order.orderNo, 'C4')).status, 'ที่ 30:00 ออเดอร์ยังรอจ่ายอยู่').toBe('PENDING');

  // 30:01 — อ่าน `available` ครั้งเดียว ไม่ poll ไม่เปิดเบราว์เซอร์ ต้องเห็นของกลับมาแล้วภายใน 5 วินาที
  const startedAt = Date.now();
  await setClock(api, '2026-11-13T10:30:01+07:00');
  const nowAvailable = await available(api, 'GPU-V57');
  const elapsedMs = Date.now() - startedAt;

  expect(nowAvailable, 'อ่านครั้งแรกหลัง 30:01 ของต้องกลับมาขายได้แล้ว ไม่ต้องรอให้ใครเปิดหน้าเว็บ').toBe(before);
  expect(elapsedMs, `NFR-11: ต้องปล่อยของภายใน 5 วินาที (ใช้ไป ${elapsedMs}ms)`).toBeLessThan(5_000);
  expect((await getOrder(api, order.orderNo, 'C4')).status, 'ออเดอร์ที่หมดเวลาเป็น EXPIRED').toBe('EXPIRED');

  // ของที่ปล่อยคืนต้องขายได้จริง ไม่ใช่แค่ตัวเลขสวย
  const again = await placeOrderOk(api, { items: [{ sku: 'GPU-V57', qty: 1 }], user: 'C3', shipping: 'standard' });
  expect(again.status).toBe('PENDING');
});

test('TC-NFR-10 · รหัสผ่านไม่ถูกเก็บเป็นข้อความตรง — NFR-12', async () => {
  const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
  const NEW_PASSWORD = 'Plaintext-Should-Never-Land-9';

  // `register` / `login` ตั้ง cookie `bb_session` ให้ context ที่ยิง จึงใช้ context แยกใบ
  // ไม่ให้ session ค้างไปรบกวน test อื่นที่ตั้งใจยิงแบบไม่ล็อกอิน
  const auth = await newApi();
  try {
    // สมัครบัญชีใหม่ด้วยรหัสผ่านที่เรารู้ เพื่อตรวจทั้งผู้ใช้ที่ seed มาและผู้ใช้ที่สมัครผ่าน API
    const reg = await auth.post('/api/auth/register', {
      data: { email: 'nfr10@bitbaan.test', password: NEW_PASSWORD, name: 'คุณเอ็นเอฟอาร์', phone: '081-000-0099' },
    });
    expect(reg.status(), `POST /api/auth/register → ${await reg.text()}`).toBe(201);
    expect(await reg.text(), 'คำตอบของ register ต้องไม่สะท้อนรหัสผ่านกลับมา').not.toContain(NEW_PASSWORD);

    const login = await auth.post('/api/auth/login', { data: { email: 'nfr10@bitbaan.test', password: NEW_PASSWORD } });
    expect(login.status(), 'เข้าสู่ระบบด้วยรหัสที่เพิ่งตั้งต้องได้').toBe(200);
    expect(await login.text(), 'คำตอบของ login ต้องไม่สะท้อนรหัสผ่านกลับมา').not.toContain(NEW_PASSWORD);

    const c3 = await auth.post('/api/auth/login', { data: { email: 'oat@bitbaan.test', password: PASSWORD } });
    expect(c3.status(), 'บัญชีที่ seed มาต้องยังเข้าสู่ระบบด้วย Bit12345 ได้ (แฮชต้องตรวจสอบได้จริง)').toBe(200);
    expect(await c3.text(), 'คำตอบของ login ต้องไม่สะท้อน Bit12345 กลับมา').not.toContain(PASSWORD);
    await expectError(
      await auth.post('/api/auth/login', { data: { email: 'oat@bitbaan.test', password: PASSWORD + 'x' } }),
      401, 'INVALID_LOGIN',
    );
  } finally {
    await auth.dispose();
  }

  // ของจริง: เปิดฐานข้อมูลดูตาราง users ตามที่ TEST-PLAN.md ระบุ
  await withDb(async (q) => {
    const users = await q('SELECT code, email, name, phone, role, company_name, tax_id, password_hash FROM users ORDER BY email');
    expect(users.length, 'ต้องมีผู้ใช้ที่ seed ไว้ 12 คน + ที่เพิ่งสมัคร 1 คน').toBe(13);

    for (const u of users) {
      expect(u.password_hash, `${u.email}: ห้ามเก็บรหัสผ่านเป็นข้อความตรง`).not.toBe(PASSWORD);
      expect(u.password_hash, `${u.email}: ห้ามเก็บรหัสผ่านเป็นข้อความตรง`).not.toBe(NEW_PASSWORD);
      expect(String(u.password_hash).toLowerCase(), `${u.email}: ห้ามมีคำว่า ${PASSWORD} ในช่องรหัสผ่าน`)
        .not.toContain(PASSWORD.toLowerCase());
      expect(u.password_hash, `${u.email}: ต้องเป็นแฮช bcrypt`).toMatch(BCRYPT);
    }

    // ทั้งแถวของทุกคน ไม่ใช่แค่ช่องรหัสผ่าน ต้องไม่มีคำว่า Bit12345 ซ่อนอยู่ที่ไหนเลย
    const leak = await q(
      `SELECT email FROM users
       WHERE concat_ws(' ', code, email, name, phone, role, company_name, tax_id, password_hash) ILIKE $1
          OR concat_ws(' ', code, email, name, phone, role, company_name, tax_id, password_hash) ILIKE $2`,
      [`%${PASSWORD}%`, `%${NEW_PASSWORD}%`],
    );
    expect(leak, `query users ต้องไม่พบคำว่า ${PASSWORD} ที่ใดเลย`).toEqual([]);

    // แฮชของคนที่สมัครผ่าน API ต้องเป็นของใหม่จริง ไม่ใช่ค่าที่ก๊อปมาจากคนอื่น
    const fresh = await q('SELECT password_hash FROM users WHERE email = $1', ['nfr10@bitbaan.test']);
    expect(fresh.length).toBe(1);
    expect(fresh[0].password_hash, 'แฮชของบัญชีที่สมัครใหม่').toMatch(BCRYPT);
    const seeded = users.filter((u: any) => u.code !== null).map((u: any) => u.password_hash);
    expect(seeded, 'รหัสผ่านที่สมัครใหม่ต่างจากของ seed จึงต้องได้แฮชคนละค่า').not.toContain(fresh[0].password_hash);
  });
});
