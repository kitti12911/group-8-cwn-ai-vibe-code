import { test, expect, Page } from '@playwright/test';
import { ADDRESS, GUEST } from '../lib/api';

/**
 * ชั้น `ui` — วิธีส่ง · ที่อยู่ · ของหมดระหว่างสั่ง · ช่องทางจ่ายเงิน · ป้าย VAT (TEST-PLAN.md §2.1)
 *
 * ตัวเลขทุกตัวในไฟล์นี้มาจาก `TEST-DATA.md` (ข้อ 3.1 ราคาป้าย · ข้อ 5 ตาราง quote) และ
 * `REQUIREMENTS.md` BR-22/23/24 — **ไม่ได้อ่านจากหน้าจอมาเขียนย้อนหลัง**
 *   BR-22 ส่งปกติ ฿60 · ฟรีเมื่อ G4 ≥ ฿3,000
 *   BR-23 ส่งด่วน ฿150 ไม่มีส่งฟรี · เฉพาะกรุงเทพมหานคร
 *   BR-24 รับที่ร้าน ฿0
 *
 * รัน 3 เบราว์เซอร์ตาม NFR-15 · `npm run test:ui`
 * (ชื่อไฟล์ต้องลงท้าย `.ui.spec.ts` ไม่งั้น playwright.config.ts จะลากไปรันในชั้น `api` แทน)
 */

const reset = (page: Page) => page.request.post('/api/test/reset');

/** "2,250.00" → 225000 สตางค์ · เทียบเป็นจำนวนเต็มเพื่อไม่ให้ float ปัดเศษหลอก */
async function satang(page: Page, testid: string): Promise<number> {
  const shown = await page.getByTestId(testid).innerText();
  const raw = shown.replace(/[^0-9.]/g, '');
  const n = Number(raw);
  expect(/\d/.test(raw) && Number.isFinite(n), `อ่านตัวเลขจาก ${testid} ไม่ได้: "${shown}"`).toBe(true);
  return Math.round(n * 100);
}

async function catalog(page: Page): Promise<{ sku: string; name: string; available: number; price: number }[]> {
  const r = await page.request.get('/api/products');
  expect(r.status(), 'GET /api/products').toBe(200);
  return r.json();
}

async function productOf(page: Page, sku: string) {
  const p = (await catalog(page)).find((x) => x.sku === sku);
  expect(p, `ไม่พบสินค้า ${sku} ใน /api/products`).toBeTruthy();
  return p!;
}

/** ใส่ของลงตะกร้าจากหน้ารวมสินค้า แล้วไปหยุดที่หน้าตะกร้า */
async function addToCart(page: Page, skus: string[]) {
  await page.goto('/products');
  for (const sku of skus) {
    const add = page.getByTestId(`add-to-cart-${sku}`);
    await expect(add, `ของยังเหลือ ปุ่มใส่ตะกร้า ${sku} ต้องกดได้`).toBeEnabled();
    await add.click();
  }
  await expect(page.getByTestId('nav-cart-count')).toContainText(String(skus.length));
  await page.goto('/cart');
  await expect(page.getByTestId(`cart-line-${skus[0]}`)).toBeVisible();
}

/** กรอกข้อมูลผู้สั่ง (ไม่ล็อกอิน · FR-35) และที่อยู่ แล้วรอให้คิดราคาเสร็จ **จริง** ไม่ใช้ sleep */
async function fillGuestAndAddress(page: Page) {
  await expect(page.getByTestId('guest-name'), 'ต้องเห็นฟอร์มผู้สั่งซื้อของคนไม่ล็อกอิน').toBeVisible();
  await page.getByTestId('guest-name').fill(GUEST.name);
  await page.getByTestId('guest-phone').fill(GUEST.phone);
  await page.getByTestId('guest-email').fill(GUEST.email);
  await page.getByTestId('address-line').fill(ADDRESS.line);
  await page.getByTestId('address-province').selectOption(ADDRESS.province);
  await expect(page.getByTestId('quote-total'), 'รอให้คิดราคาเสร็จจริง ไม่ใช้ sleep').toBeVisible();
}

