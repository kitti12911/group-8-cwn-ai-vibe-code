import { useSyncExternalStore } from 'react';
import type { CartItem } from './types';

/**
 * Cart lives only in localStorage (key `bb_cart`). Shape:
 *   { items: [{ sku, qty }], assembly: boolean, coupon?: string }
 * A bare array of items is also accepted when reading (treated as `items`).
 */
export interface Cart {
  items: CartItem[];
  assembly: boolean;
  coupon?: string;
}

const KEY = 'bb_cart';
const EMPTY: Cart = { items: [], assembly: false };

function parse(raw: string | null): Cart {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as unknown;
    const obj: Partial<Cart> = Array.isArray(v) ? { items: v as CartItem[] } : ((v ?? {}) as Partial<Cart>);
    const items = Array.isArray(obj?.items)
      ? obj.items
          .filter((i): i is CartItem => !!i && typeof i.sku === 'string')
          .map((i) => ({ sku: i.sku, qty: Math.max(1, Math.floor(Number(i.qty) || 1)) }))
      : [];
    return {
      items,
      assembly: !!obj?.assembly,
      coupon: typeof obj?.coupon === 'string' && obj.coupon ? obj.coupon : undefined,
    };
  } catch {
    return EMPTY;
  }
}

let cachedRaw: string | null | undefined;
let cached: Cart = EMPTY;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getCart(): Cart {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

export function setCart(next: Cart | ((c: Cart) => Cart)): void {
  const value = typeof next === 'function' ? next(getCart()) : next;
  const clean: Cart = {
    items: value.items.filter((i) => i.qty > 0),
    assembly: value.assembly,
    ...(value.coupon ? { coupon: value.coupon } : {}),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* storage full / blocked: keep in memory only */
    cachedRaw = JSON.stringify(clean);
    cached = clean;
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useCart(): Cart {
  return useSyncExternalStore(subscribe, getCart, getCart);
}

export function cartCount(c: Cart): number {
  return c.items.reduce((n, i) => n + i.qty, 0);
}

/** Add `qty` of `sku`, never exceeding `max` (available / per-buyer limit). Returns the resulting qty. */
export function addToCart(sku: string, qty: number, max = Infinity): number {
  let result = 0;
  setCart((c) => {
    const items = c.items.map((i) => ({ ...i }));
    const line = items.find((i) => i.sku === sku);
    if (line) {
      line.qty = Math.min(line.qty + qty, max);
      result = line.qty;
    } else {
      result = Math.min(qty, max);
      if (result > 0) items.push({ sku, qty: result });
    }
    return { ...c, items };
  });
  return result;
}

export function setQty(sku: string, qty: number): void {
  setCart((c) => ({ ...c, items: c.items.map((i) => (i.sku === sku ? { ...i, qty } : i)) }));
}

export function removeFromCart(sku: string): void {
  setCart((c) => ({ ...c, items: c.items.filter((i) => i.sku !== sku) }));
}

export function clearCart(): void {
  setCart({ items: [], assembly: false });
}

// ---- guest order lookup: phone per orderNo ----
const GUEST_KEY = 'bb_guest_orders';

export function saveGuestPhone(orderNo: string, phone: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}') as Record<string, string>;
    map[orderNo] = phone;
    localStorage.setItem(GUEST_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function guestPhone(orderNo: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}') as Record<string, string>;
    return map[orderNo] ?? null;
  } catch {
    return null;
  }
}
