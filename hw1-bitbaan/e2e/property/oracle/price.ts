/**
 * ORACLE · ตัวคำนวณราคาที่ถูกต้อง สำหรับการบ้านขั้น 3
 *
 * เขียนจาก **เอกสารอย่างเดียว** ตามกติกาข้อ 3.1
 *   - `INTERVIEW.md` (บ.xx = บรรทัดในบันทึกสัมภาษณ์ · ราคาสินค้าข้อ 6.1)
 *   - `REQUIREMENTS.md` (BR-01…BR-40 · ตารางสมมติฐาน A-01…A-42)
 *   - `QUESTIONS-TO-OWNER.md` (คอลัมน์ "สมมติฐานที่ใช้ระหว่างรอ" · K1…K9 Q1…Q22)
 *   - `API-CONTRACT.md` เฉพาะ **รูปแบบ** response (ชื่อฟิลด์ g1…g4 vat preVat) ไม่ใช่กติกาคิดเงิน
 * ผู้เขียนไฟล์นี้ **ไม่ได้เปิด** `backend/` `frontend/` `design/` `TEST-DATA.md` และ `e2e/` ไฟล์อื่น
 * เหตุผล: ถ้า oracle ลอกตรรกะจากเว็บ บั๊กของเว็บจะถูกลอกมาด้วย property test จะเขียวทั้งที่ผิด (บท 03 T9)
 *
 * **หน่วยเงิน** คิดภายในเป็น *บาทเต็ม (integer)* ทุกขั้น แล้วคูณ 100 เป็นสตางค์ตอนคืนค่า
 * มีแค่ `vat` / `preVat` ที่มีเศษสตางค์ (BR-40 · API-CONTRACT ข้อ 1) · ห้ามใช้ float กับเงิน
 *
 * ลำดับคิดเงิน (A-10 / Q1 ข้อ ก)
 *
 * | ขั้น | ผล | กฎ | ที่มา |
 * | --- | --- | --- | --- |
 * | 1 | `listTotal` | ราคาป้ายข้อ 6.1 × จำนวน (ราคารวม VAT แล้ว) | บ.13, 6.1 |
 * | 2 | `g1` | − flash sale 10% ต่อชิ้น เฉพาะป้ายแดง ศุกร์ [12:00:00, 13:00:00) | BR-06 ถึง BR-08 · A-16 |
 * | 3 | `g2` | − ชุดประกอบ ฿500 × min(จำนวน CPU, จำนวนเมนบอร์ด) | BR-10 · A-03, A-14 |
 * | 4 | `g3` | − ส่วนลดสมาชิก = ปัดลง(G2 × อัตรา) | BR-11 · A-01, A-02, A-11 |
 * | 5 | `g4` | − คูปอง 1 โค้ด | BR-13, BR-15 ถึง BR-20 · A-12, A-13 |
 * | 6 | `total` | + ค่าประกอบ + ค่าส่ง | BR-21 ถึง BR-24 · A-04, A-15 |
 * | 7 | `vat`/`preVat` | VAT = ปัดครึ่งขึ้น(total × 7 ÷ 107, 2 ตำแหน่ง) ครั้งเดียวทั้งบิล | BR-40 · A-27 |
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
// 1. ข้อมูลสินค้า · คัดจาก INTERVIEW.md ข้อ 6.1 เท่านั้น (ราคาเป็นบาท รวม VAT แล้ว บ.13)
// ---------------------------------------------------------------------------

type Category = 'CPU' | 'MB' | 'RAM' | 'GPU' | 'SSD' | 'PSU' | 'CASE' | 'MON';

type CatalogRow = {
  sku: string;
  category: Category;
  /** ราคาป้าย หน่วยบาทเต็ม */
  priceBaht: number;
  /** ป้ายแดง = เข้าร่วม flash sale (BR-08 มี 4 รายการ) */
  redTag: boolean;
};

