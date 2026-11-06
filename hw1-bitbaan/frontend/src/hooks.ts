import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from './api';
import { useAuth, useClock } from './state';
import type { Product } from './types';

/** GET /api/products; refetches when the flash sale starts/ends or the user logs in/out. */
export function useProducts() {
  const { flashActive } = useClock();
  const { me } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const list = await api.products();
      if (id !== seq.current) return;
      setProducts(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      if (id !== seq.current) return;
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, flashActive, me?.code]);

  return { products, error, reload: load };
}

/** max qty a buyer may put in the cart for a product */
export function maxQty(p: Pick<Product, 'available' | 'perBuyerLimit'> | undefined | null): number {
  if (!p) return Infinity;
  const lim = p.perBuyerLimit ?? Infinity;
  return Math.max(0, Math.min(p.available, lim));
}
