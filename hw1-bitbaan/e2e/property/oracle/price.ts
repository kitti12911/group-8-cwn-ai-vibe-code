/**
 * ORACLE · ตัวคำนวณราคาที่ถูกต้อง สำหรับการบ้านขั้น 3
 *
 * เขียนจากเอกสาร 3 ไฟล์เท่านั้น: INTERVIEW.md (ข้อ 6.1) · REQUIREMENTS.md (BR-06 ถึง BR-24, BR-40,
 * A-01 ถึง A-42) · QUESTIONS-TO-OWNER.md (คอลัมน์ "สมมติฐานที่ใช้ระหว่างรอ")
 * ไม่ได้เปิด backend/ frontend/ design/ หรือไฟล์อื่นใน e2e/
 *
 * คิดเป็นจำนวนเต็มทุกขั้น: ราคา ส่วนลด ยอดชำระเป็นบาทเต็ม แล้วคูณ 100 เป็นสตางค์ตอนคืนค่า
 * มีแค่ vat และ preVat ที่มีเศษสตางค์
 */
export const ORACLE_READY = true;

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

// ---------------------------------------------------------------------------
// ข้อมูลสินค้า · INTERVIEW.md ข้อ 6.1 (ราคาเป็นบาทเต็ม รวม VAT แล้ว)
// ---------------------------------------------------------------------------

type Category = 'CPU' | 'MB' | 'RAM' | 'GPU' | 'SSD' | 'PSU' | 'CASE' | 'MON';

/** stock เก็บไว้อ้างอิงเท่านั้น · oracle ไม่ใช้ตรวจ (ตรวจตอนกดสั่ง) */
type Product = { price: number; stock: number; red: boolean; cat: Category };

const PRODUCTS: Record<string, Product> = {
  'CPU-N5': { price: 6290, stock: 8, red: false, cat: 'CPU' },
  'CPU-N7': { price: 10990, stock: 5, red: false, cat: 'CPU' },
  'MB-B6': { price: 4590, stock: 6, red: true, cat: 'MB' },
  'MB-X7': { price: 8790, stock: 3, red: false, cat: 'MB' },
  'RAM-D4': { price: 1290, stock: 10, red: false, cat: 'RAM' },
  'RAM-16': { price: 1890, stock: 20, red: false, cat: 'RAM' },
  'RAM-32': { price: 3490, stock: 12, red: true, cat: 'RAM' },
  'GPU-V46': { price: 11490, stock: 4, red: true, cat: 'GPU' },
  'GPU-V57': { price: 23990, stock: 1, red: false, cat: 'GPU' },
  'SSD-1T': { price: 2190, stock: 15, red: true, cat: 'SSD' },
  'PSU-550': { price: 1990, stock: 6, red: false, cat: 'PSU' },
  'PSU-750': { price: 3290, stock: 7, red: false, cat: 'PSU' },
  'CASE-M': { price: 1590, stock: 9, red: false, cat: 'CASE' },
  'CASE-L': { price: 2490, stock: 4, red: false, cat: 'CASE' },
  'MON-27': { price: 7990, stock: 5, red: false, cat: 'MON' },
};

/** 7 หมวดของหน้าจัดสเปก (FR-08) · ไม่มีจอ */
const BUILD_CATEGORIES: Category[] = ['CPU', 'MB', 'RAM', 'GPU', 'SSD', 'PSU', 'CASE'];

// ---------------------------------------------------------------------------
// ตัวเลขของกฎ
// ---------------------------------------------------------------------------

const FLASH_PERCENT = 10; // BR-06
const FLASH_START_SEC = 12 * 3600; // 12:00:00 รวม
const FLASH_END_SEC = 13 * 3600; // 13:00:00 ไม่รวม (A-16)
const FRIDAY = 5; // 0 = อาทิตย์

const BUNDLE_PER_PAIR = 500; // BR-10, A-14

/** อัตราส่วนลดสมาชิกเป็น % จำนวนเต็ม (BR-01 ถึง BR-03) */
const MEMBER_PERCENT: Record<'GENERAL' | 'SILVER' | 'GOLD' | 'BUSINESS', number> = {
  GENERAL: 0,
  SILVER: 3,
  GOLD: 5,
  BUSINESS: 8,
};

const NEWBIT_AMOUNT = 200; // BR-15
const NEWBIT_MIN_G3 = 2000; // BR-15, A-12
const GAMER_PERCENT = 5; // BR-18
const GAMER_CAP = 1000; // BR-18, A-13 ต่อออเดอร์
const OLD2025_AMOUNT = 300; // INTERVIEW 6.4

const ASSEMBLY_FEE = 500; // BR-21
const STANDARD_FEE = 60; // BR-22
const FREE_SHIP_MIN_G4 = 3000; // BR-22, A-15
const EXPRESS_FEE = 150; // BR-23
const PICKUP_FEE = 0; // BR-24

const VAT_NUM = 7; // BR-40
const VAT_DEN = 107;