const CATALOG: CatalogRow[] = [
  { sku: 'CPU-N5', category: 'CPU', priceBaht: 6290, redTag: false },
  { sku: 'CPU-N7', category: 'CPU', priceBaht: 10990, redTag: false },
  { sku: 'MB-B6', category: 'MB', priceBaht: 4590, redTag: true },
  { sku: 'MB-X7', category: 'MB', priceBaht: 8790, redTag: false },
  { sku: 'RAM-D4', category: 'RAM', priceBaht: 1290, redTag: false },
  { sku: 'RAM-16', category: 'RAM', priceBaht: 1890, redTag: false },
  { sku: 'RAM-32', category: 'RAM', priceBaht: 3490, redTag: true },
  { sku: 'GPU-V46', category: 'GPU', priceBaht: 11490, redTag: true },
  { sku: 'GPU-V57', category: 'GPU', priceBaht: 23990, redTag: false },
  { sku: 'SSD-1T', category: 'SSD', priceBaht: 2190, redTag: true },
  { sku: 'PSU-550', category: 'PSU', priceBaht: 1990, redTag: false },
  { sku: 'PSU-750', category: 'PSU', priceBaht: 3290, redTag: false },
  { sku: 'CASE-M', category: 'CASE', priceBaht: 1590, redTag: false },
  { sku: 'CASE-L', category: 'CASE', priceBaht: 2490, redTag: false },
  { sku: 'MON-27', category: 'MON', priceBaht: 7990, redTag: false },
];

const BY_SKU: Record<string, CatalogRow> = {};
for (const row of CATALOG) BY_SKU[row.sku] = row;

function lookup(sku: string): CatalogRow | undefined {
  if (typeof sku !== 'string') return undefined;
  return Object.prototype.hasOwnProperty.call(BY_SKU, sku) ? BY_SKU[sku] : undefined;
}

/** 7 หมวดในหน้าจัดสเปก (บ.41) · จอไม่อยู่ในหน้าจัดสเปก (6.1 MON-27) */
const BUILDER_CATEGORIES: Category[] = ['CPU', 'MB', 'RAM', 'GPU', 'SSD', 'PSU', 'CASE'];

/** หมวดที่คูปอง GAMER5 ครอบคลุม (บ.32 "เฉพาะหมวดการ์ดจอและจอ") */
const GAMER5_CATEGORIES: Category[] = ['GPU', 'MON'];

// ตัวเลขคงที่ทั้งหมดเป็น "บาทเต็ม"
const FLASH_PERCENT = 10; // BR-06 บ.26
const BUNDLE_BAHT = 500; // BR-10 บ.37
const NEWBIT200_BAHT = 200; // BR-15 บ.31
const NEWBIT200_MIN_G3_BAHT = 2000; // BR-15 · ฐาน = G3 (A-12 / Q3a ข้อ ก)
const GAMER5_PERCENT = 5; // BR-18 บ.32
const GAMER5_CAP_BAHT = 1000; // BR-18 เพดานต่อออเดอร์ (A-13 / Q4b ข้อ ก)
const OLD2025_BAHT = 300; // 6.4
const ASSEMBLY_BAHT = 500; // BR-21 บ.44
const SHIP_STANDARD_BAHT = 60; // BR-22 บ.49
const SHIP_FREE_MIN_G4_BAHT = 3000; // BR-22 · ฐาน = G4 (A-15 / Q6a ข้อ ก)
const SHIP_EXPRESS_BAHT = 150; // BR-23 บ.50 ไม่มีส่งฟรี
const VAT_NUMERATOR = 7; // BR-40 บ.13 ราคารวม VAT 7% แล้ว
const VAT_DENOMINATOR = 107;

// ---------------------------------------------------------------------------
// 2. เวลา · input เป็น ISO 8601 พร้อม offset · ตีความเป็นเวลาไทย (UTC+7) เสมอ
// ---------------------------------------------------------------------------

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,9}))?(Z|z|[+-]\d{2}:?\d{2})?$/;

