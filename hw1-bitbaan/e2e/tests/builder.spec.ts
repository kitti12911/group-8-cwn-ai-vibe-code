import { test, expect, APIRequestContext } from '@playwright/test';
import { newApi, reset, setClock, evaluateBuild } from '../lib/api';
import { baht, THU_1000, FRI_1230, SEED } from '../lib/data';

/** หน้าจัดสเปก — TEST-PLAN.md §3.2 */
let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });
test.beforeEach(async () => { await reset(api); });

const codes = (r: any) => r.conflicts.map((c: any) => c.code).sort();

test('TC-BUILD-03 · CPU กับเมนบอร์ดต้อง socket เดียวกัน — BR-25 · E76–E79', async () => {
  expect(codes(await evaluateBuild(api, { cpu: 'CPU-N5', mb: 'MB-B6' })), 'NX-1 = NX-1').toEqual([]);
  expect(codes(await evaluateBuild(api, { cpu: 'CPU-N5', mb: 'MB-X7' }))).toContain('SOCKET_MISMATCH');
  expect(codes(await evaluateBuild(api, { cpu: 'CPU-N7', mb: 'MB-B6' }))).toContain('SOCKET_MISMATCH');

  const bad = await evaluateBuild(api, { cpu: 'CPU-N5', mb: 'MB-X7' });
  expect(bad.canAddToCart, 'มี conflict ต้องใส่ตะกร้าไม่ได้ (FR-12)').toBe(false);
  expect(bad.conflicts[0].message, 'ต้องบอกเหตุผลเป็นข้อความ').toMatch(/socket/i);
});

test('TC-BUILD-04 · แรมต้องตรงแบบกับเมนบอร์ด — BR-26 · E80–E83', async () => {
  expect(codes(await evaluateBuild(api, { mb: 'MB-B6', ram: 'RAM-D4' }))).toEqual([]);
  expect(codes(await evaluateBuild(api, { mb: 'MB-B6', ram: 'RAM-16' }))).toContain('RAM_MISMATCH');
  expect(codes(await evaluateBuild(api, { mb: 'MB-X7', ram: 'RAM-D4' }))).toContain('RAM_MISMATCH');
  expect(codes(await evaluateBuild(api, { mb: 'MB-X7', ram: 'RAM-32' }))).toEqual([]);
});

test('TC-BUILD-05 · การ์ดจอต้องไม่ยาวเกินที่เคสรับ — BR-27 · E84–E89', async () => {
  expect(codes(await evaluateBuild(api, { gpu: 'GPU-V46', case: 'CASE-M' })), '240 ≤ 300').toEqual([]);
  expect(codes(await evaluateBuild(api, { gpu: 'GPU-V57', case: 'CASE-M' })), '310 > 300').toContain('GPU_TOO_LONG');
  expect(codes(await evaluateBuild(api, { gpu: 'GPU-V57', case: 'CASE-L' })), '310 ≤ 380').toEqual([]);
});

test('TC-BUILD-06 · ขนาดเมนบอร์ดต้องอยู่ในรายการที่เคสรับ — BR-28 · E90–E93', async () => {
  expect(codes(await evaluateBuild(api, { mb: 'MB-B6', case: 'CASE-M' })), 'mATX ลง CASE-M ได้').toEqual([]);
  expect(codes(await evaluateBuild(api, { mb: 'MB-X7', case: 'CASE-M' })), 'ATX ลง CASE-M ไม่ได้').toContain('FORM_FACTOR');
  expect(codes(await evaluateBuild(api, { mb: 'MB-X7', case: 'CASE-L' }))).toEqual([]);
  expect(codes(await evaluateBuild(api, { mb: 'MB-B6', case: 'CASE-L' }))).toEqual([]);
});

test('TC-BUILD-07 · เตือนพาวเวอร์ไม่พอ แต่ไม่บล็อก — BR-29 · FR-13 · E94–E100', async () => {
  const ok = await evaluateBuild(api, { gpu: 'GPU-V46', psu: 'PSU-550' });
  expect(ok.warnings, '550W = ที่แนะนำพอดี ไม่เตือน').toEqual([]);

  const low = await evaluateBuild(api, { gpu: 'GPU-V57', psu: 'PSU-550' });
  expect(low.warnings.map((w: any) => w.code)).toContain('PSU_LOW');
  expect(low.canAddToCart, 'คำเตือนต้องไม่บล็อกการใส่ตะกร้า').toBe(true);
  expect(low.warnings[0].suggestSku, 'ต้องเสนอตัวที่พอ').toBe('PSU-750');

  const high = await evaluateBuild(api, { gpu: 'GPU-V57', psu: 'PSU-750' });
  expect(high.warnings).toEqual([]);

  const noGpu = await evaluateBuild(api, { psu: 'PSU-550' });
  expect(noGpu.warnings, 'ไม่มีการ์ดจอ ไม่ต้องเตือน').toEqual([]);
});

