import { defineConfig, devices } from '@playwright/test';

/**
 * TEST-PLAN.md §2.5 — ผลต้องนิ่ง: `retries: 0` ตั้งใจ ถ้า test ไม่นิ่งต้องแก้ที่ต้นเหตุ ห้าม retry กลบ
 * ชั้น `api` รันครั้งเดียว (ไม่ขึ้นกับเบราว์เซอร์) · ชั้น `ui` รันครบ 3 เบราว์เซอร์ตาม NFR-15
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  testIgnore: ['node_modules/**', 'test-report/**'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  // ทุก test เรียก /api/test/reset เอง จึงต้องรันทีละไฟล์แบบไม่ชนกัน
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-report/html', open: 'never' }],
    ['json', { outputFile: 'test-report/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },
  projects: [
    // `ui-race.spec.ts` ไม่ใช่ชั้น api — ต้อง ignore ที่นี่ด้วย ไม่งั้น `npm run test:race` จะลากไปรันซ้ำแบบไม่มีวิดีโอ
    { name: 'api', testMatch: /.*\.spec\.ts/, testIgnore: [/.*\.ui\.spec\.ts/, /ui-race\.spec\.ts/] },
    { name: 'chromium-ui', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-ui', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-ui', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Safari'] } },
    /**
     * TC-RACE-02 · หลักฐานขั้น 2 คือ **วิดีโอสองจอตอน test ผ่าน** จึงต้อง `video: 'on'`
     * (`retain-on-failure` ของ config หลักจะลบไฟล์ทิ้งทุกครั้งที่ผ่าน = ใช้เป็นหลักฐานไม่ได้)
     * ไฟล์ลงที่ `test-report/race-ui/` เพื่อให้ `npm run race:gif` หยิบไปต่อเป็น GIF ได้
     */
    {
      name: 'race-ui',
      testMatch: /ui-race\.spec\.ts/,
      outputDir: 'test-report/race-ui',
      use: { ...devices['Desktop Chrome'], video: { mode: 'on', size: { width: 900, height: 820 } } },
    },
  ],
});
