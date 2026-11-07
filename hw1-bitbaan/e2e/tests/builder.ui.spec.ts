import { test, expect, Page } from '@playwright/test';
import { available } from '../lib/api';
import { FULL_BUILD, NOW_DEFAULT, PASSWORD, PRODUCTS, SEED, USERS } from '../lib/data';

/**
 * ชั้น `ui` — หน้าจัดสเปก · หน้าลิงก์สเปก · ราคาสมาชิกในหน้าสินค้า (TEST-PLAN.md §2.1)
 * กฎและตัวเลขทั้งหมดอ้างจาก TEST-PLAN.md / REQUIREMENTS.md / TEST-DATA.md ไม่ได้อ่านจากหน้าจอมาตั้งเป็นค่าคาดหวัง
 * รัน 3 เบราว์เซอร์ตาม NFR-15 (ชื่อไฟล์ลงท้าย `.ui.spec.ts` ตาม playwright.config.ts)
 */
const reset = (page: Page) => page.request.post('/api/test/reset');
const setClock = (page: Page, now: string, running = false) => page.request.post('/api/test/clock', { data: { now, running } });

/** 7 หมวดของหน้าจัดสเปก ตาม FR-08 — ไม่มีจอ (MON) */
const BUILDER_CATS = ['cpu', 'mb', 'ram', 'gpu', 'ssd', 'psu', 'case'] as const;
/** สินค้าในหมวดนั้นตาม TEST-DATA.md ข้อ 3.1 (หมวด MON จะไม่ถูกหยิบเพราะไม่ได้อยู่ใน BUILDER_CATS) */
const skusOf = (cat: string) => PRODUCTS.filter((p) => p.cat === cat.toUpperCase()).map((p) => p.sku);
/** 6290 → "฿6,290.00" — รูปแบบเดียวกับ `thb()` ใน frontend/src/format.ts (รับเป็นบาท) */
const thb = (bahtAmount: number) => `฿${bahtAmount.toLocaleString('en-US')}.00`;

/**
 * หยิบตัวเลือกที่ **เปิดให้เลือกได้จริง** ในหมวดนั้น ณ สถานะสเปกปัจจุบัน
 *
 * เว็บปิดตัวเลือกที่ใส่กันไม่ได้ไว้ตั้งแต่แรกตาม FR-10 · BR-25 ถึง BR-28 ดังนั้น test ที่ต้องการแค่
 * "เปลี่ยนชิ้นแล้วราคาขยับ" ห้ามเดา SKU ปลายทางเอง ไม่งั้นจะไปชนกฎความเข้ากันได้แล้วแดงผิดเรื่อง
 * ราคาที่คืนมาอ่านจาก `PRODUCTS` (TEST-DATA.md ข้อ 3.1) ไม่ใช่จากหน้าจอ — หน้าจอเป็นสิ่งที่กำลังถูกตรวจ
 */
