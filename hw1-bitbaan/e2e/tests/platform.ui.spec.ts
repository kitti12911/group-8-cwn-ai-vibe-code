import { test, expect, Page } from '@playwright/test';

/**
 * ชั้น `ui` — ข้อกำหนดที่ไม่ใช่ฟังก์ชัน ที่พิสูจน์ได้เฉพาะในเบราว์เซอร์จริง (TEST-PLAN.md §2.1)
 *   TC-NFR-02 · หน้าหลักโหลดไม่เกิน 3 วินาที (NFR-02)
 *   TC-NFR-11 · เวลาที่แสดงเป็นเวลาไทยเสมอ แม้เครื่องทดสอบตั้ง TZ=UTC (NFR-14)
 *   TC-NFR-13 · นับถอยหลังใช้เวลาของเว็บ ไม่ใช่นาฬิกาเครื่องลูกค้า (NFR-16)
 * รัน 3 เบราว์เซอร์ตาม NFR-15 · `npm run test:ui`
 *
 * ทุกข้อที่วัดเป็นตัวเลข จะพิมพ์ตัวเลขที่วัดได้ออก stdout และแนบไว้ในรายงาน
 * เพื่อให้ผู้ตรวจเห็น "ค่าที่วัดได้" ไม่ใช่แค่เครื่องหมายถูกสีเขียว
 */

const reset = (page: Page) => page.request.post('/api/test/reset');
const setClock = (page: Page, now: string, running = false) => page.request.post('/api/test/clock', { data: { now, running } });

/** พิมพ์ค่าที่วัดได้ + แนบเป็นไฟล์ในรายงาน เพื่อให้ตรวจย้อนหลังได้ */
async function record(name: string, lines: string[]) {
  const body = lines.join('\n');
  console.log(`\n--- ${name} ---\n${body}\n`);
  await test.info().attach(`${name}.txt`, { body, contentType: 'text/plain' });
}

const medianOf = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** "29:58" → 1798 วินาที */
function mmssToSec(raw: string): number {
  const m = raw.trim().match(/^(\d{1,3}):(\d{2})$/);
  expect(m, `นับถอยหลังต้องอยู่ในรูป mm:ss แต่ได้ "${raw}"`).toBeTruthy();
  return Number(m![1]) * 60 + Number(m![2]);
}

