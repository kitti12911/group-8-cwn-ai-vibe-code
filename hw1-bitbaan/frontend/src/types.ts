// Types mirror API-CONTRACT.md. Money is always integer satang.

export type Category = 'CPU' | 'MB' | 'RAM' | 'GPU' | 'SSD' | 'PSU' | 'CASE' | 'MON';
export type BuilderCat = 'cpu' | 'mb' | 'ram' | 'gpu' | 'ssd' | 'psu' | 'case';
export type Tier = 'GENERAL' | 'SILVER' | 'GOLD' | 'BUSINESS';
export type Shipping = 'standard' | 'express' | 'pickup';
export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'RETURNED';

export interface ProductSpecs {
  socket?: string | null;
  ramType?: string | null;
  formFactor?: string | null;
  caseSupports?: string[] | null;
  gpuLengthMm?: number | null;
  caseMaxGpuMm?: number | null;
  tdpW?: number | null;
  recommendedPsuW?: number | null;
  psuOutputW?: number | null;
  [k: string]: unknown;
}

export interface Product {
  sku: string;
  name: string;
  category: Category;
  price: number;
  redTag: boolean;
  currentPrice: number;
  memberPrice: number | null;
  available: number;
  perBuyerLimit: number | null;
  inBuilder: boolean;
  specs: ProductSpecs;
  nextLot?: { qty: number; releaseAt: string } | null;
}

export interface TimeInfo {
  now: string;
  flash: { active: boolean; endsAt: string | null; nextStart: string };
}

export type BuilderParts = Record<BuilderCat, string | null>;

export interface BuilderConflict {
  categories: string[];
  code: string;
  message: string;
}
export interface BuilderWarning {
  code: string;
  message: string;
  suggestSku?: string | null;
}
export interface BuilderOption {
  sku: string;
  allowed: boolean;
  reason?: string | null;
}
export interface BuilderResult {
  total: number;
  budget: number | null;
  remaining: number | null;
  overBudget: boolean;
  assemblyFee: number;
  missingCategories: string[];
  conflicts: BuilderConflict[];
  warnings: BuilderWarning[];
  options: Partial<Record<string, BuilderOption[]>>;
  canAddToCart: boolean;
}
export interface BuilderInput {
  parts: BuilderParts;
  budget?: number;
  assembly: boolean;
}
export interface SavedBuild {
  code: string;
  savedAt: string;
  budget: number | null;
  assembly: boolean;
  items: {
    category: string;
    sku: string;
    name: string;
    priceAtSave: number;
    currentPrice: number;
    diff: number;
    available: number;
  }[];
  evaluation: BuilderResult;
}

export interface CartItem {
  sku: string;
  qty: number;
}

export interface OrderInput {
  items: CartItem[];
  coupon?: string;
  shipping: Shipping;
  province?: string;
  assembly?: boolean;
}

export interface QuoteLine {
  sku: string;
  name: string;
  category: string;
  qty: number;
  unitPrice: number;
  unitFlashPrice: number | null;
  amount: number;
}
export interface Quote {
  pricedAt: string;
  lines: QuoteLine[];
  listTotal: number;
  flashDiscount: number;
  g1: number;
  bundles: number;
  bundleDiscount: number;
  g2: number;
  tier: Tier | null;
  memberRate: number;
  memberDiscount: number;
  g3: number;
  coupon: {
    code: string | null;
    status: 'APPLIED' | 'REJECTED' | 'NONE';
    reason: string | null;
    amount: number;
  };
  g4: number;
  assemblyFee: number;
  shippingFee: number;
  total: number;
  vat: number;
  preVat: number;
}

export interface PlacedOrder {
  orderNo: string;
  status: OrderStatus;
  placedAt: string;
  holdUntil: string;
  quote: Quote;
}

export interface Refund {
  id: string | number;
  kind: 'CANCEL' | 'RETURN';
  amount: number;
  fee: number;
  status: 'PENDING' | 'DONE';
  requestedAt: string | null;
  refundedAt: string | null;
}

export interface Order {
  orderNo: string;
  status: OrderStatus;
  placedAt: string;
  holdUntil: string | null;
  paidAt: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  returnedAt: string | null;
  buyer: { code: string | null; name: string; phone: string; email: string };
  shipping: Shipping;
  address: { line: string; province: string } | null;
  quote: Quote;
  canCancel: boolean;
  canReturn: boolean;
  returnUntil: string | null;
  refunds: Refund[];
}

export interface OrderSummary {
  orderNo: string;
  status: OrderStatus;
  placedAt: string;
  total: number;
}

export interface InvoiceLine {
  sku?: string;
  name?: string;
  qty?: number;
  unitPrice?: number;
  amount?: number;
  [k: string]: unknown;
}
export interface Invoice {
  invoiceNo: string;
  orderNo: string;
  issuedAt: string;
  buyer: { name: string; company: string | null; taxId: string | null };
  lines: InvoiceLine[];
  total: number;
  vat: number;
  preVat: number;
}

export interface QuoteDoc {
  quoteNo: string;
  issuedAt: string;
  validUntil: string;
  expired?: boolean;
  quote: Quote;
}

export interface Me {
  code: string;
  email: string;
  name: string;
  role: 'customer' | 'staff' | 'owner';
  tier: Tier | null;
  memberRate: number;
  spend12m: number;
  nextTier: Tier | null;
  toNextTier: number | null;
  company: string | null;
  taxId: string | null;
}

export interface StockRow {
  sku: string;
  name: string;
  onHand: number;
  held: number;
  available: number;
  redTag: boolean;
  perBuyerLimit: number | null;
}