// ---------------------------------------------------------------------------
// เลขจำนวนเต็ม
// ---------------------------------------------------------------------------

/** เศษที่ไม่ติดลบ */
function mod(a: number, b: number): number {
  const r = a % b;
  return r < 0 ? r + b : r;
}

/** หารปัดลงแบบจำนวนเต็มล้วน (ผลลัพธ์ของ (a − เศษ) / b หารลงตัวเสมอ) */
function floorDiv(a: number, b: number): number {
  return (a - mod(a, b)) / b;
}

/** ปัดครึ่งขึ้น(a ÷ b) สำหรับ a ≥ 0, b > 0 */
function roundHalfUpDiv(a: number, b: number): number {
  return floorDiv(2 * a + b, 2 * b);
}

// ---------------------------------------------------------------------------
// เวลา · ตีความเป็นเวลาไทย (UTC+7) เสมอ
// ---------------------------------------------------------------------------

const MS_PER_SEC = 1000;
const MS_PER_DAY = 86_400_000;
const THAI_OFFSET_MS = 7 * 3600 * MS_PER_SEC;

/**
 * แปลง ISO 8601 เป็น "มิลลิวินาทีตามนาฬิกาไทย" (wall clock ไทย นับจาก 1970-01-01 00:00 ไทย)
 * คืน null ถ้ารูปแบบผิด
 */
function thaiWallMs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?(Z|[+-]\d{2}:?\d{2})$/.exec(
    iso.trim(),
  );
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const h = parseInt(m[4], 10);
  const mi = parseInt(m[5], 10);
  const s = m[6] ? parseInt(m[6], 10) : 0;
  const ms = m[7] ? parseInt((m[7] + '00').slice(0, 3), 10) : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;

  let offsetMs = 0;
  const z = m[8];
  if (z !== 'Z') {
    const sign = z[0] === '-' ? -1 : 1;
    const digits = z.slice(1).replace(':', '');
    const oh = parseInt(digits.slice(0, 2), 10);
    const om = parseInt(digits.slice(2, 4), 10);
    offsetMs = sign * (oh * 60 + om) * 60 * MS_PER_SEC;
  }
  // Date.UTC รับและคืนจำนวนเต็ม
  const wallAtGivenOffset = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  if (!Number.isInteger(wallAtGivenOffset)) return null;
  const utcMs = wallAtGivenOffset - offsetMs;
  return utcMs + THAI_OFFSET_MS;
}

function isFlashTime(wallMs: number): boolean {
  const day = floorDiv(wallMs, MS_PER_DAY);
  const dow = mod(day + 4, 7); // 1970-01-01 เป็นวันพฤหัส
  if (dow !== FRIDAY) return false;
  const secOfDay = floorDiv(mod(wallMs, MS_PER_DAY), MS_PER_SEC);
  return secOfDay >= FLASH_START_SEC && secOfDay < FLASH_END_SEC;
}

/** OLD2025 ใช้ได้ถึง 31 ธ.ค. 2025 23:59:59 เวลาไทย (BR-20) */
const OLD2025_EXPIRES_WALL_MS = Date.UTC(2026, 0, 1, 0, 0, 0, 0); // ไม่รวม

// ---------------------------------------------------------------------------
// ผลลัพธ์
// ---------------------------------------------------------------------------

function invalid(reason: string): OracleQuote {
  return {
    valid: false,
    reason,
    listTotal: 0,
    flashDiscount: 0,
    g1: 0,
    bundleDiscount: 0,
    g2: 0,
    memberRate: 0,
    memberDiscount: 0,
    g3: 0,
    couponAmount: 0,
    couponRejected: false,
    g4: 0,
    assemblyFee: 0,
    shippingFee: 0,
    total: 0,
    vat: 0,
    preVat: 0,
  };
}

const SATANG = 100;