/** แปลง ISO 8601 เป็น epoch ms · คืน null เมื่ออ่านไม่ออก (ไม่ throw) */
function parseIsoMs(iso: string): number | null {
  if (typeof iso !== 'string') return null;
  const m = ISO_RE.exec(iso.trim());
  if (m === null) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const frac = m[7] === undefined ? 0 : Number((m[7] + '000').slice(0, 3));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  // ไม่ใส่ offset ถือเป็นเวลาไทย (+07:00) ตามหัวข้อ "เวลา" ของ API-CONTRACT ข้อ 1
  let offsetMinutes = 7 * 60;
  const zone = m[8];
  if (zone !== undefined) {
    if (zone === 'Z' || zone === 'z') {
      offsetMinutes = 0;
    } else {
      const sign = zone.charAt(0) === '-' ? -1 : 1;
      const digits = zone.slice(1).replace(':', '');
      offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    }
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, frac);
  if (Number.isNaN(utcMs)) return null;
  return utcMs - offsetMinutes * 60_000;
}

/** ปฏิทินไทย: วันในสัปดาห์ (0 = อาทิตย์) และวินาทีที่นับจากเที่ยงคืนของวันนั้น */
function thaiWallClock(epochMs: number): { dayOfWeek: number; secondOfDay: number } {
  const shifted = new Date(epochMs + 7 * 3_600_000);
  return {
    dayOfWeek: shifted.getUTCDay(),
    secondOfDay:
      shifted.getUTCHours() * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds(),
  };
}

const FRIDAY = 5;
const FLASH_START_SEC = 12 * 3600; // 12:00:00 นับ (BR-06)
const FLASH_END_SEC = 13 * 3600; // 13:00:00 ไม่นับแล้ว · ช่วงคือ [12:00:00, 13:00:00) (A-16 / Q7a ข้อ ก)

function isFlashActive(epochMs: number): boolean {
  const { dayOfWeek, secondOfDay } = thaiWallClock(epochMs);
  if (dayOfWeek !== FRIDAY) return false; // BR-07 flash sale มีเฉพาะวันศุกร์
  return secondOfDay >= FLASH_START_SEC && secondOfDay < FLASH_END_SEC;
}

/** OLD2025 หมดอายุสิ้นวัน 31 ธ.ค. 2025 เวลาไทย (BR-20 · 6.4) */
const OLD2025_EXPIRES_AT_MS = Date.UTC(2026, 0, 1, 0, 0, 0) - 7 * 3_600_000;

// ---------------------------------------------------------------------------
// 3. ตัวช่วยคำนวณ · ทุกตัวรับ/คืน "บาทเต็ม" ยกเว้นที่ระบุว่าเป็นสตางค์
// ---------------------------------------------------------------------------

/** ส่วนลดเป็น % ปัดลงเป็นบาทเต็มเสมอ (A-11 / Q2 ข้อ ก · บ.76) */
function percentDiscountBaht(baseBaht: number, percent: number): number {
  return Math.floor((baseBaht * percent) / 100);
}

/** ปัดครึ่งขึ้น 2 ตำแหน่ง = ปัดครึ่งขึ้นเป็นสตางค์เต็ม · ทำด้วย integer ล้วน (BR-40 · A-27 / Q18b ข้อ ก) */
function vatSatangOf(totalSatang: number): number {
  // round-half-up(T × 7 ÷ 107) = floor((2×7×T + 107) ÷ (2×107))
  return Math.floor((2 * VAT_NUMERATOR * totalSatang + VAT_DENOMINATOR) / (2 * VAT_DENOMINATOR));
}

/** อัตราส่วนลดสมาชิกเป็น % เต็ม (BR-01 ถึง BR-03 · บ.19–21) */
function memberRateOf(tier: OracleInput['tier'], loggedIn: boolean): number {
  // ไม่ล็อกอิน = tier null = ไม่มีส่วนลดสมาชิก (API-CONTRACT ข้อ 1 · บ.18 "สมาชิก")
  if (!loggedIn) return 0;
  if (tier === 'SILVER') return 3; // BR-01 ยอด 12 เดือน ≥ ฿20,000
  if (tier === 'GOLD') return 5; // BR-02 ยอด 12 เดือน ≥ ฿100,000
  if (tier === 'BUSINESS') return 8; // BR-03 ไม่ขึ้นกับยอดสะสม
  return 0; // GENERAL หรือ null → ไม่มีส่วนลด (C6 คุณต้นเป็นแบบนี้ ตาม A-09 / K9 ข้อ ก)
}

