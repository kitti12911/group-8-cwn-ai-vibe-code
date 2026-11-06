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
    { name: 'api', testMatch: /.*\.spec\.ts/, testIgnore: /.*\.ui\.spec\.ts/ },
    { name: 'chromium-ui', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-ui', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-ui', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Safari'] } },
  ],
});
