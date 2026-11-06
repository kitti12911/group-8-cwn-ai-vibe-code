/**
 * ข้อมูลตั้งต้นทั้งหมดในไฟล์นี้คัดมาจาก `TEST-DATA.md` ซึ่งคิดด้วยมือ **ก่อน** เว็บถูกสร้าง
 * ห้ามแก้ตัวเลขในไฟล์นี้ให้ตรงกับหน้าจอ — ถ้าเว็บไม่ตรง แปลว่าเว็บผิด หรือสมมติฐานผิด (TEST-PLAN.md §2.4)
 */

/** เวลาตั้งต้นหลัง POST /api/test/reset (TEST-DATA.md ข้อ 1 · T-01) */
export const NOW_DEFAULT = '2026-11-13T10:00:00+07:00';
/** พฤหัส 12 พ.ย. 10:00 — ไม่มี flash sale */
export const THU_1000 = '2026-11-12T10:00:00+07:00';
/** ศุกร์ 13 พ.ย. 12:30 — กลางช่วง flash sale */
export const FRI_1230 = '2026-11-13T12:30:00+07:00';

export const baht = (n: number) => n * 100;

export type Tier = 'GENERAL' | 'SILVER' | 'GOLD' | 'BUSINESS' | null;

/** TEST-DATA.md ข้อ 2 */
export const USERS: Record<string, { email: string | null; tier: Tier; spend12m: number; phone: string }> = {
  C1: { email: null, tier: null, spend12m: 0, phone: '081-000-0001' },
  C2: { email: 'nida@bitbaan.test', tier: 'GENERAL', spend12m: 4_500, phone: '081-000-0002' },
  C3: { email: 'oat@bitbaan.test', tier: 'SILVER', spend12m: 20_000, phone: '081-000-0003' },
  C4: { email: 'ploy@bitbaan.test', tier: 'GOLD', spend12m: 135_000, phone: '081-000-0004' },
  C5: { email: 'joy@designco.test', tier: 'BUSINESS', spend12m: 480_000, phone: '081-000-0005' },
  C6: { email: 'tan@bitbaan.test', tier: 'GENERAL', spend12m: 18_000, phone: '081-000-0006' },
  C7: { email: 'edge19999@bitbaan.test', tier: 'GENERAL', spend12m: 19_999, phone: '081-000-0007' },
  C8: { email: 'edge99999@bitbaan.test', tier: 'SILVER', spend12m: 99_999, phone: '081-000-0008' },
  C9: { email: 'edge100k@bitbaan.test', tier: 'GOLD', spend12m: 100_000, phone: '081-000-0009' },
  C10: { email: 'edge365@bitbaan.test', tier: 'SILVER', spend12m: 20_000, phone: '081-000-0010' },
  C11: { email: 'newbiz@bitbaan.test', tier: 'BUSINESS', spend12m: 0, phone: '081-000-0011' },
};

export const PASSWORD = 'Bit12345';

/** TEST-DATA.md ข้อ 3.1 — ราคาป้าย · ราคา flash · จำนวนที่ขายได้หลัง reset */
export const PRODUCTS = [
  { sku: 'CPU-N5', cat: 'CPU', price: 6_290, redTag: false, flash: null, available: 8 },
  { sku: 'CPU-N7', cat: 'CPU', price: 10_990, redTag: false, flash: null, available: 5 },
  { sku: 'MB-B6', cat: 'MB', price: 4_590, redTag: true, flash: 4_131, available: 6 },
  { sku: 'MB-X7', cat: 'MB', price: 8_790, redTag: false, flash: null, available: 3 },
  { sku: 'RAM-D4', cat: 'RAM', price: 1_290, redTag: false, flash: null, available: 10 },
  { sku: 'RAM-16', cat: 'RAM', price: 1_890, redTag: false, flash: null, available: 20 },
  { sku: 'RAM-32', cat: 'RAM', price: 3_490, redTag: true, flash: 3_141, available: 12 },
  { sku: 'GPU-V46', cat: 'GPU', price: 11_490, redTag: true, flash: 10_341, available: 4 },
  { sku: 'GPU-V57', cat: 'GPU', price: 23_990, redTag: false, flash: null, available: 1 },
  { sku: 'SSD-1T', cat: 'SSD', price: 2_190, redTag: true, flash: 1_971, available: 15 },
  { sku: 'PSU-550', cat: 'PSU', price: 1_990, redTag: false, flash: null, available: 6 },
  { sku: 'PSU-750', cat: 'PSU', price: 3_290, redTag: false, flash: null, available: 7 },
  { sku: 'CASE-M', cat: 'CASE', price: 1_590, redTag: false, flash: null, available: 9 },
  { sku: 'CASE-L', cat: 'CASE', price: 2_490, redTag: false, flash: null, available: 4 },
  { sku: 'MON-27', cat: 'MON', price: 7_990, redTag: false, flash: null, available: 5 },
];

