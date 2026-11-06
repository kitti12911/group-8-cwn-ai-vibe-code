import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, available, GUEST, ADDRESS } from '../lib/api';

/**
 * test "แบบบท 04" ที่ยิงทีละคำขอด้วย `await`
 *
 * เก็บไว้เป็น **ตัวเทียบ** ไม่ใช่เพื่อหาบั๊ก — ใน `RACE-REPORT.md` ใช้พิสูจน์ว่า
 * ไฟล์นี้ **ผ่านทั้งที่โค้ดกันของพัง** ส่วน `api-race.spec.ts` ที่ยิงพร้อมกันจับได้
 * ถ้าทีมมีแต่ test แบบนี้ จะไม่มีวันเจอบั๊ก check-then-insert
 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });

const buy = (k: number) =>
  api.post('/api/orders', {
    data: {
      items: [{ sku: 'GPU-V57', qty: 1 }],
      shipping: 'standard',
      guest: { ...GUEST, name: `ผู้ซื้อ ${k}`, phone: `0830000${String(k).padStart(3, '0')}`, email: `seq${k}@bitbaan.test` },
      address: ADDRESS,
    },
  });

test('ตัวเทียบ · ยิงทีละคำขอ (await) — ผ่านเสมอ แม้โค้ดกันของจะพัง', async () => {
  await reset(api);
  expect(await available(api, 'GPU-V57')).toBe(1);

  const first = await buy(1);     // ← await ทีละตัว: คำขอที่ 2 เริ่มหลังคำขอแรกจบแล้ว
  expect(first.status()).toBe(201);

  const second = await buy(2);
  expect(second.status(), 'คนที่สองต้องถูกปฏิเสธ').toBe(409);
  expect((await second.json()).error).toBe('OUT_OF_STOCK');
});