async function pickEnabledAlternative(
  page: Page,
  cat: string,
  exclude?: string,
): Promise<{ sku: string; price: number } | null> {
  const values = await page
    .getByTestId(`builder-select-${cat}`)
    .locator('option:not([disabled])')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  const sku = values.find((v) => v !== exclude);
  if (!sku) return null;
  const product = PRODUCTS.find((p) => p.sku === sku);
  if (!product) throw new Error(`ตัวเลือก ${sku} ไม่มีใน TEST-DATA.md ข้อ 3.1 — ข้อมูลเว็บกับเอกสารไม่ตรงกัน`);
  return { sku, price: product.price };
}

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test('TC-BUILD-01 · หน้าจัดสเปกมี 7 หมวด ไม่มีจอ เลือกหมวดละ 1 ชิ้น — FR-08', async ({ page }) => {
  await page.goto('/builder');

  // ครบ 7 หมวดพอดี ไม่ขาดไม่เกิน
  await expect(page.locator('[data-testid^="builder-select-"]'), 'ต้องมีช่องเลือก 7 หมวดพอดี').toHaveCount(7);
  for (const cat of BUILDER_CATS) {
    await expect(page.getByTestId(`builder-select-${cat}`), `ไม่พบ builder-select-${cat}`).toHaveCount(1);
  }
  // ไม่มีจอ: ไม่มีช่องหมวด MON และ MON-27 ต้องไม่โผล่เป็นตัวเลือกในหมวดไหนเลย
  await expect(page.getByTestId('builder-select-mon'), 'FR-08 บอกว่าไม่มีจอในหน้าจัดสเปก').toHaveCount(0);

  for (const cat of BUILDER_CATS) {
    const sel = page.getByTestId(`builder-select-${cat}`);
    const skus = skusOf(cat);
    expect(skus.length, `TEST-DATA.md ต้องมีสินค้าหมวด ${cat}`).toBeGreaterThan(0);
    // +1 คือบรรทัด "— ยังไม่ได้เลือก —" · จำนวนนี้บังคับให้รายการสินค้าโหลดเสร็จจริงก่อนจะไปตรวจ MON-27
    await expect(sel.locator('option'), `หมวด ${cat} ต้องมีตัวเลือกครบตาม TEST-DATA.md`).toHaveCount(skus.length + 1);
    for (const sku of skus) {
      await expect(sel.locator(`option[value="${sku}"]`), `หมวด ${cat} ต้องมี ${sku}`).toHaveCount(1);
    }
    expect(
      await sel.evaluate((el: HTMLSelectElement) => el.multiple),
      `หมวด ${cat} ต้องเลือกได้ชิ้นเดียว ห้ามเลือกหลายชิ้น`,
    ).toBe(false);
  }

  await expect(page.locator('[data-testid^="builder-select-"] option[value="MON-27"]'), 'MON-27 ต้องไม่อยู่ในตัวเลือกใดเลย').toHaveCount(0);

  // "หมวดละ 1 ชิ้น": เลือกซ้ำในหมวดเดิมแล้วต้องแทนที่ของเดิม ไม่ใช่สะสมเพิ่ม
  const cpu = page.getByTestId('builder-select-cpu');
  await cpu.selectOption('CPU-N7');
  await expect(cpu).toHaveValue('CPU-N7');
  await cpu.selectOption('CPU-N5');
  await expect(cpu, 'เลือกชิ้นใหม่ในหมวดเดิมต้องแทนที่ชิ้นเดิม').toHaveValue('CPU-N5');
  expect(
    await cpu.evaluate((el: HTMLSelectElement) => el.selectedOptions.length),
    'หมวด CPU ต้องมีของที่ถูกเลือกอยู่ชิ้นเดียว',
  ).toBe(1);
});

test('TC-BUILD-02 · ราคารวมอัปเดตทันทีโดยไม่โหลดหน้าใหม่ — FR-09', async ({ page }) => {
  await setClock(page, NOW_DEFAULT); // ศุกร์ 10:00 — ยังไม่เข้าช่วง flash sale ราคาจึงเป็นราคาป้าย
  await page.goto('/builder');

  // หลักฐานว่าหน้าไม่ถูกโหลดใหม่: ตัวแปรบน window จะหายทันทีถ้ามีการโหลดหน้าใหม่
  const SENTINEL = 'bitbaan-no-reload';
  await page.evaluate((v) => {
    (window as unknown as Record<string, unknown>).__bitbaanSentinel = v;
  }, SENTINEL);
  const navigations: string[] = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations.push(f.url());
  });

  const total = page.getByTestId('builder-total');
  await expect(total, 'ยังไม่เลือกอะไร ราคารวมเป็นศูนย์').toHaveText(thb(0));

  // เลือก/เปลี่ยน 3 ครั้ง · ราคาป้ายจาก TEST-DATA.md ข้อ 3.1
  await page.getByTestId('builder-select-cpu').selectOption('CPU-N5');
  await expect(total, 'ครั้งที่ 1 · CPU-N5 6,290').toHaveText(thb(6_290));

  await page.getByTestId('builder-select-mb').selectOption('MB-B6');
  await expect(total, 'ครั้งที่ 2 · + MB-B6 4,590').toHaveText(thb(10_880));

  await page.getByTestId('builder-select-ram').selectOption('RAM-D4');
  await expect(total, 'ครั้งที่ 3 · + RAM-D4 1,290').toHaveText(thb(12_170));

  // เปลี่ยนชิ้นเดิมเป็นชิ้นอื่นก็ต้องอัปเดตทันทีเหมือนกัน
  //
  // ห้าม hard-code SKU ปลายทาง: `MB-B6` เป็นบอร์ด socket NX-1 / DDR4 จึงรับได้แค่ `CPU-N5` กับ `RAM-D4`
  // ตัวเลือกที่เหลือถูกเว็บ **ปิดไว้ถูกต้องแล้ว** ตาม FR-10 · BR-25 · BR-26 (พิสูจน์แยกใน TC-BUILD-09)
  // test นี้วัด FR-09 (ราคารวมอัปเดตทันที) ไม่ได้วัดความเข้ากันได้ จึงต้องหยิบตัวเลือกที่ "เปิดอยู่จริง"
  // มาสลับ แล้วคิดราคาที่คาดหวังจาก TEST-DATA.md ข้อ 3.1 — ไม่ใช่อ่านจากหน้าจอ
  const swap = await pickEnabledAlternative(page, 'ssd');
  expect(swap, 'หมวด ssd ต้องมีอย่างน้อย 1 ตัวเลือกที่เลือกได้').not.toBeNull();
  await page.getByTestId('builder-select-ssd').selectOption(swap!.sku);
  await expect(
    total,
    `ครั้งที่ 4 · เพิ่ม ${swap!.sku} ฿${swap!.price.toLocaleString('en-US')} ราคารวมต้องเปลี่ยนทันที`,
  ).toHaveText(thb(12_170 + swap!.price));

  const swap2 = await pickEnabledAlternative(page, 'ssd', swap!.sku);
  if (swap2) {
    await page.getByTestId('builder-select-ssd').selectOption(swap2.sku);
    await expect(
      total,
      `ครั้งที่ 5 · สลับ ${swap!.sku} → ${swap2.sku} ราคารวมต้องเปลี่ยนตาม`,
    ).toHaveText(thb(12_170 + swap2.price));
  }

  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__bitbaanSentinel),
    'ถ้ามีการโหลดหน้าใหม่ ค่าบน window จะหายไป',
  ).toBe(SENTINEL);
  expect(navigations, `ต้องไม่มี navigation event ระหว่างเลือกสเปก แต่เจอ ${navigations.join(', ')}`).toEqual([]);
});

