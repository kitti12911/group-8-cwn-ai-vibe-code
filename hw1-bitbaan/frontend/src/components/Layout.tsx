import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cartCount, useCart } from '../cart';
import { dateTH, dhms, pad2, timeHM } from '../format';
import { isStaff, useAuth, useClock, useServerNow } from '../state';

export function Layout() {
  const location = useLocation();
  const { sync } = useClock();

  // resync server time on navigation (tests may move the server clock)
  useEffect(() => {
    sync();
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="app">
      <a className="skip" href="#main">
        ข้ามไปเนื้อหา
      </a>
      <div className="strip">
        <div className="wrap strip-inner">
          <span>ราคารวม VAT แล้วทุกชิ้น</span>
          <span aria-hidden="true">·</span>
          <span>ส่งฟรีเมื่อซื้อครบ ฿3,000</span>
          <span aria-hidden="true">·</span>
          <span>รับที่ร้านฟรี 10:00–21:00 ทุกวัน</span>
        </div>
      </div>
      <Header />
      <FlashBanner />
      <main id="main" className="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const cart = useCart();
  const { me } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  return (
    <header className="header">
      <div className="wrap header-inner">
        <Link to="/" className="logo" aria-label="บิตบ้าน หน้าแรก">
          <span className="logo-th">บิตบ้าน</span>
          <span className="logo-en mono">BITBAAN.PC</span>
        </Link>
        <button type="button" className="btn btn-ghost menu-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          เมนู
        </button>
        <nav aria-label="หมวดหลัก" className={`main-nav ${open ? 'open' : ''}`}>
          <NavLink to="/products" end>
            สินค้าทั้งหมด
          </NavLink>
          <Link to="/products?red=1" className="accent">
            Flash Sale
          </Link>
          <NavLink to="/builder">จัดสเปก</NavLink>
          <Link to="/login?tab=business">สำหรับธุรกิจ</Link>
        </nav>
        <form className="search" role="search" onSubmit={onSearch}>
          <label htmlFor="site-search" className="sr-only">
            ค้นหาสินค้า
          </label>
          <input
            id="site-search"
            type="search"
            placeholder="ค้นหา เช่น การ์ดจอ, SSD, CPU-N7"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn btn-sm">
            ค้นหา
          </button>
        </form>
        <div className="header-actions">
          {isStaff(me) && (
            <Link to="/admin" data-testid="nav-admin" className="nav-link">
              หลังร้าน
            </Link>
          )}
          {me ? (
            <Link to="/account" data-testid="nav-account" className="nav-link">
              บัญชีของฉัน · {me.name}
            </Link>
          ) : (
            <Link to="/login" data-testid="nav-login" className="nav-link">
              เข้าสู่ระบบ
            </Link>
          )}
          <Link to="/cart" className="btn btn-dark cart-btn">
            ตะกร้า{' '}
            <span className="mono" data-testid="nav-cart-count">
              {cartCount(cart)}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function FlashBanner() {
  const { flash, flashActive, ready } = useClock();
  const now = useServerNow(1000);
  if (!ready || !flash) {
    return <div className="flash-banner" data-testid="flash-banner" data-active="false" />;
  }
  if (flashActive) {
    const end = flash.endsAt ? Date.parse(flash.endsAt) : NaN;
    const left = Number.isNaN(end) ? null : dhms((end - now) / 1000);
    return (
      <div className="flash-banner on" data-testid="flash-banner" data-active="true">
        <div className="wrap flash-inner">
          <strong>FLASH SALE ตอนนี้</strong>
          <span>สินค้าป้ายแดงลด 10% ถึง {flash.endsAt ? timeHM(flash.endsAt) : '13:00'} น.</span>
          {left && (
            <span className="mono">
              เหลือ {pad2(left.h)}:{pad2(left.m)}:{pad2(left.s)}
            </span>
          )}
          <Link to="/products?red=1">ดูสินค้าป้ายแดง</Link>
        </div>
      </div>
    );
  }
  const start = Date.parse(flash.nextStart);
  const left = Number.isNaN(start) ? null : dhms((start - now) / 1000);
  return (
    <div className="flash-banner" data-testid="flash-banner" data-active="false">
      <div className="wrap flash-inner">
        <strong>Flash sale ทุกวันศุกร์ 12:00–13:00</strong>
        <span>
          รอบถัดไป {dateTH(flash.nextStart, true)} {timeHM(flash.nextStart)} น.
        </span>
        {left && (
          <span className="mono">
            อีก {left.d > 0 ? `${left.d} วัน ` : ''}
            {pad2(left.h)}:{pad2(left.m)}:{pad2(left.s)}
          </span>
        )}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div className="stack-xs">
          <span className="footer-name">บิตบ้าน คอมพิวเตอร์</span>
          <span>ชั้น 4 ห้างไอทีย่านปิ่นเกล้า · เปิด 10:00–21:00 ทุกวัน</span>
        </div>
        <nav aria-label="ลิงก์ท้ายหน้า" className="footer-nav">
          <Link to="/account">ติดตามคำสั่งซื้อ</Link>
          <Link to="/builder">จัดสเปกคอม</Link>
          <Link to="/login?tab=business">ลูกค้าธุรกิจ</Link>
        </nav>
      </div>
    </footer>
  );
}