type CouponOutcome = { amountBaht: number; rejected: boolean };

const NO_COUPON: CouponOutcome = { amountBaht: 0, rejected: false };
const REJECTED: CouponOutcome = { amountBaht: 0, rejected: true };

/**
 * คิดคูปอง 1 โค้ดต่อออเดอร์ (BR-19 · บ.33)
 * ใช้ไม่ได้ = `rejected: true`, `amountBaht: 0` และ **ไม่ throw** (API-CONTRACT ข้อ 3.3 `POST /api/quote`)
 */
function evaluateCoupon(args: {
  code: string;
  nowMs: number;
  g3Baht: number;
  gamer5BaseBaht: number;
  memberRate: number;
  loggedIn: boolean;
  firstOrder: boolean;
}): CouponOutcome {
  const code = args.code.trim().toUpperCase();

  if (code === 'NEWBIT200') {
    // บ.31 "ลด ฿200 เมื่อซื้อครบ ฿2,000 ใช้ได้กับออเดอร์แรกของบัญชีเท่านั้น"
    if (!args.loggedIn) return REJECTED; // "ต้องเข้าสู่ระบบ" (BR-16 · A-12 / Q3c ข้อ ก)
    if (!args.firstOrder) return REJECTED; // "ใช้ได้กับออเดอร์แรกเท่านั้น" (BR-16)
    if (args.g3Baht < NEWBIT200_MIN_G3_BAHT) return REJECTED; // "ยอดไม่ถึง ฿2,000" · ฐาน = G3 (BR-15)
    return { amountBaht: Math.min(NEWBIT200_BAHT, args.g3Baht), rejected: false };
  }

  if (code === 'GAMER5') {
    // บ.32 "ลด 5% เฉพาะหมวดการ์ดจอและจอ ลดสูงสุด ฿1,000"
    // คนไม่ล็อกอินใช้ได้ (A-41) · บัญชี Business ใช้ได้ (A-08 / K8 ข้อ ก)
    if (args.gamer5BaseBaht <= 0) return REJECTED; // "ใช้ได้เฉพาะการ์ดจอและจอ" (FR-27)
    // BR-18 · ปัดลงครั้งเดียวตอนท้าย: ปัดลง(5% × ฐานหลัง flash × (100 − อัตราสมาชิก)%)
    const raw = Math.floor(
      (args.gamer5BaseBaht * GAMER5_PERCENT * (100 - args.memberRate)) / 10_000,
    );
    return { amountBaht: Math.min(raw, GAMER5_CAP_BAHT), rejected: false };
  }

  if (code === 'OLD2025') {
    // 6.4 ลด ฿300 หมดอายุ 31 ธ.ค. 2025 · BR-20 สิ้นวัน 31 ธ.ค. 2025 ยังใช้ได้
    if (args.nowMs >= OLD2025_EXPIRES_AT_MS) return REJECTED; // "โค้ดหมดอายุแล้ว"
    return { amountBaht: Math.min(OLD2025_BAHT, args.g3Baht), rejected: false };
  }

  return REJECTED; // "ไม่พบโค้ดนี้" (FR-27)
}

