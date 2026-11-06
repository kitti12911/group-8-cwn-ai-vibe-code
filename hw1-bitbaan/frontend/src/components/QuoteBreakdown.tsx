import { baht, discount, tierLabel } from '../format';
import type { Quote } from '../types';

/**
 * The step-by-step price ladder (US-24): list → flash → bundle → member → coupon
 * → assembly → shipping → total, plus VAT split. All values are baht with 2
 * decimals; the testid sits on the number only.
 */
export function QuoteBreakdown({ quote, showLines = true }: { quote: Quote; showLines?: boolean }) {
  const c = quote.coupon ?? { code: null, status: 'NONE', reason: null, amount: 0 };
  return (
    <div className="ladder">
      {showLines && (
        <ul className="ladder-lines" aria-label="รายการสินค้า">
          {quote.lines.map((l) => (
            <li key={l.sku} data-testid="quote-line" data-sku={l.sku} className="ladder-line">
              <span className="ladder-line-name">
                <span>{l.name}</span>
                <span className="mono small muted">
                  {l.sku} · {baht(l.unitFlashPrice ?? l.unitPrice)} × {l.qty}
                  {l.unitFlashPrice !== null && l.unitFlashPrice !== undefined && l.unitFlashPrice !== l.unitPrice && (
                    <>
                      {' '}
                      <s>{baht(l.unitPrice)}</s>
                    </>
                  )}
                </span>
              </span>
              <span className="mono">{baht(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ladder-rows">
        <Row label="ราคาป้าย (รวม VAT)" testid="quote-list-total" value={baht(quote.listTotal)} />
        <Row label="ลด flash sale (ป้ายแดง −10%)" testid="quote-flash" value={discount(quote.flashDiscount)} good={quote.flashDiscount > 0} />
        <Sub label="หลัง flash sale" value={quote.g1} />
        <Row
          label={`ส่วนลดชุดประกอบ CPU + เมนบอร์ด${quote.bundles ? ` × ${quote.bundles}` : ''}`}
          testid="quote-bundle"
          value={discount(quote.bundleDiscount)}
          good={quote.bundleDiscount > 0}
        />
        <Sub label="หลังส่วนลดชุดประกอบ" value={quote.g2} />
        <Row
          label={quote.tier ? `สมาชิก ${tierLabel(quote.tier)} ${quote.memberRate}%` : 'ส่วนลดสมาชิก (ไม่ได้เข้าสู่ระบบ)'}
          testid="quote-member"
          value={discount(quote.memberDiscount)}
          good={quote.memberDiscount > 0}
        />
        <Sub label="หลังส่วนลดสมาชิก" value={quote.g3} />
        <Row
          label={c.code ? `คูปอง ${c.code}${c.status === 'REJECTED' ? ' (ใช้ไม่ได้)' : ''}` : 'คูปอง'}
          testid="quote-coupon"
          value={discount(c.amount)}
          good={c.amount > 0}
        />
        <Sub label="ยอดสินค้าหลังส่วนลดทั้งหมด" value={quote.g4} />
        <Row label="ค่าประกอบ" testid="quote-assembly" value={baht(quote.assemblyFee)} />
        <Row label="ค่าส่ง" testid="quote-shipping" value={baht(quote.shippingFee)} />
      </div>

      <div className="ladder-total">
        <span>ยอดชำระ</span>
        <span className="mono big">
          ฿<span data-testid="quote-total">{baht(quote.total)}</span>
        </span>
      </div>
      <div className="ladder-vat">
        <div>
          <span>มูลค่าก่อน VAT</span>
          <span className="mono" data-testid="quote-pre-vat">
            {baht(quote.preVat)}
          </span>
        </div>
        <div>
          <span>VAT 7%</span>
          <span className="mono" data-testid="quote-vat">
            {baht(quote.vat)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, testid, good }: { label: string; value: string; testid: string; good?: boolean }) {
  return (
    <div className={`ladder-row ${good ? 'good' : ''}`}>
      <span>{label}</span>
      <span className="mono" data-testid={testid}>
        {value}
      </span>
    </div>
  );
}

function Sub({ label, value }: { label: string; value: number }) {
  return (
    <div className="ladder-sub">
      <span>{label}</span>
      <span className="mono">{baht(value)}</span>
    </div>
  );
}