export function quote(input: OracleInput): OracleQuote {
  // --- ตรวจตะกร้า -----------------------------------------------------------
  if (!input.items || input.items.length === 0) return invalid('ตะกร้าว่าง');

  const qtyBySku = new Map<string, number>();
  for (const it of input.items) {
    if (!(it.sku in PRODUCTS)) return invalid(`ไม่พบสินค้า ${it.sku}`);
    if (!Number.isInteger(it.qty) || it.qty < 1) return invalid(`จำนวนของ ${it.sku} ไม่ถูกต้อง`);
    qtyBySku.set(it.sku, (qtyBySku.get(it.sku) ?? 0) + it.qty);
  }
  // จำนวนในสต็อก (BR-33) และสิทธิ์คนละ 1 ใบ (BR-31) ตรวจตอนกดสั่ง (FR-36, FR-38) ไม่ใช่ตอนคิดราคา

  const wallMs = thaiWallMs(input.now);
  if (wallMs === null) return invalid('เวลาไม่ถูกต้อง');
  const flash = isFlashTime(wallMs);

  // --- ราคาป้าย → G1 (flash sale ต่อชิ้น · BR-06 ถึง BR-08) ------------------
  let listTotal = 0;
  let flashDiscount = 0;
  let gamerBase = 0; // ราคาหลัง flash ของการ์ดจอและจอ (BR-18)
  const qtyByCat = new Map<Category, number>();

  for (const [sku, qty] of qtyBySku) {
    const p = PRODUCTS[sku];
    const perUnitFlash = flash && p.red ? floorDiv(p.price * FLASH_PERCENT, 100) : 0;
    const unitAfterFlash = p.price - perUnitFlash;
    listTotal += p.price * qty;
    flashDiscount += perUnitFlash * qty;
    if (p.cat === 'GPU' || p.cat === 'MON') gamerBase += unitAfterFlash * qty;
    qtyByCat.set(p.cat, (qtyByCat.get(p.cat) ?? 0) + qty);
  }
  const g1 = listTotal - flashDiscount;

  // --- ชุดประกอบ → G2 (BR-10 · A-03 · A-14) --------------------------------
  const pairs = Math.min(qtyByCat.get('CPU') ?? 0, qtyByCat.get('MB') ?? 0);
  const bundleDiscount = Math.min(BUNDLE_PER_PAIR * pairs, g1);
  const g2 = g1 - bundleDiscount;

  // --- สมาชิก → G3 (BR-11 · FR-28 คิดจากบัญชีที่ล็อกอิน) ----------------------
  const memberRate = input.loggedIn && input.tier ? MEMBER_PERCENT[input.tier] : 0;
  const memberDiscount = floorDiv(g2 * memberRate, 100);
  const g3 = g2 - memberDiscount;

  // --- คูปอง → G4 (BR-13 ถึง BR-20) ----------------------------------------
  let couponAmount = 0;
  let couponRejected = false;
  const code = (input.coupon ?? '').trim().toUpperCase();
  if (code !== '') {
    if (code === 'NEWBIT200') {
      // BR-15, BR-16, A-12: ต้องล็อกอิน · ออเดอร์แรก · G3 ≥ 2,000
      if (input.loggedIn && input.firstOrder && g3 >= NEWBIT_MIN_G3) couponAmount = NEWBIT_AMOUNT;
      else couponRejected = true;
    } else if (code === 'GAMER5') {
      // BR-18, A-13, A-41: ปัดลงครั้งเดียว(5% × ฐานหลัง flash × (100 − อัตราสมาชิก)%) เพดาน 1,000
      if (gamerBase > 0) {
        const raw = floorDiv(gamerBase * GAMER_PERCENT * (100 - memberRate), 100 * 100);
        couponAmount = Math.min(raw, GAMER_CAP);
      } else {
        couponRejected = true;
      }
    } else if (code === 'OLD2025') {
      // BR-20, ข้อ 6.4: ลด 300 ใช้ได้ถึงสิ้นวัน 31 ธ.ค. 2025
      if (wallMs < OLD2025_EXPIRES_WALL_MS) couponAmount = OLD2025_AMOUNT;
      else couponRejected = true;
    } else {
      couponRejected = true; // ไม่พบโค้ดนี้
    }
  }
  if (couponAmount > g3) couponAmount = g3;
  const g4 = g3 - couponAmount;

  // --- ค่าประกอบ (BR-21 · A-04 · A-37 ไม่มีส่วนลด) -----------------------------
  let assemblyFee = 0;
  if (input.assembly) {
    const fullSet = BUILD_CATEGORIES.every((c) => (qtyByCat.get(c) ?? 0) === 1);
    assemblyFee = fullSet ? 0 : ASSEMBLY_FEE;
  }

  // --- ค่าส่ง (BR-22 ถึง BR-24 · A-15 ฐาน G4 ไม่รวมค่าประกอบ) -----------------
  let shippingFee: number;
  if (input.shipping === 'standard') shippingFee = g4 >= FREE_SHIP_MIN_G4 ? 0 : STANDARD_FEE;
  else if (input.shipping === 'express') shippingFee = EXPRESS_FEE;
  else shippingFee = PICKUP_FEE;

  // --- ยอดชำระ และ VAT (BR-13, BR-14, BR-40) --------------------------------
  const total = g4 + assemblyFee + shippingFee;
  const totalSatang = total * SATANG;
  const vat = roundHalfUpDiv(totalSatang * VAT_NUM, VAT_DEN);
  const preVat = totalSatang - vat;

  return {
    valid: true,
    listTotal: listTotal * SATANG,
    flashDiscount: flashDiscount * SATANG,
    g1: g1 * SATANG,
    bundleDiscount: bundleDiscount * SATANG,
    g2: g2 * SATANG,
    memberRate,
    memberDiscount: memberDiscount * SATANG,
    g3: g3 * SATANG,
    couponAmount: couponAmount * SATANG,
    couponRejected,
    g4: g4 * SATANG,
    assemblyFee: assemblyFee * SATANG,
    shippingFee: shippingFee * SATANG,
    total: totalSatang,
    vat,
    preVat,
  };
}
