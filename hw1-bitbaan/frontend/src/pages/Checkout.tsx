import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, errorText, isApiError } from '../api';
import { guestPhone } from '../cart';
import { ErrorMessage, Loading, useTitle } from '../components/common';
import { QuoteBreakdown } from '../components/QuoteBreakdown';
import { mmss, statusLabel, timeHM, timeHMS } from '../format';
import { useServerNow } from '../state';
import type { Order, OrderStatus, PlacedOrder, Quote } from '../types';

const EXPIRED_TEXT = 'ออเดอร์หมดเวลาแล้ว';

export function Checkout() {
  const { orderNo = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const placed = (location.state as { placed?: PlacedOrder } | null)?.placed;
  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState<null | 'promptpay' | 'card'>(null);
  const now = useServerNow(500);
  const refetchedAtZero = useRef(false);
  useTitle(`ชำระเงิน ${orderNo}`);

  const load = useCallback(async () => {
    try {
      const o = await api.order(orderNo, guestPhone(orderNo));
      setOrder(o);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [orderNo]);

  useEffect(() => {
    void load();
  }, [load]);

  const status: OrderStatus | undefined = order?.status ?? placed?.status;
  const holdUntil = order?.holdUntil ?? placed?.holdUntil ?? null;
  const placedAt = order?.placedAt ?? placed?.placedAt ?? null;
  const quote: Quote | undefined = order?.quote ?? placed?.quote;
  const holdMs = holdUntil ? Date.parse(holdUntil) : NaN;
  const leftSec = Number.isNaN(holdMs) ? 0 : Math.ceil((holdMs - now) / 1000);
  const timeUp = status === 'PENDING' && !Number.isNaN(holdMs) && now > holdMs;
  const expired = status === 'EXPIRED' || timeUp;

  // when the countdown reaches zero, ask the server for the real status once
  useEffect(() => {
    if (timeUp && !refetchedAtZero.current) {
      refetchedAtZero.current = true;
      const id = window.setTimeout(() => void load(), 1200);
      return () => window.clearTimeout(id);
    }
  }, [timeUp, load]);

  const pay = async (method: 'promptpay' | 'card') => {
    if (paying) return;
    setPaying(method);
    setPayError(null);
    try {
      await api.pay(orderNo, method);
      navigate(`/orders/${encodeURIComponent(orderNo)}`);
    } catch (e) {
      if (isApiError(e, 'ORDER_EXPIRED')) {
        setPayError(e.message.includes(EXPIRED_TEXT) ? e.message : `${EXPIRED_TEXT} · ${e.message}`);
        void load();
      } else setPayError(errorText(e));
    } finally {
      setPaying(null);
    }
  };

  if (!quote) {
    return (
      <div className="wrap page stack">
        <ErrorMessage>{loadError}</ErrorMessage>
        {!loadError ? <Loading /> : <Link to="/account">ไปหน้าบัญชีของฉัน</Link>}
      </div>
    );
  }

  const isPending = status === 'PENDING' && !expired;
  const done = status && status !== 'PENDING' && status !== 'EXPIRED';
  const total = Math.max(1, (holdMs - (placedAt ? Date.parse(placedAt) : holdMs - 1800000)) / 1000);
  const pct = Math.max(0, Math.min(100, (leftSec / total) * 100));
  const shownError = payError ?? (expired ? EXPIRED_TEXT : null) ?? loadError;

  return (
    <>
      <div className={`hold-bar ${expired ? 'expired' : ''}`}>
        <div className="wrap hold-inner">
          <span>
            {expired ? 'หมดเวลากันของแล้ว ของถูกปล่อยคืนให้คนอื่นสั่งได้' : done ? 'ชำระเงินแล้ว' : 'กันสินค้าในออเดอร์นี้ไว้ให้คุณแล้ว ชำระเงินภายใน'}
          </span>
          <span role="timer" aria-live="off" className="hold-timer">
            <span className="mono hold-count" data-testid="countdown">
              {mmss(status === 'PENDING' ? leftSec : 0)}
            </span>
            <span className="small">
              กันไว้ถึง{' '}
              <span className="mono" data-testid="hold-until">
                {timeHMS(holdUntil)}
              </span>{' '}
              น.
            </span>
          </span>
        </div>
        <div className="hold-progress" aria-hidden="true">
          <div style={{ width: `${status === 'PENDING' ? pct : 0}%` }} />
        </div>
      </div>

      <div className="wrap page with-summary">
        <div className="stack grow-main">
          <div className="stack-xs">
            <span className="mono eyebrow">ขั้นที่ 2 · ชำระเงิน</span>
            <h1 className="h1">
              ออเดอร์{' '}
              <span className="mono" data-testid="order-no">
                {orderNo}
              </span>
            </h1>
            <span>
              สถานะ:{' '}
              <span className="strong" data-testid="order-status" data-status={status}>
                {status ? statusLabel(status) : '–'}
              </span>
            </span>
          </div>

          <ErrorMessage>{shownError}</ErrorMessage>
          {expired && (
            <p>
              <Link to="/cart">กลับไปตะกร้าเพื่อสั่งใหม่</Link>
            </p>
          )}

          {done && (
            <div className="alert alert-ok">
              ชำระเงินแล้ว · <Link to={`/orders/${encodeURIComponent(orderNo)}`}>ดูสถานะออเดอร์</Link>
            </div>
          )}

          <section className="card stack">
            <h2 className="h3">วิธีรับสินค้า</h2>
            {order ? (
              order.shipping === 'pickup' ? (
                <p>รับที่ร้าน ชั้น 4 ห้างไอที ปิ่นเกล้า · ร้านเปิด 10:00–21:00 ทุกวัน</p>
              ) : (
                <p>
                  {order.shipping === 'express' ? 'ส่งด่วนในกรุงเทพฯ' : 'ส่งปกติ'} · {order.buyer?.name} · <span className="mono">{order.buyer?.phone}</span>
                  <br />
                  {order.address ? `${order.address.line} ${order.address.province}` : ''}
                </p>
              )
            ) : (
              <p className="muted">–</p>
            )}
            <p className="small muted">1 ออเดอร์ส่งได้ 1 ที่อยู่</p>
          </section>

          <section className="card stack">
            <h2 className="h3">ชำระเงิน</h2>
            <div className="row-wrap">
              <button
                type="button"
                className="btn btn-red btn-lg grow"
                data-testid="pay-promptpay"
                disabled={!!paying || !!done}
                onClick={() => pay('promptpay')}
              >
                {paying === 'promptpay' ? 'กำลังชำระ…' : 'ชำระด้วย PromptPay QR'}
              </button>
              <button type="button" className="btn btn-dark btn-lg grow" data-testid="pay-card" disabled={!!paying || !!done} onClick={() => pay('card')}>
                {paying === 'card' ? 'กำลังชำระ…' : 'ชำระด้วยบัตรเครดิต / เดบิต'}
              </button>
            </div>
            <p className="small muted">ยืนยันยอดอัตโนมัติโดยระบบ ไม่ต้องส่งสลิป ไม่ต้องรอแอดมิน · กดซ้ำไม่ตัดเงินซ้ำ</p>
            {isPending && <p className="small muted">ถ้าไม่ชำระภายใน {timeHM(holdUntil)} น. ระบบจะปล่อยของคืนอัตโนมัติ</p>}
          </section>
        </div>

        <aside className="card summary stack" aria-label="สรุปออเดอร์">
          <h2 className="h3">สรุปออเดอร์</h2>
          <QuoteBreakdown quote={quote} />
          <p className="small muted">
            ราคาและส่วนลดล็อกตามเวลาที่กดสั่งซื้อ{placedAt ? ` (${timeHMS(placedAt)} น.)` : ''} ถ้าหมดเวลา ของจะถูกปล่อยคืนและต้องสั่งใหม่
          </p>
        </aside>
      </div>
    </>
  );
}
