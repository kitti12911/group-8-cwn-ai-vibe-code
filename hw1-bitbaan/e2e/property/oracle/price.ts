/**
 * ORACLE · ตัวคำนวณราคาที่ถูกต้อง สำหรับการบ้านขั้น 3
 *
 * ⚠️ **ไฟล์นี้ยังเป็นโครงเปล่า โดยตั้งใจ**
 *
 * กติกาของการบ้านข้อ 3.1 บังคับว่า oracle ต้องถูกเขียนโดยคนหรือ AI ที่
 * **ไม่เคยเห็นโค้ดใน `backend/`** มิฉะนั้นบั๊กของเว็บจะถูกคัดลอกมาอยู่ใน oracle ด้วย
 * แล้ว property test จะผ่านตลอดทั้งที่ผิด ("อบบั๊ก" บท 03 T9) และเกณฑ์ C จะได้ 0
 *
 * วิธีสร้างไฟล์นี้ให้ถูกกติกา
 *   1. เปิด Claude Code **เซสชันใหม่** ในโฟลเดอร์ที่มีแค่เอกสาร (หรือสั่งห้ามเปิด `backend/`, `frontend/`, `e2e/`)
 *   2. วางพรอมต์จาก `prompts/05-oracle-independent.txt`
 *   3. เอาไฟล์ที่ได้มาวางทับไฟล์นี้ แล้วรัน `npm run test:oracle`
 *      ต้องผ่านตาราง quote ครบ 27 แถวก่อน จึงจะเชื่อผล property test ได้
 *
 * เมื่อวางทับแล้ว ให้ตั้ง `ORACLE_READY = true`
 */
export const ORACLE_READY = false;

export type OracleInput = {
  items: { sku: string; qty: number }[];
  /** ISO 8601 พร้อม offset +07:00 */
  now: string;
  tier: 'GENERAL' | 'SILVER' | 'GOLD' | 'BUSINESS' | null;
  loggedIn: boolean;
  firstOrder: boolean;
  coupon?: string;
  shipping: 'standard' | 'express' | 'pickup';
  assembly: boolean;
};

/** ทุกค่าเป็น **สตางค์ (integer)** ตาม `API-CONTRACT.md` */
export type OracleQuote = {
  valid: boolean;
  reason?: string;
  listTotal: number;
  flashDiscount: number;
  g1: number;
  bundleDiscount: number;
  g2: number;
  memberRate: number;
  memberDiscount: number;
  g3: number;
  couponAmount: number;
  couponRejected: boolean;
  g4: number;
  assemblyFee: number;
  shippingFee: number;
  total: number;
  vat: number;
  preVat: number;
};

export function quote(_input: OracleInput): OracleQuote {
  throw new Error(
    'ยังไม่มี oracle · ดูวิธีสร้างที่หัวไฟล์ e2e/property/oracle/price.ts และ prompts/05-oracle-independent.txt',
  );
}