/** ISO (+07:00) → เวลานาฬิกาไทย "HH:MM:SS" คำนวณฝั่ง node แบบไม่พึ่ง TZ ของเครื่อง */
function thaiHMS(iso: string): string {
  const t = Date.parse(iso);
  expect(Number.isNaN(t), `เวลาจาก API อ่านไม่ออก: ${iso}`).toBe(false);
  const d = new Date(t + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

async function serverNowMs(page: Page): Promise<number> {
  const r = await page.request.get('/api/time');
  expect(r.status(), 'GET /api/time').toBe(200);
  const t = Date.parse((await r.json()).now);
  expect(Number.isNaN(t), 'GET /api/time ต้องคืน ISO ที่อ่านได้').toBe(false);
  return t;
}

/** นาฬิกาของเว็บพร้อมใช้แล้ว (ClockProvider sync /api/time เสร็จ) — แถบ flash จะมีข้อความก็ต่อเมื่อ ready */
async function clockReady(page: Page) {
  await expect(page.getByTestId('flash-banner'), 'หน้าเว็บต้อง sync เวลาจาก /api/time ก่อน').toContainText(/flash sale/i);
}

/** สั่งซื้อแบบไม่ล็อกอิน 1 ชิ้น แล้วคืนเลขออเดอร์ (ทางเดินเดียวกับ TC-ORDER-05) */
async function placeGuestOrder(page: Page, phone = '0810000001'): Promise<string> {
  await page.goto('/products');
  await clockReady(page);
  await page.getByTestId('add-to-cart-SSD-1T').click();
  await expect(page.getByTestId('nav-cart-count')).toContainText('1');

  await page.goto('/cart');
  await clockReady(page);
  await page.getByTestId('guest-name').fill('คุณบีม');
  await page.getByTestId('guest-phone').fill(phone);
  await page.getByTestId('guest-email').fill('beam@bitbaan.test');
  await page.getByTestId('address-line').fill('99/1 ถนนบรมราชชนนี');
  await page.getByTestId('address-province').selectOption('กรุงเทพมหานคร');
  await page.getByTestId('place-order').click();

  await expect(page).toHaveURL(/\/checkout\/BB-261113-\d{4}/);
  const orderNo = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByTestId('order-no')).toContainText(orderNo);
  return orderNo;
}

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test('TC-NFR-02 · หน้าหลักโหลดไม่เกิน 3 วินาที · วัดเวลาถึง load 5 ครั้ง ค่ามัธยฐาน ≤ 3 วิ — NFR-02', async ({ page }) => {
  const samples: number[] = [];

  for (let i = 0; i < 5; i++) {
    // about:blank คั่น เพื่อให้แต่ละรอบเป็นการโหลดเอกสารใหม่จริง ๆ ไม่ใช่ no-op ของ URL เดิม
    await page.goto('about:blank');
    await page.goto('/', { waitUntil: 'load' });

    // อ่านจาก Navigation Timing ของหน้าเอง: navigationStart → loadEventEnd
    const ms = await page.evaluate(async () => {
      const read = (): number => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (nav && nav.loadEventEnd > 0) return nav.loadEventEnd - nav.startTime;
        const t = (performance as any).timing;
        if (t && t.loadEventEnd > 0) return t.loadEventEnd - t.navigationStart;
        return 0;
      };
      for (let k = 0; k < 100 && read() === 0; k++) await new Promise((r) => setTimeout(r, 20));
      return read();
    });

    expect(ms, `รอบที่ ${i + 1} อ่าน Navigation Timing ไม่ได้`).toBeGreaterThan(0);
    // ต้องเป็นหน้าหลักจริง ไม่ใช่หน้า error ที่โหลดเร็วเพราะว่าง
    await expect(page.getByTestId('flash-banner'), 'ต้องเป็นหน้าหลักของร้านจริง').toHaveCount(1);
    samples.push(Math.round(ms));
  }

  const median = medianOf(samples);
  await record('TC-NFR-02-page-load', [
    `URL            : ${new URL('/', page.url()).toString()}`,
    `ตัววัด          : navigationStart → loadEventEnd (Navigation Timing ของหน้าเอง)`,
    `5 รอบ (ms)     : ${samples.join(' , ')}`,
    `เรียงลำดับ (ms) : ${[...samples].sort((a, b) => a - b).join(' , ')}`,
    `มัธยฐาน (ms)    : ${median}`,
    `เกณฑ์ NFR-02   : ≤ 3000 ms`,
  ]);

  expect(median, `ค่ามัธยฐาน ${median} ms จาก [${samples.join(', ')}] ต้องไม่เกิน 3000 ms (NFR-02)`).toBeLessThanOrEqual(3000);
});

/**
 * TEST-PLAN.md บอกให้ "ตั้ง TZ=UTC ให้เครื่องทดสอบ" — ใน Playwright คือ override timezoneId
 * ของ context เฉพาะกลุ่มนี้ (config หลักตั้ง Asia/Bangkok ไว้)
 */