test('TC-BUILD-15 · หน้าลิงก์สเปกเป็นแบบอ่านอย่างเดียว — FR-19 · A-21', async ({ page }) => {
  await page.goto(`/b/${SEED.buildCode}`);
  await expect(page.getByTestId('build-item-cpu'), 'ลิงก์สเปก BEAM35K ต้องเปิดได้โดยไม่ต้องล็อกอิน').toBeVisible();
  await expect(page.locator('[data-testid^="build-item-"]'), 'BEAM35K มี 7 ชิ้นตาม TEST-DATA.md ข้อ 4').toHaveCount(FULL_BUILD.length);

  // อ่านอย่างเดียว: ห้ามมีช่องแก้สเปกในหน้านี้
  await expect(page.locator('[data-testid^="builder-select-"]'), 'หน้าลิงก์สเปกต้องไม่มีช่องเลือกชิ้นส่วน').toHaveCount(0);
  for (const cat of BUILDER_CATS) {
    await expect(page.getByTestId(`builder-select-${cat}`), `ไม่ควรมี builder-select-${cat} ในหน้าอ่านอย่างเดียว`).toHaveCount(0);
  }

  // ถ้าจะแก้ ต้องคัดลอกเป็นสเปกใหม่ (FR-19) · ปุ่มนี้ไม่มี data-testid จึงอ้างด้วย href ตามที่ frontend ใช้จริง
  const copy = page.locator(`a[href="/builder?build=${SEED.buildCode}"]`);
  await expect(copy, 'ต้องมีปุ่มคัดลอกเป็นสเปกใหม่').toHaveCount(1);
  await expect(copy).toBeVisible();
  await expect(copy).toContainText('สเปกใหม่');

  // และคนที่เปิดลิงก์ต้องสั่งเองได้ (FR-22)
  await expect(page.getByTestId('build-add-all')).toBeVisible();
  await expect(page.getByTestId('build-add-all')).toBeEnabled();

  // คัดลอกแล้วได้สเปกใหม่ที่ "แก้ได้" พร้อมของเดิมครบ — ของเดิมในลิงก์ไม่ถูกแตะ
  await copy.click();
  await expect(page).toHaveURL(new RegExp(`/builder\\?build=${SEED.buildCode}$`));
  await expect(page.locator('[data-testid^="builder-select-"]'), 'สเปกใหม่ต้องแก้ได้ครบ 7 หมวด').toHaveCount(7);
  await expect(page.getByTestId('builder-select-cpu')).toHaveValue('CPU-N5');
  await expect(page.getByTestId('builder-select-case')).toHaveValue('CASE-M');

  await page.goto(`/b/${SEED.buildCode}`);
  await expect(page.locator('[data-testid^="builder-select-"]'), 'ลิงก์เดิมต้องยังอ่านอย่างเดียวอยู่').toHaveCount(0);
});

