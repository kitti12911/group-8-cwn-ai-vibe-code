import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, placeOrder, available, asUser, GUEST, ADDRESS } from '../lib/api';

/**
 * การบ้านขั้น 2 · TC-RACE-01 / 03 / 04 / 05
 *
 * หัวใจคือ **ยิงพร้อมกันจริง** ด้วย `Promise.all` ไม่ใช่ `await` ทีละตัว
 * test ที่ยิงทีละตัวจะผ่านเสมอแม้เว็บเขียนแบบ check-then-insert จึงจับบั๊กชนิดนี้ไม่ได้เลย
 *
 * จำนวนรอบปรับได้: `ROUNDS=5 npm run test:race` (ค่าตั้งต้น 50 ตามโจทย์)
 */
const ROUNDS = Number(process.env.ROUNDS ?? 50);
const CONCURRENCY = [2, 5, 10];

let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });

test.describe.configure({ timeout: 600_000 });

/** ผู้ซื้อคนละคนจริง ๆ — สิทธิ์ "คนละ 1 ใบ" ของคนไม่ล็อกอินนับตามเบอร์โทร (BR-31 · A-18) */
const guestPhone = (n: number) => `0820000${String(n).padStart(3, '0')}`;

async function fireConcurrent(n: number, sku: string) {
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: n }, (_, k) =>
      api.post('/api/orders', {
        data: {
          items: [{ sku, qty: 1 }],
          shipping: 'standard',
          guest: { ...GUEST, name: `ผู้ซื้อ ${k}`, phone: guestPhone(k), email: `buyer${k}@bitbaan.test` },
          address: ADDRESS,
        },
      }),
    ),
  );
  const ms = Date.now() - started;
  const created = results.filter((r) => r.status() === 201);
  const conflicts = results.filter((r) => r.status() === 409);
  const other = results.filter((r) => r.status() !== 201 && r.status() !== 409);
  return { created, conflicts, other, ms };
}

for (const n of CONCURRENCY) {
  test(`TC-RACE-01 · ของเหลือ 1 ใบ · ยิงพร้อมกัน ${n} คำขอ × ${ROUNDS} รอบ ต้องมีผู้ชนะ 1 คนทุกรอบ`, async () => {
    const latencies: number[] = [];
    const losers: Record<string, number> = {};

    for (let round = 1; round <= ROUNDS; round++) {
      await reset(api);
      expect(await available(api, 'GPU-V57'), `รอบ ${round} ของตั้งต้น`).toBe(1);

      const { created, conflicts, other, ms } = await fireConcurrent(n, 'GPU-V57');
      latencies.push(ms);

      expect(other, `รอบ ${round} ต้องไม่มี 5xx หรือสถานะแปลก`).toHaveLength(0);
      expect(created.length, `รอบ ${round} · N=${n} ต้องสำเร็จพอดี 1 คำขอ`).toBe(1);
      expect(conflicts.length, `รอบ ${round} ที่เหลือต้องได้ 409`).toBe(n - 1);

      for (const r of conflicts) {
        const code = (await r.json()).error;
        losers[code] = (losers[code] ?? 0) + 1;
      }

      // ฐานข้อมูลต้องมีการจอง GPU-V57 แค่ 1 รายการ และของต้องเหลือ 0 ไม่ติดลบ
      expect(await available(api, 'GPU-V57'), `รอบ ${round} ของต้องเหลือ 0`).toBe(0);
      const orders = await (await api.get('/api/admin/orders?date=2026-11-13', { headers: asUser('S1') })).json();
      const withV57 = orders.filter((o: any) => o.quote.lines.some((l: any) => l.sku === 'GPU-V57'));
      expect(withV57, `รอบ ${round} ต้องมีออเดอร์ที่ได้ GPU-V57 แค่ใบเดียว`).toHaveLength(1);
    }

    latencies.sort((a, b) => a - b);
    console.log(`[TC-RACE-01] N=${n} · ${ROUNDS} รอบ · เวลาตอบ p50=${latencies[Math.floor(latencies.length / 2)]}ms p95=${latencies[Math.floor(latencies.length * 0.95)]}ms · สาเหตุที่แพ้: ${JSON.stringify(losers)}`);
  });
}

test('TC-RACE-03 · บัญชีเดียวกัน 2 แท็บ แย่งสิทธิ์คนละ 1 ใบ ทั้งที่ของมี 3 ใบ — BR-31', async () => {
  await reset(api);
  // เปิดล็อตใหม่ 16 พ.ย. 10:00 → GPU-V57 มี 3 ใบ
  await setClock(api, '2026-11-16T10:00:01+07:00');
  await expect.poll(async () => available(api, 'GPU-V57'), { timeout: 5_000 }).toBe(3);

  const body = { items: [{ sku: 'GPU-V57', qty: 1 }], shipping: 'standard', address: ADDRESS };
  const [a, b] = await Promise.all([
    api.post('/api/orders', { data: body, headers: asUser('C4') }),
    api.post('/api/orders', { data: body, headers: asUser('C4') }),
  ]);
  const statuses = [a.status(), b.status()].sort();
  expect(statuses, 'บัญชีเดียวกันต้องได้แค่ใบเดียว แม้ของยังเหลือ').toEqual([201, 409]);
  const loser = a.status() === 409 ? a : b;
  expect((await loser.json()).error).toBe('LIMIT_REACHED');
  expect(await available(api, 'GPU-V57'), 'ของต้องถูกกันแค่ 1 ใบ').toBe(2);
});

test('TC-RACE-04 · NEWBIT200 ใช้ได้ครั้งเดียวแม้กดพร้อมกัน 2 แท็บ — BR-17 · E52', async () => {
  await reset(api);
  await setClock(api, '2026-11-12T10:00:00+07:00');
  const body = { items: [{ sku: 'CPU-N5', qty: 1 }], shipping: 'standard', coupon: 'NEWBIT200', address: ADDRESS };
  const [a, b] = await Promise.all([
    api.post('/api/orders', { data: body, headers: asUser('C2') }),
    api.post('/api/orders', { data: body, headers: asUser('C2') }),
  ]);
  const statuses = [a.status(), b.status()].sort();
  expect(statuses, 'โค้ดออเดอร์แรกต้องใช้ได้ใบเดียว').toEqual([201, 409]);
  const loser = a.status() === 409 ? a : b;
  expect((await loser.json()).error).toBe('COUPON_USED');
});

test('TC-RACE-05 · ของเหลือ 4 ชิ้น ยิงพร้อมกัน 10 คำขอ ต้องสำเร็จพอดี 4 — BR-32 · E110–E112', async () => {
  await reset(api);
  expect(await available(api, 'GPU-V46')).toBe(4);
  const { created, conflicts, other } = await fireConcurrent(10, 'GPU-V46');
  expect(other).toHaveLength(0);
  expect(created.length, 'สำเร็จเท่าจำนวนที่เหลือพอดี').toBe(4);
  expect(conflicts.length).toBe(6);
  expect(await available(api, 'GPU-V46'), 'จำนวนที่ขายได้ห้ามติดลบ').toBe(0);
});
