import { guestPhone } from './cart';
import type {
  BuilderInput,
  BuilderResult,
  CartItem,
  Invoice,
  Me,
  Order,
  OrderInput,
  OrderStatus,
  OrderSummary,
  PlacedOrder,
  Product,
  Quote,
  QuoteDoc,
  SavedBuild,
  Shipping,
  LotRow,
  StockRow,
  TimeInfo,
} from './types';

const BASE = '/api';

/** Error thrown for every non-2xx response. `data` holds extra fields (e.g. `sku`, `available`). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data: Record<string, unknown>;

  constructor(status: number, code: string, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

/** Thai message for any thrown value, for display in `error-message`. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'เกิดข้อผิดพลาด';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
  }

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!res.ok) {
    const obj = (json && typeof json === 'object' ? (json as Record<string, unknown>) : {}) as Record<string, unknown>;
    const code = typeof obj.error === 'string' ? obj.error : `HTTP_${res.status}`;
    const message =
      typeof obj.message === 'string' && obj.message
        ? obj.message
        : `เกิดข้อผิดพลาด (HTTP ${res.status})`;
    throw new ApiError(res.status, code, message, obj);
  }
  return json as T;
}

const q = (params: Record<string, string | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : '';
};
const enc = encodeURIComponent;

export interface PlaceOrderInput extends OrderInput {
  guest?: { name: string; phone: string; email: string };
  address?: { line: string; province: string };
}

export const api = {
  // test-mode helpers
  bugMode: () => request<{ bugMode: number }>('GET', '/test/bug-mode'),
  testClock: () => request<{ now: string; running: boolean }>('GET', '/test/clock'),

  // time & products
  time: () => request<TimeInfo>('GET', '/time'),
  products: () => request<Product[]>('GET', '/products'),
  product: (sku: string) => request<Product>('GET', `/products/${enc(sku)}`),

  // builder
  evaluate: (input: BuilderInput) => request<BuilderResult>('POST', '/builder/evaluate', input),
  saveBuild: (input: BuilderInput) => request<{ code: string; savedAt: string }>('POST', '/builds', input),
  getBuild: (code: string) => request<SavedBuild>('GET', `/builds/${enc(code)}`),

  // pricing & orders
  quote: (input: OrderInput) => request<Quote>('POST', '/quote', input),
  placeOrder: (input: PlaceOrderInput) => request<PlacedOrder>('POST', '/orders', input),
  myOrders: () => request<OrderSummary[]>('GET', '/orders'),
  order: (no: string, phone?: string | null) => request<Order>('GET', `/orders/${enc(no)}${q({ phone })}`),
  // guests prove ownership with ?phone= on every /orders/:no call (API-CONTRACT 3.3)
  pay: (no: string, method: 'promptpay' | 'card') =>
    request<{ status: OrderStatus; paidAt: string }>('POST', `/orders/${enc(no)}/pay${q({ phone: guestPhone(no) })}`, { method }),
  cancel: (no: string) =>
    request<{ status: OrderStatus; refund: number }>('POST', `/orders/${enc(no)}/cancel${q({ phone: guestPhone(no) })}`),
  returnOrder: (no: string, opened: boolean) =>
    request<{ status: OrderStatus; refund: number; fee: number }>('POST', `/orders/${enc(no)}/return${q({ phone: guestPhone(no) })}`, { opened }),
  invoice: (no: string) => request<Invoice>('GET', `/orders/${enc(no)}/invoice${q({ phone: guestPhone(no) })}`),

  // business quotations
  createQuote: (items: CartItem[], coupon?: string) =>
    request<QuoteDoc>('POST', '/quotes', coupon ? { items, coupon } : { items }),
  myQuotes: () => request<QuoteDoc[]>('GET', '/quotes'),
  getQuote: (no: string) => request<QuoteDoc>('GET', `/quotes/${enc(no)}`),
  orderFromQuote: (
    no: string,
    body: { shipping: Shipping; province?: string; address?: { line: string; province: string } },
  ) => request<PlacedOrder>('POST', `/quotes/${enc(no)}/order`, body),

  // account
  register: (body: { email: string; password: string; name: string; phone: string; company?: string; taxId?: string; business?: boolean }) =>
    request<Me>('POST', '/auth/register', body),
  login: (email: string, password: string) => request<Me>('POST', '/auth/login', { email, password }),
  logout: () => request<{ ok: boolean }>('POST', '/auth/logout'),
  me: () => request<Me>('GET', '/me'),

  // back office
  adminStock: () => request<StockRow[]>('GET', '/admin/stock'),
  storeSale: (sku: string, qty: number, customerCode?: string) =>
    request<{ sku: string; available: number }>(
      'POST',
      '/admin/store-sale',
      customerCode ? { sku, qty, customerCode } : { sku, qty },
    ),
  adminLots: () => request<LotRow[]>('GET', '/admin/lots'),
  scheduleLot: (sku: string, qty: number, releaseAt: string) => request<LotRow>('POST', '/admin/lots', { sku, qty, releaseAt }),
  adminOrders: (status?: string, date?: string) => request<Order[]>('GET', `/admin/orders${q({ status, date })}`),
  setStatus: (no: string, status: 'PACKED' | 'SHIPPED' | 'DELIVERED') =>
    request<Order>('POST', `/admin/orders/${enc(no)}/status`, { status }),
  refundDone: (id: string | number) =>
    request<{ id: string | number; status: string; refundedAt: string }>('POST', `/admin/refunds/${enc(String(id))}/done`),
};
