import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText, isApiError } from '../api';
import { ErrorMessage, Loading, useTitle } from '../components/common';
import { QuoteBreakdown } from '../components/QuoteBreakdown';
import { ShippingForm, type ShippingValue } from '../components/ShippingForm';
import { dateTH, dateTimeTH } from '../format';
import { useAuth, useServerNow } from '../state';
import type { QuoteDoc } from '../types';

const EXPIRED_TEXT = 'ใบเสนอราคาหมดอายุ';

export function QuotePage() {
  const { no = '' } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const now = useServerNow(5000);
  const [doc, setDoc] = useState<QuoteDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ship, setShip] = useState<ShippingValue>({ shipping: 'standard', province: 'กรุงเทพมหานคร', line: '' });
  const [busy, setBusy] = useState(false);
  useTitle(`ใบเสนอราคา ${no}`);

  useEffect(() => {
    api
      .getQuote(no)
      .then((d) => {
        setDoc(d);
        setError(null);
      })
      .catch((e) => setError(errorText(e)));
  }, [no, me?.code]);

  const order = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Parameters<typeof api.orderFromQuote>[1] = { shipping: ship.shipping };
      if (ship.shipping !== 'pickup') {
        if (ship.province) body.province = ship.province;
        body.address = { line: ship.line.trim(), province: ship.province };
      }
      const res = await api.orderFromQuote(no, body);
      navigate(`/checkout/${encodeURIComponent(res.orderNo)}`, { state: { placed: res } });
    } catch (e) {
      setError(isApiError(e, 'QUOTE_EXPIRED') && !e.message.includes(EXPIRED_TEXT) ? `${EXPIRED_TEXT} · ${e.message}` : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!doc) {
    return (
      <div className="wrap page stack narrow">
        <ErrorMessage>{error}</ErrorMessage>
        {!error ? <Loading /> : <Link to="/account">ไปหน้าบัญชีของฉัน</Link>}
      </div>
    );
  }

  const expired = !!doc.expired || (doc.validUntil ? now > Date.parse(doc.validUntil) : false);
  const shownError = error ?? (expired ? `${EXPIRED_TEXT} สั่งจากใบนี้ไม่ได้ กรุณาขอใบใหม่` : null);

  return (
    <div className="wrap page stack-lg">
      <div className="row-between wrap-gap align-end">
        <div className="stack-xs">
          <span className="mono eyebrow">
            ใบเสนอราคา · <span data-testid="quote-no">{doc.quoteNo}</span>
          </span>
          <h1 className="h1">{me?.company ?? me?.name ?? 'ใบเสนอราคา'}</h1>
        </div>
      </div>

      <div className="grid-facts">
        <div className="fact">
          <span className="small muted">ออกเมื่อ</span>
          <span className="strong">{dateTH(doc.issuedAt, true)}</span>
        </div>
        <div className={`fact ${expired ? 'fact-bad' : 'fact-dark'}`}>
          <span className="small">ยืนราคาถึง (7 วัน)</span>
          <span className="strong" data-testid="quote-valid-until">
            {dateTimeTH(doc.validUntil, true)}
          </span>
        </div>
        {me?.taxId && (
          <div className="fact">
            <span className="small muted">เลขผู้เสียภาษี</span>
            <span className="mono strong">{me.taxId}</span>
          </div>
        )}
        {me?.email && (
          <div className="fact">
            <span className="small muted">ผู้ติดต่อ</span>
            <span className="mono strong">{me.email}</span>
          </div>
        )}
      </div>

      <ErrorMessage>{shownError}</ErrorMessage>

      <div className="with-summary">
        <div className="stack grow-main">
          <section className="card">
            <ShippingForm value={ship} onChange={setShip} />
          </section>
          <section className="card stack-xs">
            <h2 className="h3">เงื่อนไข</h2>
            <ul className="bullets muted-2">
              <li>ราคาในใบนี้ยืนถึง {dateTimeTH(doc.validUntil)} สั่งภายในเวลานั้นได้ราคานี้แม้ราคาหน้าเว็บเปลี่ยน</li>
              <li>ใบเสนอราคาไม่กันของ ตอนสั่งต้องมีของพอ</li>
              <li>ค่าส่งคิดตอนสั่งตามวิธีที่เลือก</li>
              <li>ใบกำกับภาษีเต็มรูปออกตามยอดที่ชำระ แยก VAT ตรงทุกสตางค์</li>
            </ul>
          </section>
        </div>
        <aside className="card summary stack" aria-label="สรุปยอด">
          <h2 className="h3">สรุปยอดตามใบเสนอราคา</h2>
          <QuoteBreakdown quote={doc.quote} />
          <button type="button" className="btn btn-red btn-lg" data-testid="quote-order" disabled={busy} onClick={order}>
            {busy ? 'กำลังสั่งซื้อ…' : 'อนุมัติแล้ว สั่งซื้อตามใบนี้'}
          </button>
          <span className="small muted center">กดสั่งแล้วระบบกันของ 30 นาทีเพื่อชำระเงิน</span>
        </aside>
      </div>
    </div>
  );
}