test('TC-BUILD-17 · ลิงก์สเปกบอก "หมดแล้ว" ที่ชิ้นที่ขายไม่ได้ — FR-21', async ({ page }) => {
  // ขายหน้าร้านจนเคส CASE-M เหลือ 0 (FR-07 · S1) — จำนวนอ่านจากของจริงแทนการ hard-code
  const left = await available(page.request, 'CASE-M');
  expect(left, 'หลัง reset ต้องยังมี CASE-M ให้ขาย').toBeGreaterThan(0);
  const sale = await page.request.post('/api/admin/store-sale', { data: { sku: 'CASE-M', qty: left }, headers: { 'X-Test-User': 'S1' } });
  expect(sale.status(), await sale.text()).toBe(200);
  expect(await available(page.request, 'CASE-M'), 'CASE-M ต้องเหลือ 0').toBe(0);

  await page.goto(`/b/${SEED.buildCode}`);
  await expect(page.getByTestId('build-sold-out-case'), 'เคสที่ขายไม่ได้แล้วต้องขึ้น "หมดแล้ว"').toBeVisible();
  await expect(page.getByTestId('build-sold-out-case')).toContainText('หมดแล้ว');

  // ป้ายต้องขึ้นเฉพาะชิ้นที่หมด ไม่เหวี่ยงไปทั้งสเปก
  for (const cat of BUILDER_CATS.filter((c) => c !== 'case')) {
    await expect(page.getByTestId(`build-sold-out-${cat}`), `${cat} ยังมีของ ต้องไม่ขึ้น "หมดแล้ว"`).toHaveCount(0);
  }

  // ไม่ตัดชิ้นนั้นออกเงียบ ๆ: ยังอยู่ในรายการครบ 7 ชิ้น และเตือนก่อนกดใส่ตะกร้า
  await expect(page.getByTestId('build-item-case'), 'ห้ามซ่อนชิ้นที่หมดทิ้งไป').toBeVisible();
  await expect(page.locator('[data-testid^="build-item-"]')).toHaveCount(FULL_BUILD.length);
  await expect(page.getByText(/มีชิ้นที่หมดแล้ว/), 'ต้องเตือนก่อนกดใส่ตะกร้าทั้งชุด').toBeVisible();

  // กดใส่ตะกร้าทั้งชุดแล้ว ชิ้นที่หมดต้องยังติดไปด้วย พร้อมบอกว่าหมด (ไม่ถูกตัดออกเงียบ ๆ)
  await page.getByTestId('build-add-all').click();
  await expect(page).toHaveURL(/\/cart$/);
  for (const sku of FULL_BUILD) {
    await expect(page.getByTestId(`cart-line-${sku}`), `${sku} ต้องอยู่ในตะกร้า`).toBeVisible();
  }
  await expect(page.getByTestId('cart-line-CASE-M'), 'ตะกร้าต้องบอกว่าเคสหมด').toContainText('สินค้าหมด');
});

test('TC-CAT-09 · หน้าสินค้าแสดงราคาหลังส่วนลดสมาชิกของคนที่ล็อกอิน — FR-59 · A-42', async ({ page }) => {
  // ยังไม่ล็อกอิน: ไม่มีบรรทัดราคาสมาชิก
  await page.goto('/products/GPU-V57');
  await expect(page.getByTestId('product-price'), 'ราคาป้าย GPU-V57').toContainText('23,990');
  await expect(page.getByTestId('member-price'), 'ไม่ล็อกอินต้องไม่มีบรรทัดราคาสมาชิก').toHaveCount(0);

  // C3 = คุณโอ๊ต Silver 3% (TEST-DATA.md ข้อ 2)
  await page.goto('/login');
  await page.getByTestId('login-email').fill(USERS.C3.email!);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('nav-account'), 'ต้องล็อกอินสำเร็จก่อนจึงเปิดหน้าสินค้า').toBeVisible();

  await page.goto('/products/GPU-V57');
  // FR-59: 23,990 − 719 = 23,271 (ตัดเศษเป็นบาทเต็ม ไม่ใช่ 23,270.30)
  await expect(page.getByTestId('member-price')).toHaveText(thb(23_271));
  await expect(page.getByTestId('member-price'), 'ห้ามเป็น 23,270.30').not.toContainText('23,270');
  await expect(page.getByTestId('product-price'), 'ราคาป้ายต้องยังเห็นอยู่').toContainText('23,990');
});
