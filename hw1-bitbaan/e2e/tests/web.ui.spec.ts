import { test, expect, Page } from '@playwright/test';
import { see } from '../lib/see';

/**
 * ชั้น `ui` — เฉพาะสิ่งที่ลูกค้าต้อง **เห็น** หรือ **กด** (TEST-PLAN.md §2.1)
 * ตัวเลขทั้งหมดถูกพิสูจน์ที่ชั้น api แล้ว ที่นี่ตรวจว่าหน้าเว็บแสดงและใช้งานได้จริง
 * รัน 3 เบราว์เซอร์ตาม NFR-15 · `npm run test:ui`
 */
const reset = (page: Page) => page.request.post('/api/test/reset');
const setClock = (page: Page, now: string, running = false) => page.request.post('/api/test/clock', { data: { now, running } });

/** อ่านตัวเลขบาทจาก data-testid เช่น "9,624.00" → 9624 */
async function money(page: Page, testid: string): Promise<number> {
  const raw = (await page.getByTestId(testid).innerText()).replace(/[^0-9.-]/g, '');
  return Number(raw);
}

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test('TC-CAT-05 · ป้าย flash sale และราคาขีดฆ่าแสดงเฉพาะในช่วง — FR-05', async ({ page }) => {
  await setClock(page, '2026-11-13T12:30:00+07:00');
  await page.goto('/products');
  await expect(await see(page.getByTestId('flash-banner'))).toHaveAttribute('data-active', 'true');
  await expect(await see(page.getByTestId('product-flash-price-MB-B6'))).toContainText('4,131');
  await expect(await see(page.getByTestId('product-price-MB-B6')), 'ราคาเดิมต้องยังเห็นอยู่ (ขีดฆ่า)').toContainText('4,590');

  await setClock(page, '2026-11-13T13:00:00+07:00');
  await page.goto('/products');
  await expect(await see(page.getByTestId('flash-banner'))).toHaveAttribute('data-active', 'false');
  await expect(await see(page.getByTestId('product-flash-price-MB-B6'))).toHaveCount(0);
});

test('TC-CAT-03 · สินค้าที่ขายไม่ได้แล้ว ปุ่มใส่ตะกร้ากดไม่ได้ — FR-03', async ({ page }) => {
  // ขายหน้าร้านจนหมด แล้วหน้าเว็บต้องเห็นทันที (FR-07 · S1)
  await page.request.post('/api/admin/store-sale', { data: { sku: 'GPU-V57', qty: 1 }, headers: { 'X-Test-User': 'S1' } });
  await page.goto('/products');
  await expect(await see(page.getByTestId('product-stock-GPU-V57'))).toContainText('หมด');
  await expect(await see(page.getByTestId('add-to-cart-GPU-V57'))).toBeDisabled();
});

test('TC-PRICE-11 · ใบสรุปราคาบวกลบลงตัวและเรียงตามลำดับของร้าน — FR-24 · FR-25', async ({ page }) => {
  await setClock(page, '2026-11-13T12:30:00+07:00');
  await page.goto('/products');
  await page.getByTestId('add-to-cart-CPU-N5').click();
  await page.getByTestId('add-to-cart-MB-B6').click();
  await expect(await see(page.getByTestId('nav-cart-count'))).toContainText('2');

  await page.goto('/cart');
  await expect(await see(page.getByTestId('cart-line-CPU-N5'))).toBeVisible();

  // ไม่ล็อกอิน: ไม่มีบรรทัดส่วนลดสมาชิก · Q03 ของ C3 พิสูจน์ที่ชั้น api แล้ว
  const list = await money(page, 'quote-list-total');
  const flash = await money(page, 'quote-flash');
  const bundle = await money(page, 'quote-bundle');
  const total = await money(page, 'quote-total');
  expect(list, 'ราคาป้าย 6,290 + 4,590').toBe(10_880);
  expect(Math.abs(flash), 'flash 10% ของ MB-B6').toBe(459);
  expect(Math.abs(bundle), 'ชุดประกอบ CPU + เมนบอร์ด').toBe(500);
  expect(total, 'ยอดชำระ = 10,880 − 459 − 500 · ส่งฟรีเพราะเกิน ฿3,000').toBe(9_921);

  const vat = await money(page, 'quote-vat');
  const preVat = await money(page, 'quote-pre-vat');
  expect(Math.round((vat + preVat) * 100), 'VAT + ก่อน VAT = ยอดชำระ').toBe(total * 100);
});

test('TC-ORDER-05 · หน้าจ่ายเงินแสดงเวลาที่กันถึงและนับถอยหลัง — FR-39 · NFR-16', async ({ page }) => {
  await setClock(page, '2026-11-13T10:00:00+07:00', true);
  await page.goto('/products');
  await page.getByTestId('add-to-cart-SSD-1T').click();
  await page.goto('/cart');

  await page.getByTestId('guest-name').fill('คุณบีม');
  await page.getByTestId('guest-phone').fill('0810000001');
  await page.getByTestId('guest-email').fill('beam@bitbaan.test');
  await page.getByTestId('address-line').fill('99/1 ถนนบรมราชชนนี');
  await page.getByTestId('address-province').selectOption('กรุงเทพมหานคร');
  await page.getByTestId('place-order').click();

  await expect(page).toHaveURL(/\/checkout\/BB-261113-\d{4}/);
  await expect(await see(page.getByTestId('order-no'))).toContainText('BB-261113-');
  await expect(await see(page.getByTestId('hold-until')), 'กันของถึง 10:30').toContainText('10:30');
  await expect(await see(page.getByTestId('countdown'))).toContainText(/^\d{1,2}:\d{2}$/);

  await page.getByTestId('pay-promptpay').click();
  await expect(await see(page.getByTestId('order-status'))).toHaveAttribute('data-status', 'PAID');
});

