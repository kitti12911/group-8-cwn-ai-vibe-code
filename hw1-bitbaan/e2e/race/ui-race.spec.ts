import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADDRESS, BASE_URL, asUser, available, newApi, reset, setClock } from '../lib/api';
import { PASSWORD, USERS } from '../lib/data';

/**
 * การบ้านขั้น 2 · TC-RACE-02 — แย่งของชิ้นสุดท้ายผ่าน **หน้าเว็บจริง**
 *
 * `api-race.spec.ts` พิสูจน์ที่ชั้น API แล้วว่าหลังบ้านกันของถูก แต่ยังไม่ตอบอีกคำถามหนึ่ง:
 * **คนที่แพ้เห็นอะไรบนจอ** — ถ้าหลังบ้านตอบ 409 แต่หน้าเว็บกลืน error แล้วพาไปหน้าจ่ายเงิน
 * ลูกค้าจะจ่ายเงินให้ของที่ไม่มี · ไฟล์นี้จึงขับหน้าเว็บจริงทั้งสองฝั่ง
 *
 * สองหน้าต่าง = `browser.newContext()` คนละตัว (คนละ cookie คนละ localStorage) ไม่ใช่สองแท็บในเครื่องเดียว
 * จึงเท่ากับลูกค้าสองคนคนละเครื่องจริง ๆ
 *
 * รัน · `npm run test:race:ui` · หลักฐานที่ได้ใน `test-report/race-ui/`
 *   | ไฟล์ | คือ |
 *   | --- | --- |
 *   | `race-ui-A.webm` · `race-ui-B.webm` | วิดีโอสองหน้าต่างของ TC-RACE-02 (อัดแม้ test ผ่าน) |
 *   | `race-ui-side-by-side.png` | ภาพสองจอเรียงกัน ณ วินาทีที่รู้ผล |
 *   | `race-tabs-*.webm` · `race-tabs-side-by-side.png` | ของ TC-RACE-02b |
 *
 * ต่อสองวิดีโอเป็น GIF · `npm run race:gif` (รันจากโฟลเดอร์ `e2e/`) — ต้องมี ffmpeg เต็มตัว
 * ตัวที่ Playwright แถมมาทำไม่ได้ สคริปต์จะฟ้องเหตุผลตรง ๆ ไม่เงียบ
 */

/** ขนาดหน้าต่าง = ขนาดวิดีโอ เพื่อให้ภาพไม่เบลอตอนเอาสองจอมาต่อกัน */
const WINDOW = { width: 900, height: 820 };

let api: APIRequestContext;
test.beforeAll(async () => { api = await newApi(); });

test.describe.configure({ timeout: 180_000 });

/** หน้าต่างเบราว์เซอร์แยก session · อัดวิดีโอเองทุกครั้ง ไม่รอให้ test fail */
async function openWindow(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE_URL,
    viewport: WINDOW,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    recordVideo: { dir: test.info().outputDir, size: WINDOW },
  });
}

/**
 * ปิด context แล้วย้ายไฟล์วิดีโอไปชื่อที่คงที่ เพื่อให้ `npm run race:gif` หยิบได้แน่นอน
 * ต้องอ่าน `page.video()` **ก่อน** ปิด และ `saveAs` **หลัง** ปิด (ไฟล์ .webm เขียนจบตอนปิด)
 */
async function keepVideos(ctx: BrowserContext, shots: { page: Page; name: string }[]) {
  const videos = shots.map((s) => ({ name: s.name, video: s.page.video() }));
  await ctx.close();
  for (const v of videos) {
    if (!v.video) {
      console.warn(`[TC-RACE-02] ไม่ได้วิดีโอของ ${v.name} — หลักฐาน GIF จะไม่ครบ`);
      continue;
    }
    const dest = path.join(test.info().project.outputDir, v.name);
    await v.video.saveAs(dest);
    await test.info().attach(v.name, { path: dest, contentType: 'video/webm' });
  }
}

/**
 * ภาพนิ่งสองจอเรียงกัน ณ วินาทีที่รู้ผล
 *
 * ffmpeg ที่ Playwright แถมมาเป็น build ที่ตัดทิ้งเกือบหมด (`--disable-everything`) มีแต่ filter
 * `pad/crop/scale` และ muxer `webm/image2` จึง **ต่อวิดีโอสองจอหรือเขียน GIF ไม่ได้**
 * (`npm run race:gif` จะฟ้องเรื่องนี้ตรง ๆ และทำ GIF ให้เมื่อมี ffmpeg เต็มตัว)
 * ระหว่างนั้นเราประกอบภาพเองในเบราว์เซอร์ ไม่ต้องพึ่ง library ภายนอก
 */
