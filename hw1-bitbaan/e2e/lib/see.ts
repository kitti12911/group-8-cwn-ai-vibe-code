import type { Locator } from '@playwright/test';

/**
 * หลักฐานใน GIF (LAB 12): ก่อนตรวจ ให้ตีกรอบแดงรอบ element ที่ตรวจ แล้วค้างไว้ให้คนดูทัน
 * ทำงานเฉพาะตอน `EVIDENCE=1` (npm run evidence) · รันปกติแค่คืน locator เดิม ไม่ช้าลง
 * ใช้กับ element ที่ไม่มีอยู่ก็ได้ (เช่น toHaveCount(0)) — ไม่รอ ไม่ล้ม
 */
export async function see(locator: Locator): Promise<Locator> {
  if (process.env.EVIDENCE !== '1') return locator;
  // รอสั้น ๆ ให้ element ขึ้นก่อนตีกรอบ (ถ้าตั้งใจให้ไม่มี ก็แค่เสียเวลา 1.5 วินาทีในโหมดหลักฐาน)
  await locator.first().waitFor({ state: 'attached', timeout: 1_500 }).catch(() => {});
  await locator
    .evaluateAll((els) => {
      for (const el of els as HTMLElement[]) {
        el.style.outline = '3px solid #e11d48';
        el.style.outlineOffset = '2px';
        el.scrollIntoView({ block: 'center' });
      }
    })
    .catch(() => {});
  await locator.page().waitForTimeout(400);
  return locator;
}
