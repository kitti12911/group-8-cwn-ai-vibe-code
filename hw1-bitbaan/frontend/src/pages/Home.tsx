import { Link } from 'react-router-dom';
import { ErrorMessage, Ph, useTitle } from '../components/common';
import { CATEGORIES, CATEGORY_LABEL, dateTH, dhms, pad2, thb, timeHM } from '../format';
import { useProducts } from '../hooks';
import { useClock, useServerNow } from '../state';

export function Home() {
  useTitle('');
  const { products, error } = useProducts();
  const { flash, flashActive } = useClock();
  const now = useServerNow(1000);
  const red = (products ?? []).filter((p) => p.redTag);

  const target = flash ? Date.parse(flashActive ? flash.endsAt ?? '' : flash.nextStart) : NaN;
  const left = Number.isNaN(target) ? null : dhms((target - now) / 1000);

  return (
    <>
      <section className="wrap hero">
        <div className="hero-copy">
          <p className="eyebrow mono">ร้านชิ้นส่วนคอม · ชั้น 4 ห้างไอที ปิ่นเกล้า</p>
          <h1 className="hero-title">เลือก สั่ง จ่ายเองได้ทันที ไม่ต้องรอแอดมินตอบแชต</h1>
          <p className="lead">
            ราคาบนเว็บตรงกับหน้าร้าน รวม VAT แล้วทุกชิ้น กดสั่งแล้วระบบกันของไว้ให้คุณ 30 นาที ชิ้นที่คุณจองจะไม่ถูกขายซ้ำให้คนอื่น
          </p>
          <div className="row-wrap">
            <Link to="/products" className="btn btn-dark btn-lg">
              เลือกซื้อสินค้า
            </Link>
            <Link to="/login?tab=business" className="btn btn-outline btn-lg">
              ขอใบเสนอราคาสำหรับบริษัท
            </Link>
          </div>
        </div>
        <article className="hero-card">
          <div className="row-between">
            <span className="mono eyebrow-red">จัดสเปกเอง</span>
            <span className="mono tag-outline">7 หมวด</span>
          </div>
          <Ph className="hero-ph" />
          <h2 className="h2">จัดสเปกทีละหมวด เว็บเช็กให้ว่าใส่กันได้</h2>
          <div className="hero-facts">
            <div>
              <div className="small dim">socket / แรม</div>
              <div className="strong">ห้ามเลือกผิด</div>
            </div>
            <div>
              <div className="small dim">พาวเวอร์</div>
              <div className="strong">เตือนถ้าไม่พอ</div>
            </div>
            <div>
              <div className="small dim">ค่าประกอบ</div>
              <div className="strong mono">฿500 · ครบชุดฟรี</div>
            </div>
          </div>
          <Link to="/builder" className="btn btn-light">
            ไปหน้าจัดสเปก
          </Link>
        </article>
      </section>

      <section className="flash-section">
        <div className="wrap stack-lg">
          <div className="row-between wrap-gap">
            <div className="stack-xs">
              <span className="mono eyebrow">FLASH SALE · ทุกวันศุกร์ 12:00–13:00</span>
              <h2 className="h1">สินค้าป้ายแดงลด 10%</h2>
              <span>
                {flash
                  ? flashActive
                    ? `กำลังลดอยู่ตอนนี้ ถึง ${flash.endsAt ? timeHM(flash.endsAt) : '13:00'} น.`
                    : `รอบถัดไป ${dateTH(flash.nextStart, true)} ${timeHM(flash.nextStart)} น.`
                  : 'ทุกวันศุกร์ 12:00–13:00'}{' '}
                · สมาชิกได้ส่วนลดสมาชิกเพิ่มอีกต่อ
              </span>
            </div>
            {left && (
              <div role="timer" aria-label={flashActive ? 'เหลือเวลา flash sale' : 'เหลือเวลาก่อนเริ่ม flash sale'} className="timer-boxes">
                {[
                  [left.d, 'วัน'],
                  [left.h, 'ชม.'],
                  [left.m, 'นาที'],
                  [left.s, 'วินาที'],
                ].map(([v, l]) => (
                  <div key={l as string} className="timer-box">
                    <span className="mono">{pad2(v as number)}</span>
                    <span className="small">{l}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          <div className="grid-cards">
            {red.map((p) => {
              const sale = p.currentPrice < p.price;
              return (
                <Link key={p.sku} to={`/products/${p.sku}`} className="flash-card" data-testid={`home-flash-${p.sku}`}>
                  <div className="ph flash-ph">
                    <span className="badge-red">ป้ายแดง −10%</span>
                  </div>
                  <span className="mono small muted">{p.sku}</span>
                  <span className="strong">{p.name}</span>
                  <div className="price-row">
                    <span className={`mono price ${sale ? 'red' : ''}`}>{thb(p.currentPrice)}</span>
                    {sale && <s className="mono muted small">{thb(p.price)}</s>}
                  </div>
                  {!sale && <span className="small muted">ลด 10% ช่วง flash sale</span>}
                </Link>
              );
            })}
            {products && red.length === 0 && <p>ยังไม่มีสินค้าป้ายแดง</p>}
          </div>
        </div>
      </section>

      <section className="wrap section stack">
        <div className="row-between wrap-gap">
          <h2 className="h1">เลือกตามหมวด</h2>
          <Link to="/products">ดูสินค้าทั้งหมด {products ? `${products.length} รายการ` : ''}</Link>
        </div>
        <div className="grid-tiles">
          {CATEGORIES.map((c) => {
            const n = (products ?? []).filter((p) => p.category === c).length;
            return (
              <Link key={c} to={`/products?cat=${c}`} className="tile">
                <span className="stack-xs">
                  <span className="strong big-ish">{CATEGORY_LABEL[c]}</span>
                  <span className="small muted">{products ? `${n} รุ่น` : '…'}</span>
                </span>
                <span className="mono small muted">{c}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="wrap section grid-2">
        <div className="card card-lg stack">
          <span className="mono eyebrow">จัดสเปก · ชุดประกอบ</span>
          <h3 className="h2">ซื้อ CPU กับเมนบอร์ดในออเดอร์เดียว ลดเพิ่ม ฿500</h3>
          <p className="muted-2">ระบบหักให้อัตโนมัติในตะกร้า ไม่ต้องใส่โค้ด · จัดครบ 7 หมวดประกอบให้ฟรี</p>
          <Link to="/builder" className="strong">
            ไปจัดสเปกเอง
          </Link>
        </div>
        <div className="card card-lg stack">
          <span className="mono eyebrow">สมาชิก · คิดจากยอดซื้อ 12 เดือนล่าสุด</span>
          <div className="tiers">
            <div className="tier tier-silver">
              <span className="strong">Silver</span>
              <span className="mono tier-rate">−3%</span>
              <span className="small muted">ยอดสะสม ≥฿20,000</span>
            </div>
            <div className="tier tier-gold">
              <span className="strong">Gold</span>
              <span className="mono tier-rate">−5%</span>
              <span className="small muted">ยอดสะสม ≥฿100,000</span>
            </div>
            <div className="tier tier-biz">
              <span className="strong">Business</span>
              <span className="mono tier-rate">−8%</span>
              <span className="small muted">บริษัทมีเลขผู้เสียภาษี</span>
            </div>
          </div>
          <Link to="/login?tab=register" className="strong">
            สมัครสมาชิก
          </Link>
        </div>
      </section>

      <section className="wrap section">
        <div className="info-strip">
          <div>
            <span className="strong">ส่งปกติ ฿60</span>
            <span className="small muted">ฟรีเมื่อซื้อครบ ฿3,000</span>
          </div>
          <div>
            <span className="strong">ส่งด่วนในกรุงเทพฯ ฿150</span>
            <span className="small muted">ไม่มีส่งฟรีสำหรับส่งด่วน</span>
          </div>
          <div>
            <span className="strong">รับที่ร้านฟรี</span>
            <span className="small muted">เปิด 10:00–21:00 ทุกวัน</span>
          </div>
          <div>
            <span className="strong">คืนของได้ใน 7 วัน</span>
            <span className="small muted">แกะกล่องแล้วหักค่าธรรมเนียม 10%</span>
          </div>
        </div>
      </section>
    </>
  );
}