async function sideBySideShot(browser: Browser, panes: { page: Page; caption: string }[], name: string) {
  const shots = await Promise.all(panes.map(async (p) => (await p.page.screenshot()).toString('base64')));
  const ctx = await browser.newContext({ viewport: { width: WINDOW.width * panes.length + 48, height: WINDOW.height + 76 } });
  const sheet = await ctx.newPage();
  const stray = sheet.video();
  await sheet.setContent(
    `<body style="margin:0;background:#15181d;font:600 15px/1.5 system-ui,sans-serif;color:#f4f6f8">
       <div style="display:flex;gap:16px;padding:16px">
         ${panes
           .map(
             (p, k) => `<figure style="margin:0;flex:1">
                <figcaption style="padding:0 0 8px 2px">${p.caption}</figcaption>
                <img style="display:block;width:100%;border:2px solid #3a4150" src="data:image/png;base64,${shots[k]}">
              </figure>`,
           )
           .join('')}
       </div>
     </body>`,
  );
  const dest = path.join(test.info().project.outputDir, name);
  await sheet.screenshot({ path: dest, fullPage: true });
  await ctx.close();
  if (stray) await fs.promises.rm(await stray.path(), { force: true }).catch(() => undefined);
  await test.info().attach(name, { path: dest, contentType: 'image/png' });
}

type Outcome = 'WIN' | 'LOSE' | 'PENDING';

/** อ่านว่าหน้าต่างนี้จบยัง — ชนะ (ไปหน้าจ่ายเงิน) หรือแพ้ (ขึ้นกล่อง error) */
async function look(page: Page): Promise<Outcome> {
  try {
    if (/\/checkout\/BB-/.test(page.url())) return 'WIN';
    if (await page.getByTestId('error-message').isVisible()) return 'LOSE';
  } catch {
    /* กำลังเปลี่ยนหน้า อ่าน DOM ไม่ได้ชั่วคราว — ถือว่ายังไม่รู้ผล แล้ว poll ใหม่ */
  }
  return 'PENDING';
}

/** รอ "เงื่อนไขจริง" ไม่ใช่ sleep: หน้าต่างต้องจบทางใดทางหนึ่ง ห้ามค้างเฉย ๆ */
async function settle(page: Page, tag: string): Promise<'WIN' | 'LOSE'> {
  let last: Outcome = 'PENDING';
  await expect
    .poll(async () => (last = await look(page)), {
      timeout: 20_000,
      message: `${tag} ต้องจบที่หน้าจ่ายเงินหรือขึ้น error อย่างใดอย่างหนึ่ง ไม่ใช่ค้างอยู่เฉย ๆ`,
    })
    .not.toBe('PENDING');
  return last as 'WIN' | 'LOSE';
}

/** ใส่ GPU-V57 ลงตะกร้าจากหน้ารวมสินค้า แล้วไปหยุดที่หน้าตะกร้า */
async function addLastGpuToCart(page: Page) {
  await page.goto('/products');
  const add = page.getByTestId('add-to-cart-GPU-V57');
  await expect(add, 'ของยังเหลือ ปุ่มใส่ตะกร้าต้องกดได้').toBeEnabled();
  await add.click();
  await expect(page.getByTestId('nav-cart-count')).toContainText('1');
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line-GPU-V57')).toBeVisible();
}

/**
 * กรอกที่อยู่ รอให้คิดราคาเสร็จ แล้วหยุด **ก่อน** กดสั่งซื้อ · คืน locator ของปุ่มที่พร้อมกด
 * `hover()` ไว้ล่วงหน้าเพื่อให้ตอนยิงพร้อมกันเหลือแค่ส่ง event จริง ๆ
 */
async function armPlaceOrder(page: Page): Promise<Locator> {
  await page.getByTestId('address-line').fill(ADDRESS.line);
  await page.getByTestId('address-province').selectOption(ADDRESS.province);
  await expect(page.getByTestId('quote-total'), 'รอให้คิดราคาเสร็จจริง ไม่ใช้ sleep').toBeVisible();
  const pay = page.getByTestId('place-order');
  await expect(pay).toBeEnabled();
  await pay.hover();
  return pay;
}

/**
 * กดพร้อมกันให้ใกล้ที่สุดเท่าที่ harness ทำได้ — ไม่มี `await` คั่นกลางสองการกด
 * `force: true` เพราะเช็คความพร้อมของปุ่มไปแล้วใน `armPlaceOrder` จึงไม่ต้องเสียเวลาเช็คซ้ำ
 * (ถ้าไม่ force คนที่กดทีหลังอาจเจอปุ่มถูก re-render จากผล fetch ของอีกหน้าต่าง)
 */