/** ครบชุด 7 หมวดของลิงก์สเปก BEAM35K (TEST-DATA.md ข้อ 4) */
export const FULL_BUILD = ['CPU-N5', 'MB-B6', 'RAM-D4', 'GPU-V46', 'SSD-1T', 'PSU-550', 'CASE-M'];

export type QuoteCase = {
  id: string;
  items: { sku: string; qty: number }[];
  now: string;
  user: string;        // 'C1' = ไม่ล็อกอิน
  coupon?: string;
  shipping: 'standard' | 'express' | 'pickup';
  assembly?: boolean;
  province?: string;
  total: number;       // บาท
  vat: number;         // บาท ทศนิยม 2 ตำแหน่ง
  note?: string;
};

const i = (...pairs: (string | number)[]) => {
  const out: { sku: string; qty: number }[] = [];
  for (let k = 0; k < pairs.length; k += 2) out.push({ sku: String(pairs[k]), qty: Number(pairs[k + 1]) });
  return out;
};

/**
 * TEST-DATA.md ข้อ 5 — ตาราง quote 27 แถวที่คิดด้วยมือ และผ่านการคิดซ้ำโดย subagent อิสระ (ข้อ 9)
 * Q10 สั่งจริงไม่ได้เพราะ MON-27 มี 5 จอ จึงทดสอบที่ /api/quote เท่านั้น
 */
