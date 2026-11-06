import type { BuilderCat, Category, OrderStatus, Tier } from './types';

/** 962400 → "9,624.00" (integer math, no float rounding). Negative values get a leading "−". */
export function baht(satang: number): string {
  const n = Math.round(Number(satang) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const frac = String(abs % 100).padStart(2, '0');
  return `${neg ? '−' : ''}${whole}.${frac}`;
}

/** 962400 → "฿9,624.00" */
export function thb(satang: number): string {
  const s = baht(satang);
  return s.startsWith('−') ? `−฿${s.slice(1)}` : `฿${s}`;
}

/** Whole-baht form used inside sentences: 114900 → "฿1,149" (decimals only if there are satang). */
export function thbShort(satang: number): string {
  const n = Math.round(Number(satang) || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const frac = abs % 100;
  return `${sign}฿${whole}${frac ? '.' + String(frac).padStart(2, '0') : ''}`;
}

/** Discount value for the price ladder: 0 → "0.00", 45900 → "−459.00". */
export function discount(satang: number): string {
  return satang ? baht(-Math.abs(satang)) : baht(0);
}

// ---- dates (always shown in Asia/Bangkok, UTC+7, no DST) ----

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const pad = (n: number) => String(n).padStart(2, '0');

function bkk(iso: string | number | Date): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 7 * 3600 * 1000); // read with getUTC*
}

/** "13:12:00" */
export function timeHMS(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = bkk(iso);
  if (!d) return '–';
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** "13:12" */
export function timeHM(iso: string | null | undefined): string {
  return timeHMS(iso).slice(0, 5);
}

/** "ศ. 13 พ.ย. 2026" */
export function dateTH(iso: string | null | undefined, withDay = false): string {
  if (!iso) return '–';
  const d = bkk(iso);
  if (!d) return '–';
  const base = `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withDay ? `${TH_DAYS[d.getUTCDay()]} ${base}` : base;
}

/** "13 พ.ย. 2026 12:42:00" */
export function dateTimeTH(iso: string | null | undefined, withDay = false): string {
  if (!iso) return '–';
  return `${dateTH(iso, withDay)} ${timeHMS(iso)}`;
}

/** seconds → "mm:ss" (minutes may exceed 59). */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** seconds → "hh:mm:ss" with optional leading days. */
export function dhms(totalSeconds: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(totalSeconds));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
export { pad as pad2 };

// ---- labels ----

export const CATEGORY_LABEL: Record<Category, string> = {
  CPU: 'CPU',
  MB: 'เมนบอร์ด',
  RAM: 'แรม',
  GPU: 'การ์ดจอ',
  SSD: 'SSD',
  PSU: 'พาวเวอร์ซัพพลาย',
  CASE: 'เคส',
  MON: 'จอ',
};
export const CATEGORIES: Category[] = ['CPU', 'MB', 'RAM', 'GPU', 'SSD', 'PSU', 'CASE', 'MON'];

export const BUILDER_CATS: BuilderCat[] = ['cpu', 'mb', 'ram', 'gpu', 'ssd', 'psu', 'case'];
export const BUILDER_LABEL: Record<BuilderCat, string> = {
  cpu: 'CPU',
  mb: 'เมนบอร์ด',
  ram: 'แรม',
  gpu: 'การ์ดจอ',
  ssd: 'SSD',
  psu: 'พาวเวอร์',
  case: 'เคส',
};
export function builderLabel(cat: string): string {
  return BUILDER_LABEL[cat.toLowerCase() as BuilderCat] ?? cat;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'รอชำระเงิน',
  PAID: 'ชำระแล้ว · รอแพ็กของ',
  PACKED: 'แพ็กแล้ว',
  SHIPPED: 'ส่งแล้ว',
  DELIVERED: 'ได้รับแล้ว',
  EXPIRED: 'หมดเวลา',
  CANCELLED: 'ยกเลิกแล้ว',
  RETURNED: 'คืนของแล้ว',
};
export function statusLabel(s: string): string {
  return STATUS_LABEL[s as OrderStatus] ?? s;
}

export const TIER_LABEL: Record<Tier, string> = {
  GENERAL: 'ทั่วไป',
  SILVER: 'Silver',
  GOLD: 'Gold',
  BUSINESS: 'Business',
};
export function tierLabel(t: Tier | null | undefined): string {
  return t ? TIER_LABEL[t] ?? t : 'ไม่ได้เข้าสู่ระบบ';
}

export const PROVINCES = ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'เชียงใหม่'];

export function stockText(available: number): string {
  if (available <= 0) return 'สินค้าหมด';
  if (available === 1) return 'เหลือ 1 ชิ้นสุดท้าย';
  return `เหลือ ${available} ชิ้น`;
}
