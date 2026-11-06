import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addToCart, useCart } from '../cart';
import { Breadcrumb, ErrorMessage, Loading, useTitle } from '../components/common';
import { CATEGORIES, CATEGORY_LABEL, stockText, thb } from '../format';
import { maxQty, useProducts } from '../hooks';
import type { Category, Product } from '../types';

type Sort = 'rec' | 'asc' | 'desc';

export function Products() {
  const [params, setParams] = useSearchParams();
  const cat = (params.get('cat') ?? '').toUpperCase() as Category | '';
  const redOnly = params.get('red') === '1';
  const inStock = params.get('stock') === '1';
  const search = (params.get('q') ?? '').trim().toLowerCase();
  const [sort, setSort] = useState<Sort>('rec');
  const { products, error } = useProducts();
  useTitle(cat ? CATEGORY_LABEL[cat] ?? 'สินค้า' : 'สินค้าทั้งหมด');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const all = products ?? [];
  let items = all.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (!redOnly || p.redTag) &&
      (!inStock || p.available > 0) &&
      (!search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search) || (CATEGORY_LABEL[p.category] ?? '').toLowerCase().includes(search)),
  );
  if (sort !== 'rec') items = [...items].sort((a, b) => (sort === 'asc' ? 1 : -1) * (a.currentPrice - b.currentPrice));

  const title = cat ? CATEGORY_LABEL[cat] ?? cat : redOnly ? 'สินค้าป้ายแดง' : 'สินค้าทั้งหมด';

  return (
    <div className="wrap page stack-lg">
      <Breadcrumb items={[{ to: '/', label: 'หน้าแรก' }, { label: title }]} />
      <div className="row-between wrap-gap align-end">
        <div className="stack-xs">
          <h1 className="h1">{title}</h1>
          <span className="muted">
            แสดง {items.length} จาก {all.length} รายการ · ราคารวม VAT แล้ว
            {search && ` · ค้นหา “${params.get('q')}”`}
          </span>
        </div>
        <div className="row-wrap align-center">
          <label htmlFor="sort">เรียงตาม</label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="rec">แนะนำ</option>
            <option value="asc">ราคาต่ำ → สูง</option>
            <option value="desc">ราคาสูง → ต่ำ</option>
          </select>
        </div>
      </div>

      <div className="with-aside">
        <aside aria-label="ตัวกรอง" className="filters stack">
          <div className="stack-xs">
            <h2 className="label-caps">หมวด</h2>
            <button type="button" className={`cat-btn ${!cat ? 'on' : ''}`} onClick={() => setParam('cat', null)}>
              ทั้งหมด<span className="mono small">{all.length}</span>
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                data-testid={`filter-cat-${c}`}
                className={`cat-btn ${cat === c ? 'on' : ''}`}
                onClick={() => setParam('cat', c)}
              >
                {CATEGORY_LABEL[c]}
                <span className="mono small">{all.filter((p) => p.category === c).length}</span>
              </button>
            ))}
          </div>
          <div className="stack-xs divider-top">
            <h2 className="label-caps">ตัวกรอง</h2>
            <label className="check">
              <input type="checkbox" data-testid="filter-red-tag" checked={redOnly} onChange={(e) => setParam('red', e.target.checked ? '1' : null)} />
              เฉพาะป้ายแดง (ลด 10% ช่วง flash sale)
            </label>
            <label className="check">
              <input type="checkbox" data-testid="filter-in-stock" checked={inStock} onChange={(e) => setParam('stock', e.target.checked ? '1' : null)} />
              มีของพร้อมส่ง
            </label>
          </div>
          <div className="card stack-xs">
            <span className="strong">ชุดประกอบลด ฿500</span>
            <span className="small muted-2">ใส่ CPU และเมนบอร์ดในออเดอร์เดียวกัน ระบบหักให้ในตะกร้า</span>
          </div>
        </aside>

        <section aria-label="รายการสินค้า" className="product-grid">
          <ErrorMessage>{error}</ErrorMessage>
          {!products && !error && <Loading />}
          {items.map((p) => (
            <ProductCard key={p.sku} p={p} />
          ))}
          {products && items.length === 0 && <p className="muted">ไม่มีสินค้าตรงกับตัวกรอง</p>}
        </section>
      </div>
    </div>
  );
}

function ProductCard({ p }: { p: Product }) {
  const cart = useCart();
  const [msg, setMsg] = useState<string | null>(null);
  const inCart = cart.items.find((i) => i.sku === p.sku)?.qty ?? 0;
  const max = maxQty(p);
  const soldOut = p.available <= 0;
  const sale = p.currentPrice < p.price;
  const low = p.available > 0 && p.available <= 3;

  const add = () => {
    if (inCart >= max) {
      setMsg(p.perBuyerLimit && inCart >= p.perBuyerLimit ? `รุ่นนี้จำกัดคนละ ${p.perBuyerLimit} ใบ` : `มีของ ${p.available} ชิ้น`);
      return;
    }
    addToCart(p.sku, 1, max);
    setMsg('ใส่ตะกร้าแล้ว');
  };

  return (
    <article className="card product-card" data-testid={`product-card-${p.sku}`}>
      <Link to={`/products/${p.sku}`} className="ph product-ph" aria-label={p.name}>
        {p.redTag && <span className="badge-red">ป้ายแดง</span>}
        {p.perBuyerLimit && <span className="badge-dark">คนละ {p.perBuyerLimit}</span>}
      </Link>
      <span className="mono small muted">
        {p.sku} · {CATEGORY_LABEL[p.category] ?? p.category}
      </span>
      <Link to={`/products/${p.sku}`} className="product-name">
        {p.name}
      </Link>
      <div className="price-row">
        {sale && (
          <span className="mono price red" data-testid={`product-flash-price-${p.sku}`}>
            {thb(p.currentPrice)}
          </span>
        )}
        <span className={`mono ${sale ? 'small muted strike' : 'price'}`} data-testid={`product-price-${p.sku}`}>
          {thb(p.price)}
        </span>
      </div>
      <div className="row-between align-center">
        <span className={`stock ${soldOut ? 'out' : low ? 'low' : 'ok'}`} data-testid={`product-stock-${p.sku}`}>
          {stockText(p.available)}
        </span>
        <button
          type="button"
          className="btn btn-dark btn-sm"
          data-testid={`add-to-cart-${p.sku}`}
          disabled={soldOut}
          onClick={add}
          aria-label={soldOut ? `สินค้าหมด ${p.name}` : `ใส่ตะกร้า ${p.name}`}
        >
          {soldOut ? 'สินค้าหมด' : 'ใส่ตะกร้า'}
        </button>
      </div>
      {msg && (
        <span className="small muted" role="status">
          {msg}
        </span>
      )}
    </article>
  );
}