async function clickTogether(a: Locator, b: Locator): Promise<number> {
  const [ta, tb] = await Promise.all([
    a.click({ force: true }).then(() => Date.now()),
    b.click({ force: true }).then(() => Date.now()),
  ]);
  return Math.abs(ta - tb);
}

test('TC-RACE-02 · สองเครื่องแย่ง GPU-V57 ใบสุดท้ายบนหน้าเว็บ · ชนะได้ใบเดียว อีกคนต้องเห็นว่าของหมด — BR-32 · FR-36 · E110', async ({ browser }) => {
  await reset(api);
  expect(await available(api, 'GPU-V57'), 'ของตั้งต้นต้องเหลือ 1 ใบ').toBe(1);

  const ctxA = await openWindow(browser);
  const ctxB = await openWindow(browser);
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    // ทั้งคู่เห็นของชิ้นสุดท้ายใบเดียวกัน
    await pageA.goto('/products');
    await expect(pageA.getByTestId('product-stock-GPU-V57')).toContainText('เหลือ 1 ชิ้นสุดท้าย');

    await addLastGpuToCart(pageA);
    await pageA.getByTestId('guest-name').fill('คุณเอ เครื่องที่ 1');
    await pageA.getByTestId('guest-phone').fill('0820000101');
    await pageA.getByTestId('guest-email').fill('race-a@bitbaan.test');
    const btnA = await armPlaceOrder(pageA);

    await addLastGpuToCart(pageB);
    await pageB.getByTestId('guest-name').fill('คุณบี เครื่องที่ 2');
    await pageB.getByTestId('guest-phone').fill('0820000102');
    await pageB.getByTestId('guest-email').fill('race-b@bitbaan.test');
    const btnB = await armPlaceOrder(pageB);

    // ─── ยิงพร้อมกัน ───
    const gap = await clickTogether(btnA, btnB);

    const [resA, resB] = await Promise.all([settle(pageA, 'หน้าต่าง A'), settle(pageB, 'หน้าต่าง B')]);
    console.log(`[TC-RACE-02] สองการกดห่างกัน ${gap}ms · A=${resA} · B=${resB}`);

    expect([resA, resB].filter((r) => r === 'WIN'), 'ต้องมีผู้ชนะพอดี 1 หน้าต่าง ไม่ใช่สองหรือศูนย์').toHaveLength(1);

    const win = resA === 'WIN' ? pageA : pageB;
    const lose = resA === 'WIN' ? pageB : pageA;

    // ผู้ชนะ: ไปหน้าจ่ายเงินพร้อมเลขออเดอร์จริง
    await expect(win, 'ผู้ชนะต้องถูกพาไปหน้าจ่ายเงิน').toHaveURL(/\/checkout\/BB-261113-\d{4}/);
    await expect(win.getByTestId('order-no')).toContainText('BB-261113-');
    await expect(win.getByTestId('hold-until'), 'ผู้ชนะต้องเห็นเวลาที่กันของถึง').toBeVisible();

    // ผู้แพ้: ต้อง **เห็น** ว่าของหมด ไม่ใช่ค้างหรือถูกพาไปจ่ายเงิน
    const err = lose.getByTestId('error-message');
    await expect(err, 'ผู้แพ้ต้องเห็นกล่อง error').toBeVisible();
    await expect(err, 'ข้อความต้องบอกว่าของหมด (OUT_OF_STOCK)').toContainText('สินค้าหมดแล้ว');
    await expect(err, 'ต้องบอกด้วยว่าชิ้นไหนที่หมด').toContainText('GPU-V57');
    await expect(lose.getByTestId('out-of-stock-remove'), 'ต้องมีทางออกให้ลูกค้า: เอาชิ้นที่หมดออก').toBeVisible();
    await expect(lose, 'ผู้แพ้ห้ามหลุดไปหน้าจ่ายเงิน').not.toHaveURL(/\/checkout\//);

    // ─── ฝั่งฐานข้อมูล: หน้าเว็บจะโชว์อะไรก็ตาม ของจริงต้องตรง ───
    const left = await available(api, 'GPU-V57');
    expect(left, 'ของต้องเหลือ 0 และห้ามติดลบ').toBe(0);
    expect(left, 'จำนวนที่ขายได้ห้ามติดลบเด็ดขาด').toBeGreaterThanOrEqual(0);

    const orders = await (await api.get('/api/admin/orders?date=2026-11-13', { headers: asUser('S1') })).json();
    const withV57 = orders.filter((o: any) => o.quote.lines.some((l: any) => l.sku === 'GPU-V57'));
    expect(withV57, 'ต้องมีออเดอร์ที่จอง GPU-V57 แค่ใบเดียว').toHaveLength(1);

    const shown = (await win.getByTestId('order-no').innerText()).trim();
    expect(shown, 'เลขออเดอร์บนจอผู้ชนะต้องเป็นใบเดียวกับที่ได้ของในฐานข้อมูล').toContain(withV57[0].orderNo);

    await sideBySideShot(
      browser,
      [
        { page: pageA, caption: `หน้าต่าง A · ${resA === 'WIN' ? 'ได้ของ' : 'ของหมด'}` },
        { page: pageB, caption: `หน้าต่าง B · ${resB === 'WIN' ? 'ได้ของ' : 'ของหมด'}` },
      ],
      'race-ui-side-by-side.png',
    );
  } finally {
    await keepVideos(ctxA, [{ page: pageA, name: 'race-ui-A.webm' }]);
    await keepVideos(ctxB, [{ page: pageB, name: 'race-ui-B.webm' }]);
  }
});