test('TC-BUILD-08 · ตรวจความเข้ากันได้ทั้ง 2 ทิศ ไม่ว่าเลือกหมวดไหนก่อน — FR-11', async () => {
  const a = await evaluateBuild(api, { cpu: 'CPU-N5', mb: 'MB-X7', ram: null, gpu: null, ssd: null, psu: null, case: null });
  const b = await evaluateBuild(api, { mb: 'MB-X7', cpu: 'CPU-N5' });
  expect(codes(a)).toEqual(codes(b));
});

test('TC-BUILD-09 · ตัวเลือกที่ใส่ไม่ได้ถูกปิดพร้อมเหตุผล — FR-10 · A-19', async () => {
  const r = await evaluateBuild(api, { mb: 'MB-B6' });
  const ramOptions = r.options.ram as any[];
  const ddr5 = ramOptions.find((o) => o.sku === 'RAM-16');
  expect(ddr5.allowed, 'บอร์ด DDR4 ต้องเลือกแรม DDR5 ไม่ได้').toBe(false);
  expect(ddr5.reason, 'ต้องบอกเหตุผล').toBeTruthy();
  const ddr4 = ramOptions.find((o) => o.sku === 'RAM-D4');
  expect(ddr4.allowed).toBe(true);
});

test('TC-BUILD-11 · งบที่เหลือคิดจากราคาสินค้าตอนนี้ ไม่รวมค่าประกอบ — BR-35 · E119–E122', async () => {
  await setClock(api, THU_1000);
  const parts = { cpu: 'CPU-N5', mb: 'MB-B6', ram: 'RAM-D4', gpu: 'GPU-V46', ssd: 'SSD-1T', psu: 'PSU-550', case: 'CASE-M' };
  const b1 = await evaluateBuild(api, parts, { budget: baht(35_000), assembly: true });
  expect(b1.total, 'ครบชุดราคาป้าย').toBe(baht(29_430));
  expect(b1.remaining, 'B1 · เหลือ ฿5,570').toBe(baht(5_570));
  expect(b1.overBudget).toBe(false);
  expect(b1.assemblyFee, 'ครบ 7 หมวด ประกอบฟรี').toBe(0);

  // งบพอดีและเกินงบ
  const exact = await evaluateBuild(api, parts, { budget: baht(29_430) });
  expect(exact.remaining).toBe(0);
  expect(exact.overBudget).toBe(false);
  const over = await evaluateBuild(api, parts, { budget: baht(29_429) });
  expect(over.overBudget, 'เกินงบ ฿1').toBe(true);
  expect(over.canAddToCart, 'เกินงบยังใส่ตะกร้าได้ (A-35)').toBe(true);

  // ราคาในหน้าจัดสเปกใช้ราคา flash sale ถ้าอยู่ในช่วง
  await setClock(api, FRI_1230);
  const b1b = await evaluateBuild(api, parts, { budget: baht(35_000), assembly: true });
  expect(b1b.total, 'ช่วง flash sale ลด 4 ชิ้น').toBe(baht(27_603));
  expect(b1b.remaining, 'B1b · เหลือ ฿7,397').toBe(baht(7_397));
});

test('TC-BUILD-12 · ขาดหมวดไหนบ้างและค่าประกอบเมื่อยังไม่ครบ — FR-17', async () => {
  const r = await evaluateBuild(api, { cpu: 'CPU-N5', mb: 'MB-B6' }, { assembly: true });
  expect(r.missingCategories.sort()).toEqual(['case', 'gpu', 'psu', 'ram', 'ssd']);
  expect(r.assemblyFee).toBe(baht(500));
});

test('TC-BUILD-16 · ลิงก์สเปกแสดงราคาปัจจุบันและส่วนต่าง — FR-20 · B1b', async () => {
  await setClock(api, FRI_1230);
  const r = await (await api.get(`/api/builds/${SEED.buildCode}`)).json();
  const diff = Object.fromEntries(r.items.map((i: any) => [i.sku, i.diff]));
  expect(diff['MB-B6'], 'MB-B6 ถูกลง 459').toBe(-baht(459));
  expect(diff['GPU-V46'], 'GPU-V46 ถูกลง 1,149').toBe(-baht(1_149));
  expect(diff['SSD-1T'], 'SSD-1T ถูกลง 219').toBe(-baht(219));
  expect(diff['CPU-N5'], 'ไม่ใช่ป้ายแดง ราคาเท่าเดิม').toBe(0);
  expect(r.evaluation.remaining, 'B1b · เหลือ ฿7,397').toBe(baht(7_397));
});

test('TC-BUILD-14 · บันทึกสเปกแล้วเปิดลิงก์ได้โดยไม่ล็อกอิน — FR-18', async () => {
  const saved = await api.post('/api/builds', { data: { parts: { cpu: 'CPU-N5', mb: 'MB-B6' }, assembly: false } });
  expect(saved.status()).toBe(201);
  const { code } = await saved.json();
  expect(code).toHaveLength(8);
  const open = await api.get(`/api/builds/${code}`);
  expect(open.status(), 'คนไม่ล็อกอินเปิดได้').toBe(200);
  expect((await api.get('/api/builds/NOPE1234')).status()).toBe(404);
});
