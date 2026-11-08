import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveGuestPhone } from '../cart';
import { ErrorMessage, useTitle } from '../components/common';
import { useAuth } from '../state';

/** ติดตามคำสั่งซื้อ: คนไม่ล็อกอินใช้เลขออเดอร์ + เบอร์โทร (FR-35 · C6 exploration) · สมาชิกไปที่บัญชีได้เลย */
export function Track() {
  useTitle('ติดตามคำสั่งซื้อ');
  const navigate = useNavigate();
  const { me } = useAuth();
  const [no, setNo] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const orderNo = no.trim().toUpperCase();
    const ph = phone.trim();
    if (!/^BB-\d{6}-\d{4}$/.test(orderNo)) return setError('เลขออเดอร์ต้องเป็นรูปแบบ BB-YYMMDD-NNNN');
    if (!ph) return setError('กรุณากรอกเบอร์โทรที่ใช้สั่ง');
    saveGuestPhone(orderNo, ph);
    navigate(`/orders/${encodeURIComponent(orderNo)}`);
  };

  return (
    <div className="wrap page stack narrow">
      <h1 className="h1">ติดตามคำสั่งซื้อ</h1>
      {me && (
        <p>
          เข้าสู่ระบบอยู่แล้ว · ดูทุกออเดอร์ได้ที่ <Link to="/account">บัญชีของฉัน</Link>
        </p>
      )}
      <form className="card stack-sm" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="track-no">เลขออเดอร์</label>
          <input id="track-no" data-testid="track-order-no" placeholder="BB-261113-0001" value={no} onChange={(e) => setNo(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="track-phone">เบอร์โทรที่ใช้สั่ง</label>
          <input id="track-phone" data-testid="track-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        <button type="submit" className="btn btn-dark self-start" data-testid="track-submit">
          ดูออเดอร์
        </button>
      </form>
    </div>
  );
}
