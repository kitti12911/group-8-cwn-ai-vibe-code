import { test, expect, type Browser, type Page } from '@playwright/test';
import { see } from '../lib/see';

/**
 * TC-RACE-02 · สองคนกดยืนยันพร้อมกันบนหน้าเว็บ (TEST-PLAN.md §3.11)
 * 2 browser context = 2 คนจริง กรอกจนถึงก่อนยืนยัน แล้วกด `place-order` พร้อมกัน
 * GPU-V57 เหลือ 1 ใบ → ต้องได้ออเดอร์ 1 คน อีกคนเห็นว่าของหมด
 * วิดีโอของทั้งสองหน้าต่างเก็บแยก แล้ว scripts/make-gifs.mjs วางคู่กันเป็น GIF เดียว
 * รัน: `npx playwright test race/ui-race.ui.spec.ts --project=chromium-ui` หรือ `npm run evidence`
 */
const ADDRESS = '99/1 ถนนบรมราชชนนี';

async function buyer(browser: Browser, dir: string, name: string, phone: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 960, height: 800 },
    ...(process.env.EVIDENCE === '1' ? { recordVideo: { dir, size: { width: 960, height: 800 } } } : {}),
  });
  const page = await ctx.newPage();
  await page.goto('/products/GPU-V57');
  await page.getByTestId('add-to-cart').click();
  await page.goto('/cart');
  await page.getByTestId('guest-name').fill(name);
  await page.getByTestId('guest-phone').fill(phone);
  await page.getByTestId('guest-email').fill(`${phone}@bitbaan.test`);
  await page.getByTestId('address-line').fill(ADDRESS);
  await page.getByTestId('address-province').selectOption('กรุงเทพมหานคร');
  await expect(page.getByTestId('place-order')).toBeEnabled();
  return page;
}

test('TC-RACE-02 · สองคนกดยืนยันพร้อมกันบนหน้าเว็บ ของชิ้นสุดท้ายได้คนเดียว — BR-32 · FR-36 · FR-37', async ({ browser, request }, testInfo) => {
  await request.post('/api/test/reset');
  const [a, b] = await Promise.all([
    buyer(browser, testInfo.outputPath('video-a'), 'คุณเอ', '0830000001'),
    buyer(browser, testInfo.outputPath('video-b'), 'คุณบี', '0830000002'),
  ]);

  // กดพร้อมกันจริง ไม่ await ทีละคน
  await Promise.all([a.getByTestId('place-order').click(), b.getByTestId('place-order').click()]);

  const outcome = async (p: Page) => {
    const won = p.waitForURL(/\/checkout\/BB-/, { timeout: 10_000 }).then(() => 'won' as const);
    const lost = p.getByTestId('error-message').waitFor({ timeout: 10_000 }).then(() => 'lost' as const);
    return Promise.race([won, lost]);
  };
  const results = await Promise.all([outcome(a), outcome(b)]);
  expect([...results].sort(), 'ชิ้นสุดท้าย: ชนะ 1 คน แพ้ 1 คน').toEqual(['lost', 'won']);

  const loser = results[0] === 'lost' ? a : b;
  const winner = loser === a ? b : a;
  await expect(await see(loser.getByTestId('error-message')), 'คนแพ้ต้องเห็นว่าของหมด').toContainText('หมด');
  await expect(await see(winner.getByTestId('order-no'))).toContainText('BB-');

  const stock = await (await request.get('/api/products/GPU-V57')).json();
  expect(stock.available, 'ของไม่ติดลบ').toBe(0);

  if (process.env.EVIDENCE === '1') await Promise.all([a.waitForTimeout(1_500), b.waitForTimeout(1_500)]);
  await a.context().close();
  await b.context().close();
});