test('TC-BUILD-09 · ตัวเลือกที่ใส่กันไม่ได้ถูกปิดพร้อมเหตุผล — FR-10 · BR-25 · BR-26', async ({ page }) => {
  await page.goto('/builder');
  await page.getByTestId('builder-select-cpu').selectOption('CPU-N5');   // socket NX-1

  const mbX7 = page.getByTestId('builder-select-mb').locator('option[value="MB-X7"]');
  await expect(mbX7, 'บอร์ด NX-2 ต้องกดเลือกไม่ได้').toBeDisabled();
  await expect(mbX7, 'ต้องบอกเหตุผลในตัวเลือกเอง').toContainText('ใส่ไม่ได้');
  await expect(await see(page.getByTestId('builder-reason-mb')), 'ต้องมีรายการเหตุผลใต้ช่องเลือก').toContainText('socket');

  // เลือกบอร์ดที่เข้ากันได้ แล้วแรม DDR5 ต้องถูกปิดตาม BR-26
  await page.getByTestId('builder-select-mb').selectOption('MB-B6');      // DDR4
  await expect((await see(page.getByTestId('builder-select-ram'))).locator('option[value="RAM-16"]')).toBeDisabled();
  await expect((await see(page.getByTestId('builder-select-ram'))).locator('option[value="RAM-D4"]')).toBeEnabled();
});

test('TC-BUILD-10 · เปลี่ยนการ์ดจอแล้วพาวเวอร์ไม่พอ ต้องเตือน ไม่ถอดให้เอง — FR-14', async ({ page }) => {
  await page.goto('/builder');
  await page.getByTestId('builder-select-gpu').selectOption('GPU-V46');
  await page.getByTestId('builder-select-psu').selectOption('PSU-550');
  await expect(await see(page.getByTestId('builder-warning-psu'))).toHaveCount(0);

  await page.getByTestId('builder-select-gpu').selectOption('GPU-V57');
  await expect(await see(page.getByTestId('builder-warning-psu'))).toBeVisible();
  await expect(await see(page.getByTestId('builder-select-psu')), 'ห้ามถอดพาวเวอร์ให้เอง').toHaveValue('PSU-550');
  await expect(await see(page.getByTestId('psu-upgrade'))).toBeVisible();
  await expect(await see(page.getByTestId('psu-keep'))).toBeVisible();
});

test('TC-NFR-08 · ทุกหน้ามี data-bug-mode ตรงกับโหมดจริง', async ({ page }) => {
  const { bugMode } = await (await page.request.get('/api/test/bug-mode')).json();
  for (const path of ['/', '/products', '/builder', '/cart', '/login']) {
    await page.goto(path);
    await expect(page.locator('body')).toHaveAttribute('data-bug-mode', String(bugMode));
  }
});

test('TC-NFR-01 · ใช้บนมือถือกว้าง 375px ได้ทุกหน้า ไม่มีเลื่อนซ้ายขวา — NFR-01', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ['/', '/products', '/products/GPU-V46', '/builder', '/cart', '/login', '/account']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `หน้า ${path} ล้นออกนอกจอ ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test('TC-NFR-07 · ปุ่มและบรรทัดราคามีชื่อให้เครื่องมือหาเจอ — NFR-09', async ({ page }) => {
  await page.goto('/products');
  for (const id of ['nav-cart-count', 'nav-login', 'flash-banner', 'product-card-CPU-N5', 'add-to-cart-CPU-N5']) {
    await expect(await see(page.getByTestId(id)), `ไม่พบ ${id}`).toHaveCount(1);
  }
  await page.goto('/login');
  for (const id of ['login-email', 'login-password', 'login-submit', 'tab-register', 'tab-business']) {
    await expect(await see(page.getByTestId(id)), `ไม่พบ ${id}`).toHaveCount(1);
  }
  await page.goto('/login?tab=business');
  for (const id of ['register-name', 'register-phone', 'register-email', 'register-password', 'register-company', 'register-tax-id', 'register-submit']) {
    await expect(await see(page.getByTestId(id)), `ไม่พบ ${id} ในแท็บสมัคร Business`).toHaveCount(1);
  }
});

test('TC-ACCT-08 · ล็อกอินแล้วเห็นระดับสมาชิกและยอดที่ขาด — FR-29 · FR-57', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('oat@bitbaan.test');
  await page.getByTestId('login-password').fill('Bit12345');
  await page.getByTestId('login-submit').click();
  // รอให้ล็อกอินสำเร็จจริงก่อน ไม่งั้นการเปิด /account จะแข่งกับ response ของ login
  await expect(await see(page.getByTestId('nav-account'))).toBeVisible();

  await page.goto('/account');
  await expect(await see(page.getByTestId('member-tier'))).toContainText('Silver');
  await expect(await see(page.getByTestId('spend-12m'))).toContainText('20,000');
  await expect(await see(page.getByTestId('to-next-tier'))).toContainText('80,000');
});
