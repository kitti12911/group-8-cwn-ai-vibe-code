import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../api';
import { setCart, useCart } from '../cart';
import { ErrorMessage, Loading, useTitle } from '../components/common';
import { baht, dateTH, statusLabel, thb, thbShort, tierLabel } from '../format';
import { isBusiness, useAuth } from '../state';
import type { OrderSummary, QuoteDoc } from '../types';

const TIER_INFO: Record<string, string> = {
  GENERAL: 'สมาชิกทั่วไป · ซื้อครบ ฿20,000 ใน 12 เดือนเป็น Silver',
  SILVER: 'ลด 3% ทุกออเดอร์ ใช้คู่กับคูปองได้',
  GOLD: 'ลด 5% ทุกออเดอร์ ใช้คู่กับคูปองได้',
  BUSINESS: 'ลด 8% ทุกออเดอร์ · ขอใบเสนอราคาและใบกำกับภาษีเต็มรูปได้',
};

export function Account() {
  useTitle('บัญชีของฉัน');
  const { me, loading, refresh, setMe } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [quotes, setQuotes] = useState<QuoteDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const biz = isBusiness(me);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!me) return;
    api
      .myOrders()
      .then((o) => setOrders(Array.isArray(o) ? o : []))
      .catch((e) => setError(errorText(e)));
    if (biz)
      api
        .myQuotes()
        .then((q) => setQuotes(Array.isArray(q) ? q : []))
        .catch((e) => setError(errorText(e)));
  }, [me?.code, biz]);

  if (loading && !me) return <div className="wrap page"><Loading /></div>;
  if (!me) {
    return (
      <div className="wrap page stack narrow">
        <h1 className="h1">บัญชีของฉัน</h1>
        <div className="card stack-sm">
          <p>กรุณาเข้าสู่ระบบเพื่อดูบัญชีและคำสั่งซื้อ</p>
          <Link to="/login" className="btn btn-dark self-start">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setMe(null);
    // C2 exploration: a coupon typed by this account must not carry over to the next one
    setCart((c) => ({ ...c, coupon: undefined }));
    await refresh();
    navigate('/');
  };

  const createQuote = async () => {
    setBusy(true);
    setError(null);
    try {
      const doc = await api.createQuote(cart.items, cart.coupon);
      navigate(`/quotes/${encodeURIComponent(doc.quoteNo)}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const tier = me.tier ?? 'GENERAL';
  const nextAt = me.nextTier && me.toNextTier !== null ? me.spend12m + me.toNextTier : null;
  const pct = nextAt ? Math.min(100, (me.spend12m / nextAt) * 100) : 100;

  return (
    <div className="wrap page with-aside">
      <nav aria-label="เมนูบัญชี" className="account-nav">
        <a href="#overview" className="on">
          ภาพรวม
        </a>
        <a href="#orders">คำสั่งซื้อ</a>
        {biz && <a href="#quotes">ใบเสนอราคา</a>}
        <button type="button" className="link-btn" data-testid="logout" onClick={logout}>
          ออกจากระบบ
        </button>
      </nav>

      <div className="stack-lg grow-main">
        <div className="stack-xs" id="overview">
          <h1 className="h1">สวัสดี {me.name.startsWith('คุณ') ? me.name : `คุณ${me.name}`}</h1>
          <span className="mono small muted">
            {me.email}
            {me.company ? ` · ${me.company}` : ''}
            {me.taxId ? ` · เลขผู้เสียภาษี ${me.taxId}` : ''}
          </span>
        </div>
        <ErrorMessage>{error}</ErrorMessage>

        <section className="tier-card stack">
          <div className="row-between wrap-gap">
            <div className="stack-xs">
              <span className="mono eyebrow dim">ระดับสมาชิก</span>
              <span className="tier-name" data-testid="member-tier" data-tier={tier}>
                {tierLabel(tier)}
              </span>
              <span className="dim-2">{TIER_INFO[tier] ?? ''}</span>
            </div>
            <div className="stack-xs align-right">
              <span className="small dim">ยอดซื้อสะสม 12 เดือนล่าสุด</span>
              <span className="mono tier-spend" data-testid="spend-12m">
                {thb(me.spend12m)}
              </span>
            </div>
          </div>
          {nextAt && (
            <div className="tier-bar" aria-hidden="true">
              <div style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="small dim-2" data-testid="to-next-tier">
            {me.nextTier && me.toNextTier !== null
              ? `อีก ${thbShort(me.toNextTier)} เป็น ${tierLabel(me.nextTier)}`
              : tier === 'BUSINESS'
                ? 'ระดับ Business ลด 8% ทุกออเดอร์ ไม่ขึ้นกับยอดสะสม'
                : 'ระดับสูงสุดแล้ว'}
          </div>
          <p className="small dim divider-top-dark">
            ยอดที่ซื้อเกิน 12 เดือนจะหลุดออกจากการนับ ถ้ายอดสะสมต่ำกว่า ฿20,000 ระดับจะกลับเป็นสมาชิกทั่วไป
          </p>
        </section>

        <section className="card stack" id="orders">
          <h2 className="h3">คำสั่งซื้อของฉัน</h2>
          {!orders ? (
            <Loading />
          ) : orders.length === 0 ? (
            <p className="muted">ยังไม่มีคำสั่งซื้อ · <Link to="/products">เลือกซื้อสินค้า</Link></p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>เลขที่</th>
                    <th>วันที่</th>
                    <th>สถานะ</th>
                    <th className="num">ยอด</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.orderNo} data-testid={`my-order-${o.orderNo}`}>
                      <td>
                        <Link to={`/orders/${encodeURIComponent(o.orderNo)}`} className="mono">
                          {o.orderNo}
                        </Link>
                      </td>
                      <td>{dateTH(o.placedAt)}</td>
                      <td>
                        <span className="status-pill">{statusLabel(o.status)}</span>
                      </td>
                      <td className="num mono">{baht(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {biz && (
          <section className="card stack" id="quotes">
            <div className="row-between wrap-gap">
              <h2 className="h3">ใบเสนอราคา</h2>
              <button type="button" className="btn btn-dark" data-testid="quote-create" disabled={busy || cart.items.length === 0} onClick={createQuote}>
                {busy ? 'กำลังออกใบเสนอราคา…' : `ออกใบเสนอราคาจากตะกร้า (${cart.items.length} รายการ)`}
              </button>
            </div>
            {cart.items.length === 0 && (
              <p className="small muted">
                ตะกร้าว่าง · <Link to="/products">เลือกสินค้า</Link> แล้วกลับมาออกใบเสนอราคา
              </p>
            )}
            {!quotes ? (
              <Loading />
            ) : quotes.length === 0 ? (
              <p className="muted">ยังไม่มีใบเสนอราคา</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>เลขที่</th>
                      <th>ออกเมื่อ</th>
                      <th>ยืนราคาถึง</th>
                      <th className="num">ยอด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.quoteNo}>
                        <td>
                          <Link to={`/quotes/${encodeURIComponent(q.quoteNo)}`} className="mono">
                            {q.quoteNo}
                          </Link>
                          {q.expired && <span className="small bad-text"> · หมดอายุ</span>}
                        </td>
                        <td>{dateTH(q.issuedAt)}</td>
                        <td>{dateTH(q.validUntil)}</td>
                        <td className="num mono">{q.quote ? baht(q.quote.total) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