test('TC-RACE-02b · บัญชีเดียวกัน 2 แท็บบนหน้าเว็บ · ได้คนละ 1 ใบ ทั้งที่ของเหลือ 3 — BR-31 · E104', async ({ browser }) => {
  await reset(api);
  // ล็อต LOT-V57-2 เปิดจันทร์ 16 พ.ย. 10:00 → GPU-V57 มี 3 ใบ สต็อกจึงไม่ใช่ตัวกั้น เหลือแค่สิทธิ์คนละ 1 ใบ
  await setClock(api, '2026-11-16T10:00:01+07:00');
  await expect.poll(() => available(api, 'GPU-V57'), { timeout: 5_000 }).toBe(3);

  const ctx = await openWindow(browser);
  const tabA = await ctx.newPage();
  const tabB = await ctx.newPage();

  try {
    await tabA.goto('/login');
    await tabA.getByTestId('login-email').fill(USERS.C4.email!);
    await tabA.getByTestId('login-password').fill(PASSWORD);
    await tabA.getByTestId('login-submit').click();
    await expect(tabA.getByTestId('nav-account'), 'ต้องล็อกอินสำเร็จก่อน ไม่งั้นจะกลายเป็นออเดอร์ของคนไม่ล็อกอิน').toBeVisible();

    // ตะกร้าเก็บใน localStorage จึงเป็นใบเดียวกันทั้งสองแท็บ — นี่คือ "สองแท็บ" ของจริง
    await addLastGpuToCart(tabA);
    await tabB.goto('/cart');
    await expect(tabB.getByTestId('cart-line-GPU-V57'), 'แท็บที่สองต้องเห็นตะกร้าใบเดียวกัน').toBeVisible();

    const btnA = await armPlaceOrder(tabA);
    const btnB = await armPlaceOrder(tabB);

    const gap = await clickTogether(btnA, btnB);

    const [resA, resB] = await Promise.all([settle(tabA, 'แท็บ 1'), settle(tabB, 'แท็บ 2')]);
    console.log(`[TC-RACE-02b] สองการกดห่างกัน ${gap}ms · แท็บ1=${resA} · แท็บ2=${resB}`);

    expect([resA, resB].filter((r) => r === 'WIN'), 'บัญชีเดียวกันต้องได้แค่ใบเดียว แม้ของยังเหลือ').toHaveLength(1);

    const lose = resA === 'WIN' ? tabB : tabA;
    const err = lose.getByTestId('error-message');
    await expect(err, 'แท็บที่แพ้ต้องเห็นเหตุผล').toBeVisible();
    await expect(err, 'ต้องเป็นเพราะสิทธิ์คนละ 1 ใบ (LIMIT_REACHED) ไม่ใช่ของหมด').toContainText('จำกัดคนละ 1 ใบ');

    expect(await available(api, 'GPU-V57'), 'ของต้องถูกกันแค่ 1 ใบ เหลือ 2').toBe(2);
    const orders = await (await api.get('/api/admin/orders?date=2026-11-16', { headers: asUser('S1') })).json();
    const withV57 = orders.filter((o: any) => o.quote.lines.some((l: any) => l.sku === 'GPU-V57'));
    expect(withV57, 'ต้องมีออเดอร์ GPU-V57 ของวันนี้แค่ใบเดียว').toHaveLength(1);

    await sideBySideShot(
      browser,
      [
        { page: tabA, caption: `แท็บ 1 · ${resA === 'WIN' ? 'ได้ของ' : 'เกินสิทธิ์'}` },
        { page: tabB, caption: `แท็บ 2 · ${resB === 'WIN' ? 'ได้ของ' : 'เกินสิทธิ์'}` },
      ],
      'race-tabs-side-by-side.png',
    );
  } finally {
    await keepVideos(ctx, [
      { page: tabA, name: 'race-tabs-A.webm' },
      { page: tabB, name: 'race-tabs-B.webm' },
    ]);
  }
});