/** สั่งซื้อจากหน้าตะกร้าแบบไม่ล็อกอิน · คืนเลขออเดอร์ที่หน้าจ่ายเงินแสดง */
async function placeGuestOrder(page: Page, skus: string[]): Promise<string> {
  await addToCart(page, skus);
  await fillGuestAndAddress(page);
  await page.getByTestId('place-order').click();
  await expect(page).toHaveURL(/\/checkout\/BB-\d{6}-\d{4}/);
  const no = (await page.getByTestId('order-no').innerText()).trim();
  expect(no, 'เลขออเดอร์ต้องขึ้นต้นด้วย BB-').toMatch(/^BB-\d{6}-\d{4}$/);
  return no;
}

test.beforeEach(async ({ page }) => {
  // reset ตั้งเวลาเว็บเป็น ศุกร์ 13 พ.ย. 10:00 แบบหยุดนิ่ง (API-CONTRACT.md ข้อ 2)
  // → นอกช่วง flash sale 12:00–13:00 ราคาทุกชิ้นจึงเป็นราคาป้ายตรง ๆ ตาม TEST-DATA.md 3.1
  await reset(page);
});

test('TC-SHIP-04 · เลือกวิธีส่ง 3 แบบและเห็นค่าส่งก่อนกดสั่ง — FR-31 · BR-22 · BR-23 · BR-24', async ({ page }) => {
  // SSD-1T ราคาป้าย ฿2,190 (TEST-DATA.md 3.1) · ไม่ล็อกอินจึงไม่มีส่วนลดสมาชิก
  // → G4 = 2,190 ยังไม่ถึง ฿3,000 ส่งปกติจึงยัง **ไม่ฟรี** (Q01 = 2,250)
  await addToCart(page, ['SSD-1T']);
  await expect(page.getByTestId('quote-list-total')).toHaveText('2,190.00');

  // ── ส่งปกติ (ค่าตั้งต้น) · BR-22 ฿60 ──
  await expect(page.getByTestId('shipping-standard')).toBeChecked();
  await expect(page.getByTestId('quote-shipping'), 'BR-22 ส่งปกติ ฿60 เมื่อ G4 < ฿3,000').toHaveText('60.00');
  await expect(page.getByTestId('quote-total'), 'Q01 · 2,190 + 60').toHaveText('2,250.00');

  // ── ส่งด่วน · BR-23 ฿150 ──
  await page.getByTestId('shipping-express').check();
  await expect(page.getByTestId('shipping-express')).toBeChecked();
  await expect(page.getByTestId('shipping-standard'), 'เลือกได้ครั้งละวิธีเดียว').not.toBeChecked();
  await expect(page.getByTestId('quote-shipping'), 'BR-23 ส่งด่วน ฿150').toHaveText('150.00');
  await expect(page.getByTestId('quote-total')).toHaveText('2,340.00');

  // ── รับที่ร้าน · BR-24 ฿0 และไม่ต้องกรอกที่อยู่ ──
  await page.getByTestId('shipping-pickup').check();
  await expect(page.getByTestId('shipping-pickup')).toBeChecked();
  await expect(page.getByTestId('quote-shipping'), 'BR-24 รับที่ร้านฟรี').toHaveText('0.00');
  await expect(page.getByTestId('quote-total')).toHaveText('2,190.00');
  await expect(page.getByTestId('address-line'), 'รับที่ร้านไม่ต้องกรอกที่อยู่').toHaveCount(0);

  // ── กลับมาส่งปกติ ค่าส่งต้องกลับมาเป็น ฿60 ไม่ค้างที่ 0 ──
  await page.getByTestId('shipping-standard').check();
  await expect(page.getByTestId('quote-shipping')).toHaveText('60.00');
  await expect(page.getByTestId('quote-total')).toHaveText('2,250.00');
  await expect(page.getByTestId('address-line'), 'ส่งถึงบ้านต้องกลับมาถามที่อยู่').toHaveCount(1);

  // ── เพิ่มเป็น 2 ชิ้น → G4 = ฿4,380 ≥ ฿3,000 ──
  // BR-22 ส่งปกติ "ฟรี" · BR-23 ส่งด่วน **ยังคง ฿150 ไม่มีส่งฟรี** · BR-24 รับที่ร้าน ฿0
  await page.getByTestId('cart-plus-SSD-1T').click();
  await expect(page.getByTestId('cart-qty-SSD-1T')).toHaveText('2');
  await expect(page.getByTestId('quote-list-total')).toHaveText('4,380.00');
  await expect(page.getByTestId('quote-shipping'), 'BR-22 G4 ≥ ฿3,000 ต้องส่งฟรี').toHaveText('0.00');
  await expect(page.getByTestId('quote-total')).toHaveText('4,380.00');

  await page.getByTestId('shipping-express').check();
  await expect(page.getByTestId('quote-shipping'), 'BR-23 ส่งด่วนไม่มีส่งฟรีแม้ยอดถึงเกณฑ์').toHaveText('150.00');
  await expect(page.getByTestId('quote-total')).toHaveText('4,530.00');

  await page.getByTestId('shipping-pickup').check();
  await expect(page.getByTestId('quote-shipping')).toHaveText('0.00');
  await expect(page.getByTestId('quote-total')).toHaveText('4,380.00');

  // "เห็นค่าส่ง **ก่อนกดสั่ง**" — ทั้งหมดข้างบนเกิดขึ้นโดยยังไม่เคยกด place-order
  await expect(page.getByTestId('place-order'), 'ยังไม่ได้กดสั่ง ปุ่มต้องยังอยู่').toBeEnabled();
  await expect(page, 'ยังไม่หลุดไปหน้าจ่ายเงิน').not.toHaveURL(/\/checkout\//);
});

test('TC-SHIP-05 · 1 ออเดอร์มี 1 ที่อยู่ และหน้าจ่ายเงินบอกข้อนี้ — FR-34 · A-28', async ({ page }) => {
  await addToCart(page, ['SSD-1T']);

  // หน้าตะกร้า: ช่องที่อยู่มีชุดเดียว ไม่มีปุ่ม "เพิ่มที่อยู่"
  await expect(page.getByTestId('address-line'), 'ที่อยู่ต้องมีช่องเดียว').toHaveCount(1);
  await expect(page.getByTestId('address-province'), 'จังหวัดต้องมีช่องเดียว').toHaveCount(1);
  await expect(
    page.getByText(/ถ้าต้องส่งหลายที่ให้แยกออเดอร์/),
    'ต้องบอกลูกค้าว่าแยกส่งหลายที่อยู่ในออเดอร์เดียวยังไม่รองรับ',
  ).toBeVisible();

  await fillGuestAndAddress(page);
  await page.getByTestId('place-order').click();
  await expect(page).toHaveURL(/\/checkout\/BB-\d{6}-\d{4}/);
  const orderNo = (await page.getByTestId('order-no').innerText()).trim();

  // FR-34 — **หน้าจ่ายเงิน** ต้องบอกข้อจำกัดนี้เอง ไม่ใช่บอกแค่ในตะกร้าแล้วหายไป
  await expect(page.locator('#main').getByText(/1 ออเดอร์ส่งได้ 1 ที่อยู่/), 'หน้าจ่ายเงินต้องบอกว่า 1 ออเดอร์ = 1 ที่อยู่').toBeVisible();
  await expect(page.locator('#main'), 'หน้าจ่ายเงินต้องแสดงที่อยู่ที่ใช้จริง').toContainText(ADDRESS.line);

  // ฝั่งข้อมูลจริง: ออเดอร์เก็บที่อยู่ "ชุดเดียว" ไม่ใช่รายการที่อยู่
  const body = await (await page.request.get(`/api/orders/${orderNo}?phone=${encodeURIComponent(GUEST.phone)}`)).json();
  expect(Array.isArray(body.address), 'ออเดอร์ต้องมีที่อยู่ชุดเดียว ไม่ใช่ array ของที่อยู่').toBe(false);
  expect(body.address, 'ที่อยู่ต้องเป็นก้อนเดียวที่มี line + province').toMatchObject({
    line: ADDRESS.line,
    province: ADDRESS.province,
  });
});

test('TC-ORDER-03 · ของหมดระหว่างสั่ง บอกชื่อชิ้นและให้ทางเลือก — FR-37 · FR-36 · BR-32', async ({ page }) => {
  const gpu = await productOf(page, 'GPU-V57');
  expect(gpu.available, 'ตั้งต้น GPU-V57 ต้องเหลือ 1 ใบ (TEST-DATA.md 3.1)').toBe(1);

  // ลูกค้าใส่ของ 2 ชิ้นไว้ในตะกร้าตอนที่ยังมีของครบ
  await addToCart(page, ['CPU-N5', 'GPU-V57']);
  await fillGuestAndAddress(page);
  await expect(page.getByTestId('cart-line-GPU-V57')).toBeVisible();

  // …ระหว่างนั้นหน้าร้านขายใบสุดท้ายไป (FR-07 · S1) — ของหมด "ระหว่างสั่ง" จริง ๆ
  const sale = await page.request.post('/api/admin/store-sale', { data: { sku: 'GPU-V57', qty: 1 }, headers: { 'X-Test-User': 'S1' } });
  expect(sale.status(), 'POST /api/admin/store-sale').toBe(200);
  expect((await productOf(page, 'GPU-V57')).available, 'หน้าร้านขายไปแล้ว ของต้องเหลือ 0').toBe(0);

  await page.getByTestId('place-order').click();

  // 1) ต้อง **บอกชื่อชิ้นที่หมด** ไม่ใช่ error กลาง ๆ ว่า "สั่งไม่สำเร็จ"
  const err = page.getByTestId('error-message');
  await expect(err, 'ต้องขึ้นกล่อง error ให้ลูกค้าเห็น').toBeVisible();
  await expect(err, 'ต้องบอกว่าของหมด (OUT_OF_STOCK)').toContainText('สินค้าหมดแล้ว');
  await expect(err, 'ต้องบอกชื่อชิ้นที่หมด ไม่ใช่แค่รหัส').toContainText(gpu.name);
  await expect(err, 'ต้องบอกรหัสชิ้นที่หมดด้วย').toContainText('GPU-V57');

  // 2) ต้องมี **ทางออก** ให้ลูกค้าเลือก ไม่ใช่ทางตัน
  await expect(page.getByTestId('out-of-stock-remove'), 'ต้องมีปุ่ม "เอาชิ้นนี้ออก"').toBeVisible();
  await expect(page.getByTestId('out-of-stock-rebuild'), 'ต้องมีปุ่ม "กลับไปเลือกใหม่"').toBeVisible();

  // 3) ห้ามตัดชิ้นที่หมดออกเงียบ ๆ — ของยังอยู่ในตะกร้าจนกว่าลูกค้าจะสั่งเอง
  await expect(page.getByTestId('cart-line-GPU-V57'), 'ห้ามลบชิ้นที่หมดออกเองเงียบ ๆ').toBeVisible();
  await expect(page.getByTestId('cart-line-CPU-N5'), 'ชิ้นอื่นต้องยังอยู่ครบ').toBeVisible();
  await expect(page.getByTestId('nav-cart-count')).toContainText('2');
  await expect(page, 'ห้ามพาไปหน้าจ่ายเงินทั้งที่สั่งไม่สำเร็จ').not.toHaveURL(/\/checkout\//);

  // 4) FR-36 — สั่งไม่สำเร็จแล้วห้ามกันของชิ้นอื่นค้างไว้ และ available ห้ามติดลบ
  const after = await catalog(page);
  expect(after.find((p) => p.sku === 'CPU-N5')!.available, 'CPU-N5 ห้ามถูกกันไว้ทั้งที่ออเดอร์ล้ม').toBe(8);
  expect(after.find((p) => p.sku === 'GPU-V57')!.available, 'ของหมดแล้วต้องเป็น 0 ห้ามติดลบ').toBe(0);

  // 5) ทางออกที่ให้ไว้ต้องใช้ได้จริง: กด "เอาชิ้นนี้ออก" แล้วสั่งต่อได้
  await page.getByTestId('out-of-stock-remove').click();
  await expect(page.getByTestId('cart-line-GPU-V57')).toHaveCount(0);
  await expect(page.getByTestId('cart-line-CPU-N5')).toBeVisible();
  // CPU-N5 ฿6,290 · G4 ≥ ฿3,000 จึงส่งฟรีตาม BR-22 → ยอดชำระเท่าราคาป้ายพอดี
  await expect(page.getByTestId('quote-total'), 'รอคิดราคาใหม่หลังเอาของออก').toHaveText('6,290.00');
  await page.getByTestId('place-order').click();
  await expect(page, 'เอาชิ้นที่หมดออกแล้วต้องสั่งต่อได้').toHaveURL(/\/checkout\/BB-\d{6}-\d{4}/);
});

test('TC-ORDER-10 · จ่ายเงินแบบจำลอง 2 ช่องทาง — FR-45 · A-38', async ({ page }) => {
  // ── ช่องทางที่ 1 · PromptPay ──
  const first = await placeGuestOrder(page, ['SSD-1T']);
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PENDING');
  await expect(page.getByTestId('pay-promptpay'), 'ต้องมีช่องทาง PromptPay ให้กด').toBeEnabled();
  await expect(page.getByTestId('pay-card'), 'ต้องมีช่องทางบัตรให้เลือกด้วย').toBeEnabled();

  await page.getByTestId('pay-promptpay').click();
  await expect(page).toHaveURL(new RegExp(`/orders/${first}$`));
  await expect(page.getByTestId('order-status'), 'จ่ายด้วย PromptPay แล้วต้องเป็น "ชำระแล้ว"').toHaveAttribute('data-status', 'PAID');
  await expect(page.getByTestId('order-status')).toContainText('ชำระแล้ว');

  // ── ช่องทางที่ 2 · บัตรเครดิต/เดบิต · ออเดอร์ใหม่คนละใบ ──
  const second = await placeGuestOrder(page, ['SSD-1T']);
  expect(second, 'ต้องเป็นออเดอร์คนละใบกับใบแรก').not.toBe(first);
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'PENDING');

  await page.getByTestId('pay-card').click();
  await expect(page).toHaveURL(new RegExp(`/orders/${second}$`));
  await expect(page.getByTestId('order-status'), 'จ่ายด้วยบัตรแล้วต้องเป็น "ชำระแล้ว" เหมือนกัน').toHaveAttribute('data-status', 'PAID');
  await expect(page.getByTestId('order-status')).toContainText('ชำระแล้ว');

  // ทั้งสองใบต้องเป็น PAID จริงฝั่งหลังบ้าน ไม่ใช่หน้าจอเปลี่ยนสีเฉย ๆ
  for (const no of [first, second]) {
    const body = await (await page.request.get(`/api/orders/${no}?phone=${encodeURIComponent(GUEST.phone)}`)).json();
    expect(body.status, `ออเดอร์ ${no} ต้องเป็น PAID ในฐานข้อมูล`).toBe('PAID');
    expect(body.paidAt, `ออเดอร์ ${no} ต้องมีเวลาที่จ่าย`).toBeTruthy();
  }
});

test('TC-CAT-02 · ทุกหน้าที่มีราคาเขียนว่ารวม VAT แล้ว และไม่มีจุดใดบวก VAT เพิ่ม — FR-02 · BR-40', async ({ page }) => {
  // ฿2,190.00 ราคาป้าย (TEST-DATA.md 3.1) — ราคานี้ "รวม VAT แล้ว" อยู่ในตัวเองแล้ว
  // ถ้าที่ไหนบวก VAT ซ้ำจะกลายเป็น ฿2,343.30 (2,190 × 1.07) — การเทียบ "เท่ากับ 2,190.00" แบบเป๊ะ ๆ ข้างล่างจับได้ทุกจุด
  const SSD_PRICE = 219_000;

  /** ทุกหน้าที่มีราคาต้องประกาศว่ารวม VAT แล้ว ทั้งแถบบนสุดของร้าน และในเนื้อหน้าเอง */
  const expectVatStated = async (where: string) => {
    await expect(page.getByText('ราคารวม VAT แล้วทุกชิ้น'), `${where} ต้องมีข้อความ "ราคารวม VAT แล้ว"`).toBeVisible();
    await expect(page.locator('#main').getByText(/รวม VAT/).first(), `${where} เนื้อหน้าต้องกำกับว่าราคารวม VAT`).toBeVisible();
  };

  // ── 1. หน้าแรก ──
  await page.goto('/');
  await expectVatStated('หน้าแรก');
  await expect(page.getByTestId('home-flash-SSD-1T'), 'นอกช่วง flash sale ต้องเป็นราคาป้ายตรง ๆ').toContainText('฿2,190.00');

  // ── 2. หน้ารวมสินค้า ──
  await page.goto('/products');
  await expectVatStated('หน้ารวมสินค้า');
  await expect(page.getByTestId('product-price-SSD-1T')).toHaveText('฿2,190.00');

  // ── 3. หน้าสินค้า ──
  await page.goto('/products/SSD-1T');
  await expectVatStated('หน้าสินค้า');
  await expect(page.getByTestId('product-price')).toHaveText('฿2,190.00');

  // ── 4. หน้าจัดสเปก ──
  await page.goto('/builder');
  await expectVatStated('หน้าจัดสเปก');
  await page.getByTestId('builder-select-ssd').selectOption('SSD-1T');
  await expect(page.getByTestId('builder-total'), 'ราคารวมในหน้าจัดสเปกต้องเท่าราคาป้าย ไม่บวก VAT ซ้ำ').toHaveText('฿2,190.00');

  // ── 5. หน้าตะกร้า — ไล่ทุกบรรทัดของใบสรุปราคา ──
  await addToCart(page, ['SSD-1T']);
  await expectVatStated('หน้าตะกร้า');

  const list = await satang(page, 'quote-list-total');
  const flash = await satang(page, 'quote-flash');
  const bundle = await satang(page, 'quote-bundle');
  const member = await satang(page, 'quote-member');
  const coupon = await satang(page, 'quote-coupon');
  const assembly = await satang(page, 'quote-assembly');
  const shipping = await satang(page, 'quote-shipping');
  const cartTotal = await satang(page, 'quote-total');

  expect(list, 'ราคาป้ายต้องเท่าราคาในแค็ตตาล็อก').toBe(SSD_PRICE);
  expect(shipping, 'BR-22 ส่งปกติ ฿60 (G4 < ฿3,000)').toBe(6_000);
  // ไม่มีบรรทัดไหนบวก VAT ซ้ำ: ยอดชำระ = ป้าย − ส่วนลดทั้งหมด + ค่าประกอบ + ค่าส่ง เป๊ะ ๆ
  expect(cartTotal, 'ยอดชำระต้องบวกลบลงตัวจากบรรทัดบน ไม่มี × 1.07 แทรกตรงไหน').toBe(
    list - flash - bundle - member - coupon + assembly + shipping,
  );
  expect(cartTotal, 'Q01 · 2,190 + 60 = 2,250').toBe(225_000);

  // VAT เป็นแบบ "รวมอยู่ในราคาแล้ว" → ก่อน VAT + VAT = ยอดชำระ และ ก่อน VAT × 1.07 ≈ ยอดชำระ
  const preVat = await satang(page, 'quote-pre-vat');
  const vat = await satang(page, 'quote-vat');
  expect(preVat + vat, 'ก่อน VAT + VAT ต้องเท่ายอดชำระพอดี (VAT รวมในราคาแล้ว)').toBe(cartTotal);
  expect(preVat, 'Q01 · มูลค่าก่อน VAT ฿2,102.80').toBe(210_280);
  expect(vat, 'Q01 · VAT ฿147.20').toBe(14_720);
  expect(Math.abs(Math.round(preVat * 1.07) - cartTotal), 'ยอดชำระต้อง = ก่อน VAT × 1.07 (ไม่ใช่ ป้าย × 1.07)').toBeLessThanOrEqual(1);

  // ── 6. หน้าจ่ายเงิน — ยอดต้องเท่าเดิม ไม่มีใครบวก VAT เพิ่มตอนสรุป ──
  await fillGuestAndAddress(page);
  await page.getByTestId('place-order').click();
  await expect(page).toHaveURL(/\/checkout\/BB-\d{6}-\d{4}/);
  const orderNo = (await page.getByTestId('order-no').innerText()).trim();
  await expectVatStated('หน้าจ่ายเงิน');
  expect(await satang(page, 'quote-total'), 'ยอดหน้าจ่ายเงินต้องเท่าหน้าตะกร้า').toBe(cartTotal);
  expect((await satang(page, 'quote-pre-vat')) + (await satang(page, 'quote-vat'))).toBe(cartTotal);

  // ── 7. หน้าออเดอร์ + ใบกำกับภาษี — จุดสุดท้ายที่ VAT ซ้ำจะโผล่ ──
  await page.getByTestId('pay-promptpay').click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderNo}$`));
  await expectVatStated('หน้าออเดอร์');
  expect(await satang(page, 'quote-total'), 'ยอดในออเดอร์ต้องเท่าตอนกดสั่ง').toBe(cartTotal);

  await page.getByTestId('invoice-link').click();
  await expect(page.getByTestId('invoice-total')).toBeVisible();
  const invTotal = await satang(page, 'invoice-total');
  const invPreVat = await satang(page, 'invoice-pre-vat');
  const invVat = await satang(page, 'invoice-vat');
  expect(invTotal, 'ใบกำกับภาษีต้องออกตามยอดที่ชำระ ไม่บวก VAT ทับ').toBe(cartTotal);
  expect(invPreVat + invVat, 'ใบกำกับภาษี: ก่อน VAT + VAT = รวมทั้งสิ้น').toBe(invTotal);
  expect(invPreVat, 'ใบกำกับภาษีต้องแยก VAT ตรงกับใบสรุปราคา').toBe(preVat);
  expect(invVat).toBe(vat);
});
