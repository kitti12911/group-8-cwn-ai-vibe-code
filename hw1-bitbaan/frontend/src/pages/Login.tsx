import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { ErrorMessage, useTitle } from '../components/common';
import { useAuth } from '../state';

type Tab = 'login' | 'register' | 'business';
const TABS: [Tab, string][] = [
  ['login', 'เข้าสู่ระบบ'],
  ['register', 'สมัครสมาชิก'],
  ['business', 'สมัครบริษัท'],
];

export function Login() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('tab');
  const [tab, setTab] = useState<Tab>(initial === 'register' || initial === 'business' ? initial : 'login');
  const navigate = useNavigate();
  const { setMe, refresh } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '', company: '', taxId: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useTitle(TABS.find((t) => t[0] === tab)![1]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pick = (t: Tab) => {
    setTab(t);
    setError(null);
    const next = new URLSearchParams(params);
    if (t === 'login') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // C2/C4 exploration: say what is missing instead of a generic error
    if (tab === 'login' && (!form.email.trim() || !form.password)) {
      setError('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }
    if (tab === 'business' && (!form.company.trim() || !/^\d{13}$/.test(form.taxId.replace(/[\s-]/g, '')))) {
      setError('สมัครบริษัทต้องกรอกชื่อบริษัท และเลขประจำตัวผู้เสียภาษี 13 หลัก');
      return;
    }
    setBusy(true);
    try {
      if (tab === 'login') {
        const me = await api.login(form.email.trim(), form.password);
        setMe(me);
      } else {
        const body: Parameters<typeof api.register>[0] = {
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          phone: form.phone.trim(),
        };
        if (tab === 'business') {
          body.business = true;
          body.company = form.company.trim();
          body.taxId = form.taxId.replace(/[\s-]/g, '');
        }
        const me = await api.register(body);
        setMe(me);
      }
      await refresh();
      navigate(params.get('next') || '/account');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const heading = tab === 'login' ? 'ยินดีต้อนรับกลับ' : tab === 'register' ? 'สร้างบัญชีใหม่' : 'สมัครสมาชิก Business';

  return (
    <div className="wrap page grid-2 align-start narrow-wide">
      <section className="card card-lg stack">
        <div role="tablist" aria-label="ประเภทบัญชี" className="tabs">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`tab-${id}`}
              className={tab === id ? 'on' : ''}
              onClick={() => pick(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <h1 className="h2">{heading}</h1>

        <form className="stack" onSubmit={submit} noValidate>
          {tab === 'login' ? (
            <>
              <div className="field">
                <label htmlFor="login-email">อีเมล</label>
                <input id="login-email" data-testid="login-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
              </div>
              <div className="field">
                <label htmlFor="login-password">รหัสผ่าน</label>
                <input id="login-password" data-testid="login-password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} />
              </div>
              <ErrorMessage>{error}</ErrorMessage>
              <button type="submit" className="btn btn-dark btn-lg" data-testid="login-submit" disabled={busy}>
                {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
              </button>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="register-name">{tab === 'business' ? 'ชื่อผู้ติดต่อ' : 'ชื่อ-นามสกุล'}</label>
                <input id="register-name" data-testid="register-name" type="text" autoComplete="name" value={form.name} onChange={set('name')} />
              </div>
              <div className="field">
                <label htmlFor="register-phone">เบอร์โทร</label>
                <input id="register-phone" data-testid="register-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
              </div>
              <div className="field">
                <label htmlFor="register-email">อีเมล</label>
                <input id="register-email" data-testid="register-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
              </div>
              <div className="field">
                <label htmlFor="register-password">รหัสผ่าน</label>
                <input id="register-password" data-testid="register-password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
              </div>
              {tab === 'business' && (
                <>
                  <div className="field">
                    <label htmlFor="register-company">ชื่อบริษัท</label>
                    <input id="register-company" data-testid="register-company" type="text" autoComplete="organization" value={form.company} onChange={set('company')} />
                  </div>
                  <div className="field">
                    <label htmlFor="register-tax-id">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
                    <input
                      id="register-tax-id"
                      data-testid="register-tax-id"
                      type="text"
                      inputMode="numeric"
                      className="mono"
                      placeholder="0000000000000"
                      value={form.taxId}
                      onChange={set('taxId')}
                    />
                  </div>
                  <p className="note">สมัครแล้วได้ส่วนลด Business 8% ทันที ไม่ต้องดูยอดสะสม · ขอใบเสนอราคาและใบกำกับภาษีเต็มรูปได้</p>
                </>
              )}
              <ErrorMessage>{error}</ErrorMessage>
              <button type="submit" className="btn btn-dark btn-lg" data-testid="register-submit" disabled={busy}>
                {busy ? 'กำลังสมัคร…' : tab === 'business' ? 'สมัคร Business' : 'สมัครสมาชิก'}
              </button>
            </>
          )}
        </form>
      </section>

      <aside className="stack">
        <div className="card card-lg stack-sm">
          <h2 className="h3">สั่งซื้อโดยไม่สมัครสมาชิก</h2>
          <p className="muted-2">ใช้แค่ชื่อ อีเมล และเบอร์โทรเพื่อรับสถานะออเดอร์ ไม่ได้ส่วนลดสมาชิกและไม่นับยอดสะสม</p>
          <Link to="/cart" className="btn btn-outline self-start" data-testid="guest-checkout">
            สั่งซื้อโดยไม่สมัครสมาชิก
          </Link>
        </div>
        <div className="stack-sm pad-sm">
          <h2 className="h3">ทำไมต้องสมัคร</h2>
          <ul className="bullets muted-2">
            <li>ยอดซื้อสะสม 12 เดือนครบ ฿20,000 เป็น Silver ลด 3% ครบ ฿100,000 เป็น Gold ลด 5%</li>
            <li>
              ออเดอร์แรกใช้โค้ด <span className="mono strong ink">NEWBIT200</span> ลด ฿200 เมื่อซื้อครบ ฿2,000
            </li>
            <li>ติดตามออเดอร์ ขอคืนของ และดูใบกำกับภาษีย้อนหลังได้เอง</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