function invalidQuote(reason: string): OracleQuote {
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

// ---------------------------------------------------------------------------
// 4. ตัวคำนวณหลัก
// ---------------------------------------------------------------------------

export function quote(input: OracleInput): OracleQuote {
  // --- ตรวจ input ก่อน · เทียบกับ `400 INVALID_ITEMS` (API-CONTRACT ข้อ 3.3) ---
  if (input === null || input === undefined) return invalidQuote('INVALID_ITEMS');
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return invalidQuote('INVALID_ITEMS'); // ตะกร้าว่าง
  }

  const nowMs = parseIsoMs(input.now);
  if (nowMs === null) return invalidQuote('INVALID_NOW');

  /** รวมบรรทัดที่ sku ซ้ำกันเป็นบรรทัดเดียว (เอกสารไม่ได้พูดถึง ตะกร้าจริงมี sku ละ 1 บรรทัด) */
  const skuOrder: string[] = [];
  const qtyBySku: Record<string, number> = {};
  for (const line of input.items) {
    if (line === null || line === undefined) return invalidQuote('INVALID_ITEMS');
    if (lookup(line.sku) === undefined) return invalidQuote('INVALID_ITEMS'); // sku ไม่มีในข้อ 6.1
    if (!Number.isInteger(line.qty) || line.qty < 1) return invalidQuote('INVALID_ITEMS'); // qty < 1
    const seen = qtyBySku[line.sku];
    if (seen === undefined) {
      skuOrder.push(line.sku);
      qtyBySku[line.sku] = line.qty;
    } else {
      qtyBySku[line.sku] = seen + line.qty;
    }
  }

  const flashActive = isFlashActive(nowMs);

  // --- ขั้น 1–2 · ราคาป้าย และ flash sale (BR-06 ถึง BR-08) ---
  let listTotalBaht = 0;
  let flashDiscountBaht = 0;
  /** ฐานของ GAMER5 = ราคาหลัง flash sale ของการ์ดจอและจอ (BR-18 · A-13 / Q4a ข้อ ก) */
  let gamer5BaseBaht = 0;
  let cpuQty = 0;
  let mbQty = 0;
  const categoriesPresent: Category[] = [];

  for (const sku of skuOrder) {
    const row = lookup(sku);
    const qty = qtyBySku[sku];
    if (row === undefined || qty === undefined) return invalidQuote('INVALID_ITEMS'); // กันไว้ ไม่เกิดจริง
    if (categoriesPresent.indexOf(row.category) === -1) categoriesPresent.push(row.category);

    // flash sale ลด 10% **ต่อชิ้น** เฉพาะป้ายแดง · ปัดลงเป็นบาทเต็มตาม A-11
    const unitFlashDiscount =
      flashActive && row.redTag ? percentDiscountBaht(row.priceBaht, FLASH_PERCENT) : 0;
    const unitAfterFlash = row.priceBaht - unitFlashDiscount;

    listTotalBaht += row.priceBaht * qty;
    flashDiscountBaht += unitFlashDiscount * qty;

    if (GAMER5_CATEGORIES.indexOf(row.category) !== -1) gamer5BaseBaht += unitAfterFlash * qty;
    if (row.category === 'CPU') cpuQty += qty;
    if (row.category === 'MB') mbQty += qty;
  }

  const g1Baht = listTotalBaht - flashDiscountBaht;

  // --- ขั้น 3 · ชุดประกอบ (BR-10) ---
  // A-03 / K3 ข้อ ก: ต้องมี CPU + เมนบอร์ด เท่านั้น (ไม่ต้องมีแรมตามที่คุณมิ้นท์ บ.73 ทำอยู่)
  // A-14 / Q5a ข้อ ก: ลดตามจำนวนคู่ · Q5b ข้อ ก: ไม่สนว่า socket ตรงกันไหม
  const bundles = Math.min(cpuQty, mbQty);
  // Math.min กับ g1 เป็นแค่ยามกันยอดติดลบ ไม่ใช่กฎของร้าน · ไม่เกิดกับราคาในข้อ 6.1
  const bundleDiscountBaht = Math.min(BUNDLE_BAHT * bundles, g1Baht);
  const g2Baht = g1Baht - bundleDiscountBaht;

  // --- ขั้น 4 · ส่วนลดสมาชิก (BR-11, BR-12) ---
  // A-02 / K2 ข้อ ก: ป้ายแดงช่วง flash sale ยังหักสมาชิกซ้อนได้ (บ.27)
  const memberRate = memberRateOf(input.tier, input.loggedIn);
  const memberDiscountBaht = percentDiscountBaht(g2Baht, memberRate);
  const g3Baht = g2Baht - memberDiscountBaht;

  // --- ขั้น 5 · คูปอง (BR-13, BR-15 ถึง BR-20) ---
  // A-01 / K1 ข้อ ก: สมาชิกคิดก่อน แล้วคูปองคิดต่อจากยอดที่ลดสมาชิกแล้ว (บ.22)
  const couponCode = typeof input.coupon === 'string' ? input.coupon.trim() : '';
  const coupon =
    couponCode === ''
      ? NO_COUPON
      : evaluateCoupon({
          code: couponCode,
          nowMs,
          g3Baht,
          gamer5BaseBaht,
          memberRate,
          loggedIn: input.loggedIn === true,
          firstOrder: input.firstOrder === true,
        });
  const g4Baht = g3Baht - coupon.amountBaht;

  // --- ขั้น 6 · ค่าประกอบ (BR-21) ---
  // A-04 / K4 ข้อ ก: ฟรีเมื่อมีครบ 7 หมวดในหน้าจัดสเปก (จอไม่นับ) · A-37 ค่าประกอบไม่ได้ส่วนลดใด ๆ
  const hasFullBuild = BUILDER_CATEGORIES.every((cat) => categoriesPresent.indexOf(cat) !== -1);
  const assemblyFeeBaht = input.assembly === true && !hasFullBuild ? ASSEMBLY_BAHT : 0;

  // --- ขั้น 6 · ค่าส่ง (BR-22 ถึง BR-24) ---
  // A-15 / Q6a ข้อ ก: ฐานส่งฟรี = G4 (หลังส่วนลดทั้งหมด) · Q6b ข้อ ก: ไม่รวมค่าประกอบ
  let shippingFeeBaht = 0;
  if (input.shipping === 'standard') {
    shippingFeeBaht = g4Baht >= SHIP_FREE_MIN_G4_BAHT ? 0 : SHIP_STANDARD_BAHT;
  } else if (input.shipping === 'express') {
    shippingFeeBaht = SHIP_EXPRESS_BAHT; // ไม่มีส่งฟรี (BR-23) · ข้อจำกัดจังหวัดไม่อยู่ในขอบเขต oracle
  } else if (input.shipping === 'pickup') {
    shippingFeeBaht = 0; // BR-24 รับที่ร้านฟรี
  } else {
    return invalidQuote('INVALID_SHIPPING');
  }

  const totalBaht = g4Baht + assemblyFeeBaht + shippingFeeBaht;

  // --- ขั้น 7 · VAT (BR-40) ---
  // ยอดชำระเป็นบาทเต็มเสมอ (BR-14) จึงคูณ 100 ได้ตรง ๆ · VAT คิดครั้งเดียวทั้งบิล (A-27 / Q18a ข้อ ก)
  const totalSatang = totalBaht * 100;
  const vatSatang = vatSatangOf(totalSatang);

  return {
    valid: true,
    listTotal: listTotalBaht * 100,
    flashDiscount: flashDiscountBaht * 100,
    g1: g1Baht * 100,
    bundleDiscount: bundleDiscountBaht * 100,
    g2: g2Baht * 100,
    memberRate, // เป็น % เต็ม (3 / 5 / 8) ไม่ใช่สตางค์ ตาม API-CONTRACT ข้อ 3.3
    memberDiscount: memberDiscountBaht * 100,
    g3: g3Baht * 100,
    couponAmount: coupon.amountBaht * 100,
    couponRejected: coupon.rejected,
    g4: g4Baht * 100,
    assemblyFee: assemblyFeeBaht * 100,
    shippingFee: shippingFeeBaht * 100,
    total: totalSatang,
    vat: vatSatang,
    preVat: totalSatang - vatSatang, // BR-40 มูลค่าก่อน VAT = ยอดชำระ − VAT
  };
}
