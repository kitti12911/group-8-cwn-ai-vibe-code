import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText, isApiError } from '../api';
import { guestPhone, saveGuestPhone } from '../cart';
import { ErrorMessage, Loading, useTitle } from '../components/common';
import { QuoteBreakdown } from '../components/QuoteBreakdown';
import { baht, dateTimeTH, statusLabel, thb } from '../format';
import { useAuth } from '../state';
import type { Invoice, Order } from '../types';

export function OrderPage() {
  const { orderNo = '' } = useParams();
  const { me } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needPhone, setNeedPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [refund, setRefund] = useState<{ amount: number; fee?: number; kind: 'CANCEL' | 'RETURN' } | null>(null);
  const [opened, setOpened] = useState<boolean | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  useTitle(`ออเดอร์ ${orderNo}`);

  const load = useCallback(
    async (phone?: string | null) => {
      try {
        const o = await api.order(orderNo, phone ?? guestPhone(orderNo));
        setOrder(o);
        setError(null);
        setNeedPhone(false);
      } catch (e) {
        setError(errorText(e));
        if (isApiError(e, 'NOT_FOUND') || isApiError(e, 'LOGIN_REQUIRED')) setNeedPhone(true);
      }
    },
    [orderNo],
  );

  useEffect(() => {
    void load();
  }, [load, me?.code]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () =>
    act(async () => {
      const r = await api.cancel(orderNo);
      setRefund({ amount: r.refund, kind: 'CANCEL' });
      await load();
    });

  const doReturn = (e: FormEvent) => {
    e.preventDefault();
    if (opened === null) {
      setError('กรุณาเลือกสภาพสินค้าที่จะคืน');
      return;
    }
    void act(async () => {
      const r = await api.returnOrder(orderNo, opened);
      setRefund({ amount: r.refund, fee: r.fee, kind: 'RETURN' });
      await load();
    });
  };

  const showInvoice = () =>
    act(async () => {
      setInvoice(await api.invoice(orderNo));
    });

  const lookup = (e: FormEvent) => {
    e.preventDefault();
    const ph = phoneInput.trim();
    if (!ph) {
      setError('กรุณากรอกเบอร์โทรที่ใช้สั่ง');
      return;
    }
    saveGuestPhone(orderNo, ph);
    void load(ph);
  };

  if (!order) {
    return (
      <div className="wrap page stack narrow">
        <h1 className="h1">
          ออเดอร์ <span className="mono">{orderNo}</span>
        </h1>
        <ErrorMessage>{error}</ErrorMessage>
        {needPhone && (
          <form className="card stack-sm" onSubmit={lookup}>
            <p>สั่งซื้อแบบไม่สมัครสมาชิก? ใส่เบอร์โทรที่ใช้สั่งเพื่อดูออเดอร์</p>
            <div className="field">
              <label htmlFor="lookup-phone">เบอร์โทร</label>
              <input id="lookup-phone" data-testid="lookup-phone" type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-dark">
              ดูออเดอร์
            </button>
            {!me && <Link to="/login">หรือเข้าสู่ระบบ</Link>}
          </form>
        )}
        {!error && <Loading />}
      </div>
    );
  }

  const latestRefund = order.refunds?.length ? order.refunds[order.refunds.length - 1] : null;
  const refundShown = refund ?? (latestRefund ? { amount: latestRefund.amount, fee: latestRefund.fee, kind: latestRefund.kind } : null);

  const steps: { name: string; at: string | null; on: boolean }[] = [
    { name: 'สั่งซื้อ', at: order.placedAt, on: true },
    { name: 'ชำระเงิน', at: order.paidAt, on: !!order.paidAt },
    { name: 'แพ็กของ', at: order.packedAt, on: !!order.packedAt },
    { name: order.shipping === 'pickup' ? 'ส่งมอบ / พร้อมรับ' : 'จัดส่ง', at: order.shippedAt, on: !!order.shippedAt },
    { name: 'ได้รับสินค้า', at: order.deliveredAt, on: !!order.deliveredAt },
  ];
  if (order.status === 'EXPIRED') steps.push({ name: 'หมดเวลา', at: order.holdUntil, on: true });
  if (order.cancelledAt || order.status === 'CANCELLED') steps.push({ name: 'ยกเลิกแล้ว', at: order.cancelledAt, on: true });
  if (order.returnedAt || order.status === 'RETURNED') steps.push({ name: 'คืนของแล้ว', at: order.returnedAt, on: true });
  const currentIdx = steps.reduce((acc, s, i) => (s.on ? i : acc), 0);

  const banner =
    order.status === 'PAID'
      ? { cls: 'alert-ok', text: 'ชำระเงินแล้ว สินค้าเป็นของคุณ · ยืนยันโดยระบบ ไม่ต้องรอแอดมิน' }
      : order.status === 'PENDING'
        ? { cls: 'alert-warn', text: 'รอชำระเงิน · ร้านกันของไว้ให้ 30 นาที' }
        : order.status === 'EXPIRED'
          ? { cls: 'alert-error-soft', text: 'ออเดอร์หมดเวลาแล้ว ของถูกปล่อยคืน' }
          : null;

  return (
    <div className="wrap page stack-lg narrow-wide">
      <div className="stack-xs">
        <span className="mono eyebrow">ออเดอร์</span>
        <h1 className="h1 mono">{order.orderNo}</h1>
        <span>
          สถานะ:{' '}
          <span className="strong status-pill" data-testid="order-status" data-status={order.status}>
            {statusLabel(order.status)}
          </span>
          <span className="small muted"> · สั่งเมื่อ {dateTimeTH(order.placedAt)}</span>
        </span>
      </div>
      {banner && <div className={`alert ${banner.cls}`}>{banner.text}</div>}
      {order.status === 'PENDING' && (
        <Link to={`/checkout/${encodeURIComponent(order.orderNo)}`} className="btn btn-red self-start">
          ไปหน้าชำระเงิน
        </Link>
      )}
      <ErrorMessage>{error}</ErrorMessage>

      <section className="card stack">
        <h2 className="h3">สถานะ</h2>
        <ol className="timeline">
          {steps.map((s, i) => (
            <li key={s.name} className={i === currentIdx ? 'current' : s.on ? 'done' : ''}>
              <span className="strong">{s.name}</span>
              <span className="small muted">{s.at ? dateTimeTH(s.at) : '–'}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid-2 align-start">
        <section className="card stack">
          <h2 className="h3">รายการ (ราคาล็อกตอนกดสั่ง)</h2>
          <QuoteBreakdown quote={order.quote} />
          <div className="small muted">
            {order.shipping === 'pickup'
              ? 'รับที่ร้าน ชั้น 4 ห้างไอที ปิ่นเกล้า · 10:00–21:00 ทุกวัน'
              : `${order.shipping === 'express' ? 'ส่งด่วน' : 'ส่งปกติ'} · ${order.address ? `${order.address.line} ${order.address.province}` : ''}`}
          </div>
          <button type="button" className="btn btn-outline self-start" data-testid="invoice-link" onClick={showInvoice} disabled={busy}>
            ดูใบกำกับภาษี
          </button>
          {invoice && <InvoiceView inv={invoice} quote={order.quote} />}
        </section>

        <section className="card stack">
          <h2 className="h3">ยกเลิก / คืนของ / เคลม</h2>

          {refundShown && (
            <div className="alert alert-ok stack-xs" role="status">
              <span>
                {refundShown.kind === 'CANCEL' ? 'ยกเลิกแล้ว · เงินคืน' : 'คืนของแล้ว · เงินคืน'}{' '}
                <span className="mono strong" data-testid="refund-amount">
                  {thb(refundShown.amount)}
                </span>
              </span>
              {refundShown.fee ? <span className="small">หักค่าธรรมเนียมแกะกล่อง {thb(refundShown.fee)}</span> : null}
            </div>
          )}

          <div className="stack-xs">
            <span className="strong">ยกเลิกออเดอร์</span>
            {order.canCancel ? (
              <>
                <span className="small muted-2">ร้านยังไม่แพ็กของ ยกเลิกตอนนี้ได้เงินคืนเต็มจำนวนที่จ่าย รวมค่าส่ง</span>
                <button type="button" className="btn btn-outline-red self-start" data-testid="cancel-order" onClick={cancel} disabled={busy}>
                  ยกเลิกและขอคืนเงิน
                </button>
              </>
            ) : (
              <span className="small muted">
                {['PACKED', 'SHIPPED', 'DELIVERED'].includes(order.status) ? 'ร้านแพ็กของแล้ว ยกเลิกไม่ได้ ใช้การคืนของแทน' : 'ออเดอร์นี้ยกเลิกไม่ได้'}
              </span>
            )}
          </div>

          <div className="stack-xs divider-top">
            <span className="strong">คืนของ</span>
            <span className="small muted-2">ภายใน 7 วันหลังได้รับ · ยังไม่แกะกล่องคืนเต็ม · แกะกล่องแล้วหักค่าธรรมเนียม 10% ของราคาที่จ่ายจริง</span>
            {order.returnUntil && (
              <span className="small">
                ขอคืนได้ถึง{' '}
                <span className="mono strong" data-testid="return-until">
                  {dateTimeTH(order.returnUntil)}
                </span>
              </span>
            )}
            {order.canReturn ? (
              <form className="stack-xs" onSubmit={doReturn}>
                <fieldset className="radio-group">
                  <legend className="small">สภาพสินค้า</legend>
                  <label className="check">
                    <input type="radio" name="opened" data-testid="return-unopened" checked={opened === false} onChange={() => setOpened(false)} />
                    ยังไม่แกะกล่อง (คืนเต็ม)
                  </label>
                  <label className="check">
                    <input type="radio" name="opened" data-testid="return-opened" checked={opened === true} onChange={() => setOpened(true)} />
                    แกะกล่องแล้ว (หัก 10%)
                  </label>
                </fieldset>
                {/* FR-48: show the refund before the customer confirms */}
                {opened !== null && order.returnPreview && (
                  <div className="alert alert-ok small" role="status">
                    ได้เงินคืน{' '}
                    <span className="mono strong" data-testid="return-preview-refund">
                      ฿{baht((opened ? order.returnPreview.opened : order.returnPreview.unopened).refund)}
                    </span>
                    {' · '}ค่าธรรมเนียม{' '}
                    <span className="mono" data-testid="return-preview-fee">
                      ฿{baht((opened ? order.returnPreview.opened : order.returnPreview.unopened).fee)}
                    </span>
                    {' · '}ไม่คืนค่าส่ง
                  </div>
                )}
                <button type="submit" className="btn btn-dark self-start" data-testid="return-submit" disabled={busy || opened === null}>
                  ขอคืนของ
                </button>
              </form>
            ) : (
              <span className="small muted">{order.status === 'DELIVERED' ? 'เลยกำหนดคืนของแล้ว' : 'คืนของได้หลังได้รับสินค้า'}</span>
            )}
          </div>

          <div className="stack-xs divider-top" id="warranty">
            <span className="strong">สินค้าเสียจากโรงงาน</span>
            <span className="small muted-2">
              ของเสียจากโรงงาน เคลมตามประกันผู้ผลิต แยกจากการคืนของ ไม่หักค่าธรรมเนียม · นำสินค้าและเลขออเดอร์มาที่ร้าน ชั้น 4 ห้างไอที ปิ่นเกล้า
            </span>
            <Link to={`/warranty?order=${encodeURIComponent(order.orderNo)}`} className="small" data-testid="warranty-link">
              ของเสียจากโรงงาน → เคลมประกัน
            </Link>
          </div>

          {(order.refunds?.length ?? 0) > 0 && (
            <div className="stack-xs divider-top">
              <span className="strong">สถานะเงินคืน</span>
              <ul className="refunds">
                {order.refunds.map((r) => (
                  <li key={r.id} data-testid={`refund-${r.id}`}>
                    <span>
                      {r.kind === 'CANCEL' ? 'ยกเลิก' : 'คืนของ'} · <span className="mono">{thb(r.amount)}</span>
                      {r.fee ? <span className="small muted"> (หัก {thb(r.fee)})</span> : null}
                    </span>
                    <span className={`small ${r.status === 'DONE' ? 'good-text' : 'warn-text'}`} data-testid={`refund-status-${r.id}`}>
                      {r.status === 'DONE' ? `โอนคืนแล้ว ${dateTimeTH(r.refundedAt)}` : `รอโอนคืน · ขอเมื่อ ${dateTimeTH(r.requestedAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function InvoiceView({ inv, quote }: { inv: Invoice; quote?: Order['quote'] }) {
  // C4 exploration: lines are list prices, so show every discount and fee between them and the total
  const adj: [string, number][] = quote
    ? ([
        ['ส่วนลด flash sale', -quote.flashDiscount],
        ['ส่วนลดชุดประกอบ', -quote.bundleDiscount],
        ['ส่วนลดสมาชิก', -quote.memberDiscount],
        [`คูปอง${quote.coupon?.code ? ` ${quote.coupon.code}` : ''}`, -(quote.coupon?.amount ?? 0)],
        ['ค่าประกอบ', quote.assemblyFee],
        ['ค่าส่ง', quote.shippingFee],
      ] as [string, number][]).filter(([, v]) => v !== 0)
    : [];
  return (
    <div className="invoice stack-sm" aria-label="ใบกำกับภาษี">
      <div className="row-between wrap-gap">
        <span className="strong">ใบกำกับภาษี</span>
        <span className="mono small">{inv.invoiceNo}</span>
      </div>
      <span className="small muted">ออกเมื่อ {dateTimeTH(inv.issuedAt)} · ออเดอร์ {inv.orderNo}</span>
      <div className="small">
        ผู้ซื้อ: {inv.buyer?.name}
        {inv.buyer?.company && inv.buyer.company !== inv.buyer.name ? ` · ${inv.buyer.company}` : ''}
        {inv.buyer?.taxId ? (
          <>
            {' '}
            · เลขผู้เสียภาษี <span className="mono">{inv.buyer.taxId}</span>
          </>
        ) : null}
      </div>
      {Array.isArray(inv.lines) && inv.lines.length > 0 && (
        <ul className="invoice-lines">
          {inv.lines.map((l, i) => (
            <li key={i}>
              <span>
                {l.name ?? l.sku ?? `รายการ ${i + 1}`}
                {l.qty ? ` × ${l.qty}` : ''}
              </span>
              <span className="mono">{typeof l.amount === 'number' ? baht(l.amount) : ''}</span>
            </li>
          ))}
          {adj.map(([label, v]) => (
            <li key={label} data-testid="invoice-adjustment">
              <span>{label}</span>
              <span className="mono">{baht(v)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ladder-vat">
        <div>
          <span>มูลค่าก่อน VAT</span>
          <span className="mono" data-testid="invoice-pre-vat">
            {baht(inv.preVat)}
          </span>
        </div>
        <div>
          <span>VAT 7%</span>
          <span className="mono" data-testid="invoice-vat">
            {baht(inv.vat)}
          </span>
        </div>
        <div className="strong">
          <span>รวมทั้งสิ้น</span>
          <span className="mono" data-testid="invoice-total">
            {baht(inv.total)}
          </span>
        </div>
      </div>
    </div>
  );
}