test.describe('เครื่องทดสอบตั้งเขตเวลาเป็น UTC', () => {
  test.use({ timezoneId: 'UTC' });

  test('TC-NFR-11 · เวลาที่แสดงเป็นเวลาไทยเสมอ แม้เครื่องทดสอบตั้ง TZ=UTC — NFR-14', async ({ page }) => {
    await setClock(page, '2026-11-13T10:00:00+07:00');
    await page.goto('/');

    // ยืนยันก่อนว่าเครื่องทดสอบเป็น UTC จริง ไม่งั้น test นี้ไม่ได้พิสูจน์อะไรเลย
    const tz = await page.evaluate(() => ({
      offsetMin: new Date().getTimezoneOffset(),
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
    expect(tz.offsetMin, `เบราว์เซอร์ต้องอยู่ที่ UTC แต่ได้ offset ${tz.offsetMin} นาที`).toBe(0);

    // 1) แถบ flash sale — รอบถัดไปคือ ศ. 13 พ.ย. 2026 12:00 น. (เวลาไทย) · ถ้าเรนเดอร์ด้วยเวลาเครื่องจะเป็น 05:00
    //    ต้องเทียบทั้งวลี เพราะในแถบมีข้อความคงที่ "ทุกวันศุกร์ 12:00–13:00" อยู่แล้ว การหาแค่ "12:00" จะผ่านแม้เวลาผิด
    const banner = page.getByTestId('flash-banner');
    await expect(banner).toContainText('รอบถัดไป');
    const bannerText = (await banner.innerText()).replace(/\s+/g, ' ').trim();
    expect(bannerText, 'วัน-เวลาเริ่มรอบถัดไปต้องเป็นเวลาไทย').toContain('รอบถัดไป ศ. 13 พ.ย. 2026 12:00 น.');
    expect(bannerText, 'ห้ามเรนเดอร์เป็นเวลา UTC (05:00)').not.toContain('รอบถัดไป ศ. 13 พ.ย. 2026 05:00');

    // 2) เวลากันของในหน้าชำระเงิน — ต้องตรงกับเวลานาฬิกาไทยของ holdUntil ที่ API ส่งมา
    const orderNo = await placeGuestOrder(page);
    const r = await page.request.get(`/api/orders/${orderNo}?phone=0810000001`);
    expect(r.status(), `GET /api/orders/${orderNo}`).toBe(200);
    const holdUntilIso = (await r.json()).holdUntil as string;
    const expectedHM = thaiHMS(holdUntilIso);

    const shownHold = (await page.getByTestId('hold-until').innerText()).trim();
    const utcHold = new Date(Date.parse(holdUntilIso)).toISOString().slice(11, 19);

    await record('TC-NFR-11-thai-time-under-utc', [
      `เขตเวลาเบราว์เซอร์   : ${tz.zone} (getTimezoneOffset = ${tz.offsetMin} นาที)`,
      `นาฬิกาเว็บ           : 2026-11-13T10:00:00+07:00`,
      `แถบ flash ที่แสดง    : ${bannerText}`,
      `holdUntil จาก API    : ${holdUntilIso}`,
      `เวลาไทยที่ควรแสดง    : ${expectedHM}`,
      `เวลา UTC ของ holdUntil: ${utcHold}  ← ถ้าหน้าเว็บแสดงค่านี้ = ใช้เวลาเครื่อง ไม่ใช่เวลาไทย`,
      `หน้าเว็บแสดงจริง      : ${shownHold}`,
    ]);

    expect(shownHold, `หน้าเว็บต้องแสดงเวลาไทย ${expectedHM} ไม่ใช่เวลา UTC ${utcHold}`).toBe(expectedHM);
    expect(shownHold, 'กันของถึง 10:30 น. ตามเวลาไทย').toBe('10:30:00');
    expect(shownHold, 'ห้ามแสดงเป็นเวลา UTC (03:30)').not.toBe(utcHold);
  });
});

test('TC-NFR-13 · นับถอยหลังใช้เวลาของเว็บ ไม่ใช่นาฬิกาเครื่องลูกค้า — NFR-16', async ({ page }) => {
  const SKEW_MS = 10 * 60_000; // นาฬิกาเครื่องลูกค้าเร็วกว่าเว็บ 10 นาที (TEST-PLAN.md TC-NFR-13)

  // ⚠️ ต้องเลื่อนให้เร็วกว่า **นาฬิกาจำลองของเว็บ** 10 นาที ไม่ใช่เร็วกว่านาฬิกาเครื่องจริง
  // เว็บถูกล็อกเวลาไว้ที่ ศุกร์ 13 พ.ย. 2026 ส่วนเครื่องที่รัน test เป็นวันจริง ห่างกันเป็นวัน ๆ
  // ถ้าบวก 10 นาทีจากนาฬิกาเครื่องเฉย ๆ จะได้ skew ติดลบหลักแสนวินาที แล้ว test ก็ไม่ได้พิสูจน์อะไร
  await setClock(page, '2026-11-13T10:00:00+07:00', true); // ต้องเดินจริง ไม่งั้นนับถอยหลังนิ่งสนิท
  await page.goto('/products');
  await clockReady(page);
  const offsetMs = (await serverNowMs(page)) - Date.now() + SKEW_MS;

  // เลื่อนเฉพาะ Date ของหน้าเว็บ ปล่อย timer ให้เดินจริง = จำลอง "เครื่องลูกค้าตั้งเวลาผิด"
  await page.addInitScript((skewMs: number) => {
    const RealDate = Date;
    const skewed = new Proxy(RealDate, {
      construct(target, args) {
        return args.length === 0 ? new target(RealDate.now() + skewMs) : new (target as any)(...args);
      },
      apply() {
        return new RealDate(RealDate.now() + skewMs).toString();
      },
      get(target, prop, recv) {
        if (prop === 'now') return () => RealDate.now() + skewMs;
        return Reflect.get(target, prop, recv);
      },
    });
    (window as any).Date = skewed;
  }, offsetMs);

  await page.reload(); // init script มีผลกับการโหลดรอบถัดไป จึงต้องโหลดใหม่หลังติดตั้ง
  await clockReady(page);

  // พิสูจน์ว่านาฬิกาเบราว์เซอร์เพี้ยนจริงก่อน ไม่งั้น test นี้ไม่ได้พิสูจน์อะไร
  const deviceAtStart = await page.evaluate(() => Date.now());
  const serverAtStart = await serverNowMs(page);
  const skewSeen = deviceAtStart - serverAtStart;
  expect(skewSeen, `ตั้งใจให้นาฬิกาเครื่องเร็วกว่าเว็บ 10 นาที แต่วัดได้ ${Math.round(skewSeen / 1000)} วิ`).toBeGreaterThan(9 * 60_000);
  expect(skewSeen, `ตั้งใจให้นาฬิกาเครื่องเร็วกว่าเว็บ 10 นาที แต่วัดได้ ${Math.round(skewSeen / 1000)} วิ`).toBeLessThan(11 * 60_000);

  const orderNo = await placeGuestOrder(page);
  await expect(page.getByTestId('countdown')).toHaveText(/^\d{1,3}:\d{2}$/);

  // อ่านตัวเลขทั้งสามชุดให้ชิดกันที่สุด: หน้าเว็บ → นาฬิกาเครื่อง → นาฬิกาเว็บ
  const shownSec = mmssToSec(await page.getByTestId('countdown').innerText());
  const deviceNow = await page.evaluate(() => Date.now());
  const serverNow = await serverNowMs(page);

  const r = await page.request.get(`/api/orders/${orderNo}?phone=0810000001`);
  expect(r.status(), `GET /api/orders/${orderNo}`).toBe(200);
  const holdMs = Date.parse((await r.json()).holdUntil as string);

  const byServerClock = Math.round((holdMs - serverNow) / 1000); // ≈ 1800 วิ
  const byDeviceClock = Math.round((holdMs - deviceNow) / 1000); // ≈ 1200 วิ (เพราะเครื่องเร็วไป 10 นาที)

  await record('TC-NFR-13-countdown-uses-server-clock', [
    `นาฬิกาเครื่องเร็วกว่าเว็บ : ${Math.round(skewSeen / 1000)} วินาที`,
    `holdUntil (เวลาไทย)      : ${thaiHMS(new Date(holdMs).toISOString())}`,
    `ถ้านับจากนาฬิกาเว็บ       : ${byServerClock} วิ (${Math.floor(byServerClock / 60)}:${String(byServerClock % 60).padStart(2, '0')})`,
    `ถ้านับจากนาฬิกาเครื่อง     : ${byDeviceClock} วิ (${Math.floor(byDeviceClock / 60)}:${String(byDeviceClock % 60).padStart(2, '0')})`,
    `หน้าเว็บแสดงจริง          : ${shownSec} วิ (${Math.floor(shownSec / 60)}:${String(shownSec % 60).padStart(2, '0')})`,
  ]);

  expect(byServerClock, 'กันของ 30 นาที — ค่าอ้างอิงต้องใกล้ 1800 วิ').toBeGreaterThan(1700);
  expect(
    Math.abs(shownSec - byServerClock),
    `นับถอยหลังต้องตามนาฬิกาของเว็บ (${byServerClock} วิ) แต่แสดง ${shownSec} วิ`,
  ).toBeLessThanOrEqual(10);
  expect(
    Math.abs(shownSec - byDeviceClock),
    `นับถอยหลังห้ามตามนาฬิกาเครื่องลูกค้า (${byDeviceClock} วิ) แต่แสดง ${shownSec} วิ`,
  ).toBeGreaterThanOrEqual(300);
});