export const QUOTES: QuoteCase[] = [
  { id: 'Q01', items: i('SSD-1T', 1), now: '2026-11-13T10:00:00+07:00', user: 'C1', shipping: 'standard', total: 2_250, vat: 147.2 },
  { id: 'Q02', items: i('CPU-N5', 1), now: THU_1000, user: 'C2', coupon: 'NEWBIT200', shipping: 'standard', total: 6_090, vat: 398.41 },
  { id: 'Q03', items: i('CPU-N5', 1, 'MB-B6', 1), now: FRI_1230, user: 'C3', shipping: 'standard', total: 9_624, vat: 629.61 },
  { id: 'Q04', items: i('CPU-N5', 1, 'MB-B6', 1), now: '2026-11-12T12:30:00+07:00', user: 'C3', shipping: 'standard', total: 10_069, vat: 658.72 },
  { id: 'Q05', items: i('MB-B6', 1), now: '2026-11-13T12:59:59+07:00', user: 'C3', shipping: 'standard', total: 4_008, vat: 262.21 },
  { id: 'Q06', items: i('MB-B6', 1), now: '2026-11-13T13:00:00+07:00', user: 'C3', shipping: 'standard', total: 4_453, vat: 291.32 },
  { id: 'Q07', items: i('GPU-V46', 1), now: FRI_1230, user: 'C4', coupon: 'GAMER5', shipping: 'standard', total: 9_333, vat: 610.57 },
  { id: 'Q08', items: i('GPU-V57', 1, 'PSU-750', 1), now: THU_1000, user: 'C4', coupon: 'GAMER5', shipping: 'standard', total: 24_916, vat: 1_630.02 },
  { id: 'Q09', items: i('MON-27', 5), now: '2026-11-13T10:00:00+07:00', user: 'C5', coupon: 'GAMER5', shipping: 'standard', total: 35_754, vat: 2_339.05 },
  { id: 'Q10', items: i('MON-27', 10), now: '2026-11-13T10:00:00+07:00', user: 'C5', coupon: 'GAMER5', shipping: 'standard', total: 72_508, vat: 4_743.51, note: 'เกินสต็อก สั่งจริงไม่ได้ ทดสอบที่ /api/quote' },
  { id: 'Q11', items: i('CPU-N5', 5, 'MB-B6', 5, 'RAM-D4', 5), now: THU_1000, user: 'C5', shipping: 'standard', total: 53_682, vat: 3_511.91, note: 'VAT ทั้งบิล ไม่ใช่ต่อบรรทัด (3,511.92 ✗)' },
  { id: 'Q12', items: i('RAM-16', 1), now: THU_1000, user: 'C1', shipping: 'express', province: 'กรุงเทพมหานคร', total: 2_040, vat: 133.46 },
  { id: 'Q13', items: i('RAM-32', 1), now: THU_1000, user: 'C6', shipping: 'standard', total: 3_490, vat: 228.32 },
  { id: 'Q14', items: i(...FULL_BUILD.flatMap((s) => [s, 1])), now: THU_1000, user: 'C2', coupon: 'NEWBIT200', shipping: 'standard', assembly: true, total: 28_730, vat: 1_879.53 },
  { id: 'Q15', items: i('CPU-N5', 1, 'MB-B6', 1, 'RAM-D4', 1, 'SSD-1T', 1, 'PSU-550', 1, 'CASE-M', 1), now: THU_1000, user: 'C2', coupon: 'NEWBIT200', shipping: 'standard', assembly: true, total: 17_740, vat: 1_160.56 },
  { id: 'Q16', items: i(...FULL_BUILD.flatMap((s) => [s, 1])), now: FRI_1230, user: 'C4', shipping: 'standard', assembly: true, total: 25_748, vat: 1_684.45 },
  { id: 'Q17', items: i('CPU-N7', 1, 'MB-X7', 1), now: THU_1000, user: 'C1', shipping: 'pickup', total: 19_280, vat: 1_261.31 },
  { id: 'Q18', items: i('RAM-D4', 1, 'SSD-1T', 1), now: FRI_1230, user: 'C5', shipping: 'standard', total: 3_001, vat: 196.33 },
  { id: 'Q19', items: i('RAM-16', 1), now: THU_1000, user: 'C2', coupon: 'NEWBIT200', shipping: 'standard', total: 1_950, vat: 127.57, note: 'ยอดไม่ถึง ฿2,000 โค้ดถูกปฏิเสธ' },
  { id: 'Q20', items: i('CPU-N5', 1), now: THU_1000, user: 'C3', coupon: 'NEWBIT200', shipping: 'standard', total: 6_102, vat: 399.2, note: 'ไม่ใช่ออเดอร์แรก โค้ดถูกปฏิเสธ' },
  { id: 'Q21', items: i('SSD-1T', 1), now: THU_1000, user: 'C11', shipping: 'standard', total: 2_075, vat: 135.75 },
  { id: 'Q22', items: i('GPU-V46', 1, 'CPU-N5', 1), now: THU_1000, user: 'C4', coupon: 'GAMER5', shipping: 'standard', total: 16_346, vat: 1_069.36 },
  { id: 'Q23', items: i('CPU-N5', 2, 'MB-B6', 1), now: THU_1000, user: 'C2', shipping: 'standard', total: 16_670, vat: 1_090.56 },
  { id: 'Q24', items: i('GPU-V46', 1), now: FRI_1230, user: 'C1', coupon: 'GAMER5', shipping: 'standard', total: 9_824, vat: 642.69, note: 'ไม่ล็อกอินใช้ GAMER5 ได้ (A-41)' },
  { id: 'Q25', items: i('SSD-1T', 1), now: THU_1000, user: 'C2', coupon: 'NEWBIT200', shipping: 'standard', total: 2_050, vat: 134.11 },
  { id: 'Q26', items: i('CPU-N5', 1, 'MB-B6', 1), now: FRI_1230, user: 'C3', shipping: 'express', province: 'กรุงเทพมหานคร', total: 9_774, vat: 639.42 },
  { id: 'Q27', items: i('CPU-N5', 1, 'MB-B6', 1, 'MON-27', 1), now: '2026-11-06T18:22:00+07:00', user: 'C3', coupon: 'GAMER5', shipping: 'standard', total: 17_432, vat: 1_140.41 },
];

/** ออเดอร์และใบเสนอราคาที่ seed ไว้ (TEST-DATA.md ข้อ 4) */
export const SEED = {
  c3Delivered: 'BB-260910-0001',
  c4Returnable: 'BB-261106-0041',   // ได้รับ ศุกร์ 6 พ.ย. 15:00 · คืนได้ถึง 13 พ.ย. 23:59:59
  c4Cancellable: 'BB-261113-0001',  // จ่ายแล้ว ยังไม่แพ็ก
  c5Packed: 'BB-261112-0001',       // แพ็กแล้ว ยกเลิกไม่ได้
  c5Quote: 'Q-261106-0007',         // ยืนราคาถึง 13 พ.ย. 23:59:59 · ฿35,754
  buildCode: 'BEAM35K',
} as const;
