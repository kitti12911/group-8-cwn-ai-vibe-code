import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api, errorText, isApiError, type PlaceOrderInput } from '../api';
import { clearCart, removeFromCart, saveGuestPhone, setCart, setQty, useCart } from '../cart';
import { ErrorMessage, Loading, Ph, useTitle } from '../components/common';
import { QuoteBreakdown } from '../components/QuoteBreakdown';
import { ShippingForm, type ShippingValue } from '../components/ShippingForm';
import { baht, thb } from '../format';
import { maxQty, useProducts } from '../hooks';
import { isBusiness, useAuth, useClock } from '../state';
import type { OrderInput, Quote } from '../types';

export function CartPage() {
  useTitle('ตะกร้า');
  const navigate = useNavigate();
  const cart = useCart();
  const { me, loading: meLoading } = useAuth();
  const { flashActive } = useClock();
  const { products, reload: reloadProducts } = useProducts();
  const bySku = useMemo(() => new Map((products ?? []).map((p) => [p.sku, p])), [products]);

  const [ship, setShip] = useState<ShippingValue>({ shipping: 'standard', province: 'กรุงเทพมหานคร', line: '' });
  const [couponInput, setCouponInput] = useState(cart.coupon ?? '');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [guest, setGuest] = useState({ name: '', phone: '', email: '' });
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<ApiError | Error | null>(null);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const seq = useRef(0);

  useEffect(() => setCouponInput(cart.coupon ?? ''), [cart.coupon]);

  const input: OrderInput = useMemo(() => {
    const o: OrderInput = { items: cart.items, shipping: ship.shipping, assembly: cart.assembly };
    if (cart.coupon) o.coupon = cart.coupon;
    if (ship.shipping !== 'pickup' && ship.province) o.province = ship.province;
    return o;
  }, [cart.items, cart.coupon, cart.assembly, ship.shipping, ship.province]);

  // re-price on every change (POST /api/quote saves nothing)
  useEffect(() => {
    const id = ++seq.current;
    if (input.items.length === 0) {
      setQuote(null);
      setQuoteError(null);
      setQuoting(false);
      return;
    }
    setQuoting(true);
    api
      .quote(input)
      .then((q) => {
        if (id !== seq.current) return;
        setQuote(q);
        setQuoteError(null);
      })
      .catch((e) => {
        if (id !== seq.current) return;
        setQuoteError(errorText(e));
      })
      .finally(() => {
        if (id === seq.current) setQuoting(false);
      });
  }, [input, flashActive, me?.code]);

  const lineBySku = useMemo(() => new Map((quote?.lines ?? []).map((l) => [l.sku, l])), [quote]);

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCart((c) => ({ ...c, coupon: undefined }));
      return;
    }
    if (cart.coupon && cart.coupon !== code && quote?.coupon?.status === 'APPLIED') {
      const ok = window.confirm(`ใช้ได้ออเดอร์ละ 1 โค้ด · ต้องการเปลี่ยนจาก ${cart.coupon} เป็น ${code} ไหม`);
      if (!ok) {
        setCouponInput(cart.coupon);
        return;
      }
    }
    setCart((c) => ({ ...c, coupon: code }));
  };

  const placeOrder = async () => {
    setOrderError(null);
    setPlacing(true);
    try {
      const body: PlaceOrderInput = { ...input };
      if (!me) body.guest = { name: guest.name.trim(), phone: guest.phone.trim(), email: guest.email.trim() };
      if (ship.shipping !== 'pickup') body.address = { line: ship.line.trim(), province: ship.province };
      const res = await api.placeOrder(body);
      if (!me) saveGuestPhone(res.orderNo, guest.phone.trim());
      clearCart();
      navigate(`/checkout/${encodeURIComponent(res.orderNo)}`, { state: { placed: res } });
    } catch (e) {
      setOrderError(e instanceof Error ? e : new Error(errorText(e)));
      if (isApiError(e, 'OUT_OF_STOCK') || isApiError(e, 'LIMIT_REACHED')) void reloadProducts();
    } finally {
      setPlacing(false);
    }
  };

  const createQuote = async () => {
    setCreatingQuote(true);
    setOrderError(null);
    try {
      const doc = await api.createQuote(cart.items, cart.coupon);
      navigate(`/quotes/${encodeURIComponent(doc.quoteNo)}`);
    } catch (e) {
      setOrderError(e instanceof Error ? e : new Error(errorText(e)));
    } finally {
      setCreatingQuote(false);
    }
  };

  const outSku = isApiError(orderError, 'OUT_OF_STOCK') ? String(orderError.data.sku ?? '') : '';
  const outName = outSku ? bySku.get(outSku)?.name ?? lineBySku.get(outSku)?.name ?? outSku : '';
  const count = cart.items.reduce((n, i) => n + i.qty, 0);
  const c = quote?.coupon;

  if (cart.items.length === 0) {
    return (
      <div className="wrap page stack">
        <h1 className="h1">ตะกร้า</h1>
        <div className="card stack">
          <p>ตะกร้ายังว่างอยู่</p>
          <div className="row-wrap">
            <Link to="/products" className="btn btn-dark">
              เลือกซื้อสินค้า
            </Link>
            <Link to="/builder" className="btn btn-outline">
              จัดสเปกเอง
            </Link>
          </div>
        </div>
        <ErrorMessage>{orderError ? errorText(orderError) : null}</ErrorMessage>
      </div>
    );
  }

  return (
    <div className="wrap page stack-lg">
      <h1 className="h1">
        ตะกร้า <span className="mono h1-sub">{count} ชิ้น</span>
      </h1>
      <div className="with-summary">
        <div className="stack grow-main">
          <section className="card no-pad" aria-label="สินค้าในตะกร้า">
            {cart.items.map((it) => {
              const p = bySku.get(it.sku);
              const l = lineBySku.get(it.sku);
              const max = p ? maxQty(p) : Infinity;
              const limit = p?.perBuyerLimit ?? null;
              const name = p?.name ?? l?.name ?? it.sku;
              return (
                <div key={it.sku} className="cart-line" data-testid={`cart-line-${it.sku}`}>
                  <Ph className="cart-ph" />
                  <div className="stack-xs grow">
                    <span className="mono small muted">{it.sku}</span>
                    <Link to={`/products/${it.sku}`} className="strong">
                      {name}
                    </Link>
                    {l && (
                      <span className="small muted">
                        {l.unitFlashPrice !== null && l.unitFlashPrice !== undefined && l.unitFlashPrice !== l.unitPrice ? (
                          <>
                            <span className="red">{thb(l.unitFlashPrice)}</span> <s>{thb(l.unitPrice)}</s> / ชิ้น · flash sale
                          </>
                        ) : (
                          <>{thb(l.unitPrice)} / ชิ้น</>
                        )}
                      </span>
                    )}
                    {p && p.available <= 0 && <span className="small bad-text">สินค้าหมด</span>}
                    {limit !== null && it.qty >= limit ? (
                      <span className="small warn-text">รุ่นนี้จำกัดคนละ {limit} ใบ</span>
                    ) : (
                      p &&
                      p.available > 0 &&
                      it.qty >= p.available && (
                        <span className={`small ${it.qty > p.available ? 'bad-text' : 'warn-text'}`}>มีของ {p.available} ชิ้น</span>
                      )
                    )}
                  </div>
                  <div className="qty" role="group" aria-label={`จำนวน ${name}`}>
                    <button
                      type="button"
                      data-testid={`cart-minus-${it.sku}`}
                      aria-label={`ลดจำนวน ${name}`}
                      disabled={it.qty <= 1}
                      onClick={() => setQty(it.sku, Math.max(1, it.qty - 1))}
                    >
                      −
                    </button>
                    <span className="mono qty-value" data-testid={`cart-qty-${it.sku}`}>
                      {it.qty}
                    </span>
                    <button
                      type="button"
                      data-testid={`cart-plus-${it.sku}`}
                      aria-label={`เพิ่มจำนวน ${name}`}
                      disabled={it.qty >= max}
                      onClick={() => setQty(it.sku, Math.min(max, it.qty + 1))}
                    >
                      +
                    </button>
                  </div>
                  <span className="mono strong line-amount">{l ? baht(l.amount) : ''}</span>
                  <button type="button" className="btn btn-ghost btn-sm" data-testid={`cart-remove-${it.sku}`} onClick={() => removeFromCart(it.sku)}>
                    ลบ
                  </button>
                </div>
              );
            })}
          </section>

          {quote && quote.bundleDiscount > 0 && (
            <div className="alert alert-ok">
              ✓ ได้ส่วนลดชุดประกอบ ฿{baht(quote.bundleDiscount)} เพราะมี CPU และเมนบอร์ดในออเดอร์เดียวกัน
              {quote.bundles > 1 ? ` (${quote.bundles} ชุด)` : ''}
            </div>
          )}

          <section className="card stack-sm">
            <label htmlFor="coupon-input" className="strong">
              โค้ดส่วนลด <span className="small muted normal">· ใช้ได้ออเดอร์ละ 1 โค้ด</span>
            </label>
            <div className="row-wrap">
              <input
                id="coupon-input"
                data-testid="coupon-input"
                className="mono upper grow"
                type="text"
                placeholder="เช่น NEWBIT200"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyCoupon();
                }}
              />
              <button type="button" className="btn btn-dark" data-testid="coupon-apply" onClick={applyCoupon}>
                ใช้โค้ด
              </button>
            </div>
            {cart.coupon && (
              <div className={`coupon-status ${c?.status === 'APPLIED' ? 'ok' : c?.status === 'REJECTED' ? 'bad' : ''}`}>
                <span data-testid="coupon-status" data-status={c?.status ?? 'PENDING'} role="status">
                  {!c || quoting
                    ? `กำลังตรวจโค้ด ${cart.coupon}…`
                    : c.status === 'APPLIED'
                      ? `ใช้โค้ด ${c.code ?? cart.coupon} แล้ว · ลด ฿${baht(c.amount)}`
                      : c.status === 'REJECTED'
                        ? `โค้ด ${c.code ?? cart.coupon} ใช้ไม่ได้: ${c.reason ?? ''}`
                        : `โค้ด ${cart.coupon} ยังไม่ถูกใช้`}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCart((x) => ({ ...x, coupon: undefined }))}>
                  เอาโค้ดออก
                </button>
              </div>
            )}
          </section>

          <section className="card stack">
            <label className="check">
              <input
                type="checkbox"
                data-testid="assembly-toggle"
                checked={cart.assembly}
                onChange={(e) => setCart((x) => ({ ...x, assembly: e.target.checked }))}
              />
              ให้ร้านประกอบ (฿500 · ฟรีเมื่อมีครบ 7 หมวดในหน้าจัดสเปก หมวดละ 1 ชิ้น)
            </label>
          </section>

          <section className="card">
            <ShippingForm value={ship} onChange={setShip} currentFee={quote ? (quote.shippingFee ? `฿${baht(quote.shippingFee)}` : 'ฟรี') : undefined} />
          </section>

          {!meLoading && !me && (
            <section className="card stack-sm" aria-label="ข้อมูลผู้สั่งซื้อ">
              <h2 className="h3">ข้อมูลผู้สั่งซื้อ (ไม่สมัครสมาชิก)</h2>
              <p className="small muted">
                ใช้ติดตามออเดอร์ · ไม่ได้ส่วนลดสมาชิก · มีบัญชีแล้ว? <Link to="/login">เข้าสู่ระบบ</Link>
              </p>
              <div className="field">
                <label htmlFor="guest-name">ชื่อ-นามสกุล</label>
                <input id="guest-name" data-testid="guest-name" type="text" autoComplete="name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="guest-phone">เบอร์โทร</label>
                <input id="guest-phone" data-testid="guest-phone" type="tel" autoComplete="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="guest-email">อีเมล</label>
                <input id="guest-email" data-testid="guest-email" type="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
              </div>
            </section>
          )}
        </div>

        <aside className="card summary stack" aria-label="สรุปยอด">
          <h2 className="h3">สรุปยอด</h2>
          {quote ? <QuoteBreakdown quote={quote} /> : !quoteError && <Loading text="กำลังคิดราคา…" />}
          <p className="small muted">คิดส่วนลดตามลำดับ flash sale → ชุดประกอบ → สมาชิก → คูปอง ทุกยอดตรงกับใบกำกับภาษี</p>

          <ErrorMessage>
            {orderError ? (
              <span className="stack-xs">
                <span>
                  {errorText(orderError)}
                  {outSku && ` · ชิ้นที่หมด: ${outName} (${outSku})`}
                  {outSku && isApiError(orderError) && orderError.data.available !== undefined
                    ? ` · เหลือ ${String(orderError.data.available)} ชิ้น`
                    : ''}
                </span>
                {outSku && (
                  <span className="row-wrap">
                    <button
                      type="button"
                      className="btn btn-sm btn-dark"
                      data-testid="out-of-stock-remove"
                      onClick={() => {
                        removeFromCart(outSku);
                        setOrderError(null);
                      }}
                    >
                      เอาชิ้นนี้ออก
                    </button>
                    <button type="button" className="btn btn-sm btn-outline" data-testid="out-of-stock-rebuild" onClick={() => navigate('/builder')}>
                      กลับไปเลือกใหม่
                    </button>
                  </span>
                )}
              </span>
            ) : (
              quoteError
            )}
          </ErrorMessage>

          <button type="button" className="btn btn-red btn-lg" data-testid="place-order" disabled={placing || cart.items.length === 0} onClick={placeOrder}>
            {placing ? 'กำลังสั่งซื้อ…' : 'สั่งซื้อและกันของ 30 นาที'}
          </button>
          <span className="small muted center">ใส่ตะกร้ายังไม่กันของ · กันเมื่อกดสั่งซื้อ · ราคาล็อกตอนกดสั่ง</span>
          {isBusiness(me) && (
            <button type="button" className="btn btn-outline" data-testid="quote-create" disabled={creatingQuote} onClick={createQuote}>
              {creatingQuote ? 'กำลังออกใบเสนอราคา…' : 'ขอใบเสนอราคาจากตะกร้านี้ (ยืนราคา 7 วัน)'}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
