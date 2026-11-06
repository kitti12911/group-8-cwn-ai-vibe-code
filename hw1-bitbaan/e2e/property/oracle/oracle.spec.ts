import { test, expect } from '@playwright/test';
import { QUOTES, USERS, baht } from '../../lib/data';
import { ORACLE_READY, quote as oracle } from './price';

/**
 * ชุดตรวจ oracle ก่อนเอาไปใช้ — การบ้านขั้น 3.1 "มี unit test ของ oracle เอง ใช้ตาราง quote เป็นชุดตรวจ"
 * ถ้า oracle ผิดเอง property test ไม่มีความหมาย จึงต้องผ่าน 27/27 ก่อนตั้ง ORACLE_READY = true
 *
 *   cd e2e && npm run test:oracle
 */

/** บัญชีที่ยังไม่มีออเดอร์ที่จ่ายแล้วและไม่ถูกยกเลิก → ใช้ NEWBIT200 ได้ (BR-16 · TEST-DATA.md ข้อ 2) */
const FIRST_ORDER = new Set(['C2', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11']);

test.describe('oracle · ตาราง quote 27 แถวที่คิดด้วยมือ', () => {
  test.skip(!ORACLE_READY, 'ยังไม่มี oracle อิสระ — ดู prompts/05-oracle-independent.txt');

  for (const c of QUOTES) {
    test(`${c.id} → ฿${c.total.toLocaleString()} · VAT ฿${c.vat}`, async () => {
      const got = oracle({
        items: c.items,
        now: c.now,
        tier: c.user === 'C1' ? null : USERS[c.user].tier,
        loggedIn: c.user !== 'C1',
        firstOrder: FIRST_ORDER.has(c.user),
        coupon: c.coupon,
        shipping: c.shipping,
        assembly: c.assembly ?? false,
      });
      expect(got.total, `${c.id} ยอดชำระ`).toBe(baht(c.total));
      expect(got.vat, `${c.id} VAT`).toBe(Math.round(c.vat * 100));
      expect(got.preVat + got.vat, `${c.id} มูลค่าก่อน VAT + VAT = ยอดชำระ`).toBe(got.total);
    });
  }
});
