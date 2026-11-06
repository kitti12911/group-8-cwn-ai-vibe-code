import { test, expect, Page } from '@playwright/test';
import { see } from '../lib/see';

/**
 * ช่องว่างที่เจอตอนเขียน SPEC.md §8 แล้วแก้โค้ด (7 พ.ย. 2026) — ชั้น ui · TEST-PLAN.md §3.13
 * ตัวเลขพิสูจน์ที่ gaps.spec.ts แล้ว ที่นี่ตรวจว่าลูกค้า "เห็น" และ "กด" ได้
 */
const reset = (page: Page) => page.request.post('/api/test/reset');
const setClock = (page: Page, now: string, running = false) => page.request.post('/api/test/clock', { data: { now, running } });

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill('Bit12345');
  await page.getByTestId('login-submit').click();
  await expect(await see(page.getByTestId('nav-account'))).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test('TC-PRICE-13 · บรรทัดส่วนลดที่เป็น 0 ไม่แสดง แต่ยอดยังลงตัว — FR-25', async ({ page }) => {
  // ศุกร์ 10:00 ไม่มี flash · ไม่มี MB จึงไม่มีชุดประกอบ · ไม่ล็อกอินจึงไม่มีส่วนลดสมาชิก · ไม่มีคูปอง
  await page.goto('/products');
  await page.getByTestId('add-to-cart-CPU-N5').click();
  await page.goto('/cart');
  await expect(await see(page.getByTestId('quote-total'))).toBeVisible();
  for (const id of ['quote-flash', 'quote-bundle', 'quote-member', 'quote-coupon']) {
    await expect(await see(page.getByTestId(id)), `${id} = 0 ต้องไม่แสดง`).toHaveCount(0);
  }
  await expect(await see(page.getByTestId('quote-list-total'))).toHaveText('6,290.00');
  await expect(await see(page.getByTestId('quote-total')), 'ส่งฟรีเพราะเกิน ฿3,000 · ยอด = ราคาป้าย').toHaveText('6,290.00');
});

test('TC-PRICE-14 · flash sale เริ่มระหว่างอยู่ในตะกร้า ต้องบอกว่าราคาเปลี่ยน — FR-30', async ({ page }) => {
  await setClock(page, '2026-11-13T11:59:55+07:00', true);
  await page.goto('/products');
  await page.getByTestId('add-to-cart-MB-B6').click();
  await page.goto('/cart');
  await expect(await see(page.getByTestId('quote-total'))).toHaveText('4,590.00');
  // 12:00:00 → MB-B6 ป้ายแดง ฿4,131 · ตะกร้าเดิม ราคาใหม่ต้องขึ้นข้อความให้เห็นก่อนกดสั่ง
  await expect(await see(page.getByTestId('price-changed'))).toBeVisible({ timeout: 20_000 });
  await expect(await see(page.getByTestId('price-changed'))).toContainText('4,590.00');
  await expect(await see(page.getByTestId('price-changed'))).toContainText('4,131.00');
  await expect(await see(page.getByTestId('quote-total'))).toHaveText('4,131.00');
});

test('TC-CANCEL-08 · หน้าออเดอร์แสดงยอดคืนก่อนกดยืนยัน และมีลิงก์เคลมประกันแยก — FR-48 · FR-49', async ({ page }) => {
  await login(page, 'ploy@bitbaan.test');
  await page.goto('/orders/BB-261106-0041');
  await expect(await see(page.getByTestId('return-submit'))).toBeVisible();
  await expect(await see(page.getByTestId('return-preview-refund'))).toHaveCount(0);
  await page.getByTestId('return-opened').check();
  await expect(await see(page.getByTestId('return-preview-refund'))).toHaveText('฿8,400.00');
  await expect(await see(page.getByTestId('return-preview-fee'))).toHaveText('฿933.00');
  await page.getByTestId('return-unopened').check();
  await expect(await see(page.getByTestId('return-preview-refund'))).toHaveText('฿9,333.00');

  await page.getByTestId('warranty-link').click();
  await expect(page).toHaveURL(/\/warranty\?order=BB-261106-0041/);
  await expect(await see(page.getByTestId('warranty-page'))).toContainText('แยกจากการคืนของ');
  await expect(await see(page.getByTestId('warranty-order'))).toHaveText('BB-261106-0041');
});

