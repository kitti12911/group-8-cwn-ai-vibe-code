import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { setCart } from '../cart';
import { ErrorMessage, Loading, useTitle } from '../components/common';
import { BUILDER_CATS, builderLabel, dateTimeTH, thb, thbShort } from '../format';
import { useClock } from '../state';
import type { SavedBuild as SavedBuildT } from '../types';

/** Read-only view of a shared build: current prices, diff vs. saved price, sold-out marks. */
export function SavedBuild() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { flashActive } = useClock();
  const [build, setBuild] = useState<SavedBuildT | null>(null);
  const [error, setError] = useState<string | null>(null);
  useTitle(`สเปก ${code}`);

  useEffect(() => {
    api
      .getBuild(code)
      .then((b) => {
        setBuild(b);
        setError(null);
      })
      .catch((e) => setError(errorText(e)));
  }, [code, flashActive]);

  if (!build) {
    return (
      <div className="wrap page stack">
        <ErrorMessage>{error}</ErrorMessage>
        {!error ? <Loading /> : <Link to="/builder">ไปหน้าจัดสเปก</Link>}
      </div>
    );
  }

  const ev = build.evaluation;
  const order = (c: string) => {
    const i = BUILDER_CATS.indexOf(c.toLowerCase() as (typeof BUILDER_CATS)[number]);
    return i < 0 ? 99 : i;
  };
  const items = [...build.items].sort((a, b) => order(a.category) - order(b.category));
  const over = ev && (ev.overBudget || (ev.remaining !== null && ev.remaining < 0));
  const canAdd = items.length > 0 && (ev ? ev.canAddToCart : true);

  const addAll = () => {
    setCart((c) => {
      const next = c.items.map((i) => ({ ...i }));
      // FR-22: every piece goes in — a SKU already in the cart gets +1
      for (const it of items) {
        const line = next.find((i) => i.sku === it.sku);
        if (line) line.qty += 1;
        else next.push({ sku: it.sku, qty: 1 });
      }
      return { ...c, items: next, assembly: !!build.assembly };
    });
    navigate('/cart');
  };

  return (
    <div className="wrap page stack-lg narrow">
      <div className="stack-xs">
        <span className="mono eyebrow">ลิงก์สเปก · {build.code}</span>
        <h1 className="h1">สเปกที่บันทึกไว้</h1>
        <span className="muted">
          บันทึกเมื่อ {dateTimeTH(build.savedAt)} · ราคาด้านล่างเป็นราคาตอนนี้ ไม่ล็อกราคา · ส่วนลดคิดตามบัญชีของคนที่จ่าย
        </span>
      </div>
      <ErrorMessage>{error}</ErrorMessage>

      <section className="card no-pad">
        <ul className="build-list">
          {items.map((it) => {
            const cat = it.category.toLowerCase();
            const diff = it.currentPrice - it.priceAtSave;
            return (
              <li key={cat + it.sku} className="build-item" data-testid={`build-item-${cat}`}>
                <div className="stack-xs grow">
                  <span className="small muted">{builderLabel(cat)}</span>
                  <Link to={`/products/${it.sku}`} className="strong">
                    {it.name}
                  </Link>
                  <span className="mono small muted">{it.sku}</span>
                  {it.available <= 0 && (
                    <span className="stock out" data-testid={`build-sold-out-${cat}`}>
                      หมดแล้ว
                    </span>
                  )}
                </div>
                <div className="stack-xs align-right">
                  <span className="mono strong">{thb(it.currentPrice)}</span>
                  {diff !== 0 && (
                    <span className={`small ${diff < 0 ? 'good-text' : 'bad-text'}`} data-testid={`build-price-diff-${cat}`}>
                      ราคาเปลี่ยน {diff < 0 ? '−' : '+'}
                      {thbShort(Math.abs(diff))} จากตอนบันทึก
                    </span>
                  )}
                  {diff !== 0 && <s className="mono small muted">{thb(it.priceAtSave)}</s>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card stack">
        <div className="row-between">
          <span>ราคารวมตอนนี้ ({items.length} ชิ้น)</span>
          <span className="mono big strong">{thb(ev?.total ?? items.reduce((s, i) => s + i.currentPrice, 0))}</span>
        </div>
        <div className="row-between">
          <span>ค่าประกอบ {build.assembly ? '(ให้ร้านประกอบ)' : '(ไม่ประกอบ)'}</span>
          <span className="mono">{thb(ev?.assemblyFee ?? 0)}</span>
        </div>
        <div data-testid="build-remaining" className={`strong ${over ? 'bad-text' : 'good-text'}`}>
          {!ev || ev.remaining === null || ev.remaining === undefined
            ? 'ไม่ได้ตั้งงบไว้'
            : over
              ? `เกินงบ ${thb(Math.abs(ev.remaining))}`
              : `เหลืองบ ${thb(ev.remaining)}`}
          {build.budget ? <span className="small muted"> · งบ {thb(build.budget)}</span> : null}
        </div>
        {(ev?.conflicts?.length ?? 0) > 0 && (
          <div className="alert alert-error-soft small">
            {ev.conflicts.map((c, i) => (
              <div key={i}>{c.message}</div>
            ))}
          </div>
        )}
        {ev?.warnings?.map((w, i) => (
          <div key={i} className="alert alert-warn small">
            ⚠ {w.message}
          </div>
        ))}
        {items.some((i) => i.available <= 0) && (
          <p className="small bad-text">มีชิ้นที่หมดแล้ว ระบบจะแจ้งอีกครั้งตอนกดสั่ง ให้เลือกเอาชิ้นนั้นออกหรือเลือกใหม่</p>
        )}
        <div className="row-wrap">
          <button type="button" className="btn btn-red grow" data-testid="build-add-all" disabled={!canAdd} onClick={addAll}>
            ใส่ตะกร้าทั้งชุด
          </button>
          <Link to={`/builder?build=${encodeURIComponent(build.code)}`} className="btn btn-outline grow">
            แก้เป็นสเปกใหม่ของฉัน
          </Link>
        </div>
      </section>
    </div>
  );
}
