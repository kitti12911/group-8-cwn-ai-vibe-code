import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText, isApiError } from '../api';
import { addToCart, useCart } from '../cart';
import { Breadcrumb, ErrorMessage, Loading, Ph, useTitle } from '../components/common';
import { CATEGORY_LABEL, dateTH, stockText, thb, tierLabel, timeHM } from '../format';
import { maxQty } from '../hooks';
import { useAuth, useClock } from '../state';
import type { Product } from '../types';

const SPEC_LABEL: Record<string, string> = {
  socket: 'Socket',
  ramType: 'ชนิดแรม',
  formFactor: 'ขนาดบอร์ด',
  caseSupports: 'เคสรับบอร์ด',
  gpuLengthMm: 'ความยาวการ์ดจอ (mm)',
  caseMaxGpuMm: 'ใส่การ์ดจอยาวได้ไม่เกิน (mm)',
  tdpW: 'กินไฟ (W)',
  recommendedPsuW: 'พาวเวอร์ที่แนะนำ (W)',
  psuOutputW: 'กำลังไฟพาวเวอร์ (W)',
};

export function ProductDetail() {
  const { sku = '' } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const { flash, flashActive } = useClock();
  const cart = useCart();
  const [p, setP] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  useTitle(p?.name ?? sku);

  const load = useCallback(async () => {
    try {
      const prod = await api.product(sku);
      setP(prod);
      setError(null);
      setNotFound(false);
    } catch (e) {
      if (isApiError(e, 'NOT_FOUND')) setNotFound(true);
      setError(errorText(e));
    }
  }, [sku]);

  useEffect(() => {
    void load();
  }, [load, flashActive, me?.code]);

  const inCart = cart.items.find((i) => i.sku === sku)?.qty ?? 0;
  const max = p ? maxQty(p) : 0;
  const canAddMore = Math.max(0, max - inCart);
  useEffect(() => {
    // keep the picker inside the allowed range
    setQty((q) => Math.max(1, Math.min(q, Math.max(1, canAddMore))));
  }, [canAddMore]);

  if (!p) {
    return (
      <div className="wrap page stack">
        <ErrorMessage>{error}</ErrorMessage>
        {notFound ? <Link to="/products">กลับไปหน้าสินค้าทั้งหมด</Link> : !error && <Loading />}
      </div>
    );
  }

  const soldOut = p.available <= 0;
  const sale = p.currentPrice < p.price;
  const limitHit = p.perBuyerLimit !== null && inCart + qty >= p.perBuyerLimit;

  const put = (): boolean => {
    if (canAddMore <= 0) {
      setMsg(p.perBuyerLimit && inCart >= p.perBuyerLimit ? `รุ่นนี้จำกัดคนละ ${p.perBuyerLimit} ใบ · มีในตะกร้าแล้ว` : `มีในตะกร้าครบ ${p.available} ชิ้นที่มีแล้ว`);
      return inCart > 0;
    }
    addToCart(p.sku, qty, max);
    setMsg(`ใส่ตะกร้าแล้ว ${qty} ชิ้น`);
    return true;
  };

  const specs = Object.entries(p.specs ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== '',
  );

  return (
    <div className="wrap page stack-lg">
      <Breadcrumb
        items={[
          { to: '/', label: 'หน้าแรก' },
          { to: `/products?cat=${p.category}`, label: CATEGORY_LABEL[p.category] ?? p.category },
          { label: p.name },
        ]}
      />
      <div className="grid-product">
        <div className="stack">
          <Ph className="product-hero" label={`[ภาพสินค้า ${p.sku}]`} />
        </div>
        <div className="stack">
          <div className="row-wrap">
            {p.redTag && <span className="badge-red static">ป้ายแดง</span>}
            {p.perBuyerLimit && (
              <span className="tag-outline-dark" data-testid="limit-note">
                จำกัดคนละ {p.perBuyerLimit} ใบ
              </span>
            )}
          </div>
          <div className="stack-xs">
            <span className="mono muted">
              {p.sku} · {CATEGORY_LABEL[p.category] ?? p.category}
            </span>
            <h1 className="h1">{p.name}</h1>
          </div>

          <div className="stack-xs">
            <div className="price-row">
              {sale && (
                <span className="mono price-xl red" data-testid="product-flash-price">
                  {thb(p.currentPrice)}
                </span>
              )}
              <span className={`mono ${sale ? 'price-md muted strike' : 'price-xl'}`} data-testid="product-price">
                {thb(p.price)}
              </span>
              {sale && (
                <span className="badge-red static" data-testid="product-flash-badge">
                  Flash sale ถึง {flash?.endsAt ? timeHM(flash.endsAt) : '13:00'}
                </span>
              )}
            </div>
            <span className="muted">
              รวม VAT แล้ว
              {p.memberPrice !== null && p.memberPrice !== undefined && me && (
                <>
                  {' '}
                  · สมาชิก {tierLabel(me.tier)} จ่าย{' '}
                  <span className="mono strong ink" data-testid="member-price">
                    {thb(p.memberPrice)}
                  </span>
                </>
              )}
            </span>
          </div>

          <div className={`stock-box ${soldOut ? 'out' : p.available <= 3 ? 'low' : 'ok'}`}>
            <span className="strong" data-testid="product-stock">
              {stockText(p.available)}
            </span>
            <span className="small">
              กดสั่งซื้อแล้วระบบกันของให้คุณ 30 นาที ชิ้นเดียวกันจะไม่ถูกขายให้คนอื่นซ้ำ ถ้าไม่ชำระภายในเวลา ของจะกลับมาให้คนอื่นสั่งได้
            </span>
          </div>

          <div className="row-wrap align-center">
            <div className="qty" role="group" aria-label="จำนวน">
              <button type="button" data-testid="qty-minus" aria-label="ลดจำนวน" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
                −
              </button>
              <span className="mono qty-value" data-testid="qty-value" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                data-testid="qty-plus"
                aria-label="เพิ่มจำนวน"
                disabled={soldOut || qty >= canAddMore}
                onClick={() => setQty((q) => Math.min(q + 1, Math.max(1, canAddMore)))}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="btn btn-red btn-lg grow"
              data-testid="buy-now"
              disabled={soldOut}
              onClick={() => {
                if (put()) navigate('/cart');
              }}
            >
              ซื้อเลย
            </button>
            <button type="button" className="btn btn-outline btn-lg grow" data-testid="add-to-cart" disabled={soldOut} onClick={put}>
              {soldOut ? 'สินค้าหมด' : 'ใส่ตะกร้า'}
            </button>
          </div>
          {limitHit && p.perBuyerLimit && <p className="small warn-text">รุ่นนี้จำกัดคนละ {p.perBuyerLimit} ใบ</p>}
          {!limitHit && qty >= canAddMore && canAddMore > 0 && p.available < (p.perBuyerLimit ?? Infinity) && (
            <p className="small warn-text">มีของ {p.available} ชิ้น</p>
          )}
          {msg && (
            <p className="small" role="status">
              {msg} · <Link to="/cart">ไปที่ตะกร้า</Link>
            </p>
          )}
          <p className="small muted">“ซื้อเลย” จะใส่ตะกร้าแล้วพาไปหน้าตะกร้า · ระบบกันของ 30 นาทีเมื่อกดสั่งซื้อในหน้าตะกร้าเท่านั้น</p>

          {p.nextLot && (
            <div className="divider-top stack-xs">
              <h2 className="h3">ของเข้าล็อตถัดไป</h2>
              <div className="card row-between wrap-gap" data-testid="next-lot">
                <span>
                  อีก <strong>{p.nextLot.qty} ชิ้น</strong> · เปิดขาย {dateTH(p.nextLot.releaseAt, true)} เวลา {timeHM(p.nextLot.releaseAt)} น.
                </span>
              </div>
            </div>
          )}

          <div className="divider-top info-grid">
            <div>
              <span className="strong">จัดส่ง</span>
              <span className="muted-2">ส่งฟรีเมื่อครบ ฿3,000 · ด่วน กทม. ฿150 · รับที่ร้านฟรี</span>
            </div>
            <div>
              <span className="strong">คืนของ</span>
              <span className="muted-2">ภายใน 7 วันหลังได้รับ แกะกล่องแล้วหัก 10%</span>
            </div>
            <div>
              <span className="strong">ประกัน</span>
              <span className="muted-2">ของเสียจากโรงงาน เคลมตามประกันผู้ผลิต</span>
            </div>
            {(p.category === 'GPU' || p.category === 'MON') && (
              <div>
                <span className="strong">คูปองที่ใช้ได้</span>
                <span className="muted-2">
                  <span className="mono">GAMER5</span> ลด 5% สูงสุด ฿1,000
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="stack">
        <h2 className="h2">สเปก</h2>
        <div className="card table-wrap no-pad">
          <table className="table spec-table">
            <tbody>
              <tr>
                <th scope="row">รหัสสินค้า</th>
                <td className="mono">{p.sku}</td>
              </tr>
              <tr>
                <th scope="row">หมวด</th>
                <td>{CATEGORY_LABEL[p.category] ?? p.category}</td>
              </tr>
              {specs.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{SPEC_LABEL[k] ?? k}</th>
                  <td>{Array.isArray(v) ? v.join(', ') : String(v)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">ใช้ในหน้าจัดสเปก</th>
                <td>{p.inBuilder ? <Link to="/builder">ได้ · ไปจัดสเปก</Link> : 'ไม่อยู่ในหน้าจัดสเปก'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