test('TC-BUILD-19 · ใส่ตะกร้าทั้งชุด ชิ้นที่มีอยู่แล้วต้องเพิ่มจำนวน ไม่หายไป — FR-16', async ({ page }) => {
  await page.goto('/products');
  await page.getByTestId('add-to-cart-CPU-N5').click();
  await expect(await see(page.getByTestId('nav-cart-count'))).toContainText('1');

  await page.goto('/builder');
  const parts: Record<string, string> = { cpu: 'CPU-N5', mb: 'MB-B6', ram: 'RAM-D4', gpu: 'GPU-V46', ssd: 'SSD-1T', psu: 'PSU-550', case: 'CASE-M' };
  for (const [cat, sku] of Object.entries(parts)) await page.getByTestId(`builder-select-${cat}`).selectOption(sku);
  await expect(await see(page.getByTestId('builder-add-all'))).toBeEnabled();
  await page.getByTestId('builder-add-all').click();

  await expect(page).toHaveURL(/\/cart/);
  await expect(await see(page.getByTestId('cart-qty-CPU-N5')), 'CPU เดิม 1 + จากสเปก 1').toHaveText('2');
  await expect(await see(page.getByTestId('nav-cart-count'))).toContainText('8');
});

test('TC-NFR-14 · <html> มี data-ready และ data-bug-mode ตามแม่แบบผู้สอน', async ({ page }) => {
  await page.goto('/');
  await expect(await see(page.locator('html'))).toHaveAttribute('data-ready', 'true');
  await expect(await see(page.locator('html'))).toHaveAttribute('data-bug-mode', /^[012]$/);
});

// ---- LAB 8 · ผลสำรวจ exploration/C1–C6 · แก้แล้ว 7 พ.ย. (TEST-PLAN.md §3.14) ----

test('TC-ACCT-12 · คนไม่ล็อกอินติดตามออเดอร์จากลิงก์ท้ายเว็บด้วยเลขออเดอร์ + เบอร์ — FR-35 · C6', async ({ page }) => {
  const r = await page.request.post('/api/orders', {
    data: { items: [{ sku: 'SSD-1T', qty: 1 }], shipping: 'pickup', guest: { name: 'คุณติดตาม', phone: '081-600-0099', email: 'track@bitbaan.test' } },
  });
  const { orderNo } = await r.json();
  await page.goto('/');
  await page.getByTestId('footer-track').click();
  await expect(page).toHaveURL(/\/track$/);
  await page.getByTestId('track-order-no').fill(orderNo);
  await page.getByTestId('track-phone').fill('081-600-0099');
  await page.getByTestId('track-submit').click();
  await expect(await see(page.getByRole('heading', { level: 1 }))).toContainText(orderNo);
  await expect(await see(page.getByTestId('order-status'))).toHaveAttribute('data-status', 'PENDING');
});

test('TC-BUILD-21 · ใส่ตะกร้าทั้งชุดไม่เกินสิทธิ์คนละ 1 ใบ และบอกว่าไม่ได้เพิ่มชิ้นไหน — BR-31 · FR-16 · C5', async ({ page }) => {
  await page.goto('/products/GPU-V57');
  await page.getByTestId('add-to-cart').click();
  await page.goto('/builder');
  const parts: Record<string, string> = { cpu: 'CPU-N5', mb: 'MB-B6', ram: 'RAM-D4', gpu: 'GPU-V57', ssd: 'SSD-1T', psu: 'PSU-750', case: 'CASE-L' };
  for (const [cat, sku] of Object.entries(parts)) await page.getByTestId(`builder-select-${cat}`).selectOption(sku);
  await page.getByTestId('builder-add-all').click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(await see(page.getByTestId('cart-qty-GPU-V57')), 'จำกัดคนละ 1 ใบ').toHaveText('1');
  await expect(await see(page.getByTestId('build-capped'))).toContainText('GPU-V57');
});

test('TC-SHIP-07 · เลือกส่งด่วนแล้วเปลี่ยนจังหวัดออกนอก กทม. ต้องกลับเป็นส่งปกติ — FR-32 · C4', async ({ page }) => {
  await page.goto('/products');
  await page.getByTestId('add-to-cart-SSD-1T').click();
  await page.goto('/cart');
  await page.getByTestId('address-province').selectOption('กรุงเทพมหานคร');
  await page.getByTestId('shipping-express').check();
  await expect(page.getByTestId('quote-shipping')).toHaveText('150.00');
  await page.getByTestId('address-province').selectOption('นนทบุรี');
  await expect(await see(page.getByTestId('shipping-switched'))).toBeVisible();
  await expect(page.getByTestId('shipping-standard')).toBeChecked();
  await expect(await see(page.getByTestId('quote-shipping')), 'ส่งปกติ ฿60 (ยอดไม่ถึง ฿3,000)').toHaveText('60.00');
});

test('TC-BUILD-22 · "ให้ร้านประกอบ" มีเฉพาะตะกร้าที่มาจากหน้าจัดสเปก — BR-21 · C2', async ({ page }) => {
  await page.goto('/products');
  await page.getByTestId('add-to-cart-RAM-16').click();
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line-RAM-16')).toBeVisible();
  await expect(await see(page.getByTestId('assembly-toggle')), 'ซื้อชิ้นเดียวจากหน้าสินค้า ไม่มีตัวเลือกประกอบ').toHaveCount(0);
});
