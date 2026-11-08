import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { setCart } from '../cart';
import { ErrorMessage, Loading, useTitle } from '../components/common';
import { BUILDER_CATS, BUILDER_LABEL, builderLabel, thb } from '../format';
import { maxQty, useProducts } from '../hooks';
import type { BuilderCat, BuilderInput, BuilderParts, BuilderResult, Product } from '../types';

const EMPTY_PARTS: BuilderParts = { cpu: null, mb: null, ram: null, gpu: null, ssd: null, psu: null, case: null };

export function specLine(p: Product): string {
  const s = p.specs ?? {};
  const bits: string[] = [];
  if (s.socket) bits.push(String(s.socket));
  if (s.ramType) bits.push(String(s.ramType));
  if (s.formFactor) bits.push(String(s.formFactor));
  if (s.tdpW) bits.push(`${s.tdpW}W`);
  if (s.recommendedPsuW) bits.push(`แนะนำ ${s.recommendedPsuW}W`);
  if (s.gpuLengthMm) bits.push(`${s.gpuLengthMm} mm`);
  if (s.psuOutputW) bits.push(`${s.psuOutputW}W`);
  if (Array.isArray(s.caseSupports) && s.caseSupports.length) bits.push(`รับ ${s.caseSupports.join(', ')}`);
  if (s.caseMaxGpuMm) bits.push(`การ์ดจอ ≤ ${s.caseMaxGpuMm} mm`);
  return bits.join(' · ');
}

/** budget input (baht, string) → satang or undefined */
function budgetSatang(b: string): number | undefined {
  const n = Number(b.replace(/[,\s฿]/g, ''));
  if (!b.trim() || !Number.isInteger(n) || n <= 0) return undefined;
  return n * 100;
}

/** BR-35 · C1 exploration: say why a typed budget is ignored (0, negative, decimals, text) */
function budgetProblem(b: string): string | null {
  if (!b.trim()) return null;
  return budgetSatang(b) === undefined ? 'งบต้องเป็นจำนวนเต็มบาท มากกว่า ฿0 · ตอนนี้ยังไม่ได้ใช้งบนี้' : null;
}

export function Builder() {
  useTitle('จัดสเปก');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { products, error: productsError } = useProducts();
  const [parts, setParts] = useState<BuilderParts>(EMPTY_PARTS);
  const [budget, setBudget] = useState('');
  const [assembly, setAssembly] = useState(false);
  const [result, setResult] = useState<BuilderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [psuAckKey, setPsuAckKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ code: string; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  // optional: /builder?build=CODE opens a saved build as a new, editable build (US-13.2)
  const fromCode = params.get('build');
  useEffect(() => {
    if (!fromCode) return;
    api
      .getBuild(fromCode)
      .then((b) => {
        const next: BuilderParts = { ...EMPTY_PARTS };
        for (const it of b.items) {
          const cat = it.category.toLowerCase() as BuilderCat;
          if (cat in next) next[cat] = it.sku;
        }
        setParts(next);
        setAssembly(!!b.assembly);
        if (b.budget) setBudget(String(b.budget / 100));
      })
      .catch((e) => setError(errorText(e)));
  }, [fromCode]);

  const input: BuilderInput = useMemo(() => {
    const b = budgetSatang(budget);
    return b !== undefined ? { parts, budget: b, assembly } : { parts, assembly };
  }, [parts, budget, assembly]);

  // evaluate after every change; drop out-of-order responses
  useEffect(() => {
    const id = ++seq.current;
    api
      .evaluate(input)
      .then((r) => {
        if (id !== seq.current) return;
        setResult(r);
        setError(null);
      })
      .catch((e) => {
        if (id !== seq.current) return;
        setError(errorText(e));
      });
  }, [input]);

  const byCat = useMemo(() => {
    const m: Record<BuilderCat, Product[]> = { cpu: [], mb: [], ram: [], gpu: [], ssd: [], psu: [], case: [] };
    for (const p of products ?? []) {
      const c = p.category.toLowerCase() as BuilderCat;
      if (p.inBuilder && c in m) m[c].push(p);
    }
    return m;
  }, [products]);
  const bySku = useMemo(() => new Map((products ?? []).map((p) => [p.sku, p])), [products]);

  const choose = (cat: BuilderCat, sku: string | null) => {
    setParts((prev) => ({ ...prev, [cat]: sku }));
    setSaved(null);
  };

  const selected = BUILDER_CATS.filter((c) => parts[c]);
  const conflicts = result?.conflicts ?? [];
  const conflictCats = new Set(conflicts.flatMap((c) => c.categories.map((x) => x.toLowerCase())));
  const psuWarning = result?.warnings?.find((w) => w.code === 'PSU_LOW') ?? null;
  const otherWarnings = (result?.warnings ?? []).filter((w) => w.code !== 'PSU_LOW');
  const psuKey = `${parts.gpu}|${parts.psu}|${psuWarning?.message ?? ''}`;
  const psuAcked = psuWarning && psuAckKey === psuKey;
  const suggest = psuWarning?.suggestSku ? bySku.get(psuWarning.suggestSku) : undefined;
  const canAdd = !!result?.canAddToCart && selected.length > 0;
  const over = !!result && (result.overBudget || (result.remaining !== null && result.remaining < 0));
  const budgetVal = budgetSatang(budget);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveBuild(input);
      setSaved({ code: r.code, url: `${window.location.origin}/b/${r.code}` });
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const addAll = () => {
    const capped: string[] = [];
    setCart((c) => {
      const items = c.items.map((i) => ({ ...i }));
      for (const cat of selected) {
        const sku = parts[cat]!;
        // FR-16: every piece goes in — a SKU already in the cart gets +1, but never past stock or the per-buyer limit (BR-31 · C5)
        const max = maxQty(bySku.get(sku));
        const line = items.find((i) => i.sku === sku);
        if (line) {
          if (line.qty + 1 > max) capped.push(sku);
          else line.qty += 1;
        } else items.push({ sku, qty: 1 });
      }
      return { ...c, items, assembly, fromBuilder: true };
    });
    navigate('/cart', { state: capped.length ? { capped } : undefined });
  };

  return (
    <div className="wrap page stack-lg">
      <div className="stack-xs">
        <span className="mono eyebrow">จัดสเปกเอง · 7 หมวด · หมวดละ 1 ชิ้น</span>
        <h1 className="h1">จัดสเปกคอม</h1>
        <p className="muted-2">
          เลือกทีละหมวด เว็บเช็ก socket แรม ขนาดเคส และพาวเวอร์ให้ทันที · ชิ้นที่ใส่ด้วยกันไม่ได้จะเลือกไม่ได้ · ราคารวม VAT แล้ว
        </p>
      </div>
      <ErrorMessage>{error ?? productsError}</ErrorMessage>

      <div className="builder">
        <section className="builder-parts stack" aria-label="เลือกทีละหมวด">
          <h2 className="h3">เลือกทีละหมวด</h2>
          {!products && !productsError && <Loading />}
          {BUILDER_CATS.map((cat) => {
            const list = byCat[cat];
            const opts = new Map((result?.options?.[cat] ?? []).map((o) => [o.sku, o]));
            const blocked = list.filter((p) => opts.get(p.sku)?.allowed === false);
            const cur = parts[cat] ? bySku.get(parts[cat]!) : undefined;
            const inConflict = conflictCats.has(cat) && !!parts[cat];
            const isPsuWarn = cat === 'psu' && !!psuWarning && !!parts.psu;
            const state = inConflict ? 'bad' : isPsuWarn ? 'warn' : parts[cat] ? 'ok' : 'empty';
            return (
              <div key={cat} className={`part-row ${state}`}>
                <div className="part-head">
                  <label htmlFor={`sel-${cat}`} className="part-label">
                    {BUILDER_LABEL[cat]}
                  </label>
                  <span className="mono strong">{cur ? thb(cur.currentPrice) : ''}</span>
                </div>
                <select
                  id={`sel-${cat}`}
                  data-testid={`builder-select-${cat}`}
                  value={parts[cat] ?? ''}
                  onChange={(e) => choose(cat, e.target.value || null)}
                >
                  <option value="">— ยังไม่ได้เลือก{BUILDER_LABEL[cat]} —</option>
                  {list.map((p) => {
                    const o = opts.get(p.sku);
                    const no = o?.allowed === false;
                    return (
                      <option key={p.sku} value={p.sku} disabled={no}>
                        {`${p.name} · ${thb(p.currentPrice)}${p.available <= 0 ? ' · สินค้าหมด' : ''}${no ? ` — ใส่ไม่ได้: ${o?.reason ?? ''}` : ''}`}
                      </option>
                    );
                  })}
                </select>
                {cur && <span className="small muted mono">{[cur.sku, specLine(cur)].filter(Boolean).join(' · ')}</span>}
                {inConflict && (
                  <span className="small bad-text">
                    ชิ้นที่เลือกไว้ใช้ด้วยกันไม่ได้แล้ว: {conflicts.filter((c) => c.categories.map((x) => x.toLowerCase()).includes(cat)).map((c) => c.message).join(' · ')}
                  </span>
                )}
                {blocked.length > 0 && (
                  <ul className="reasons" data-testid={`builder-reason-${cat}`}>
                    {blocked.map((p) => (
                      <li key={p.sku}>
                        <span className="strike-soft">{p.name}</span> — ใส่ไม่ได้: {opts.get(p.sku)?.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>

        <aside className="builder-summary card stack" aria-label="สรุปสเปก">
          <h2 className="h3">สรุปสเปก</h2>
          <div className="row-between">
            <span>ราคารวม ({selected.length} ชิ้น)</span>
            <span className="mono big strong" data-testid="builder-total">
              {result ? thb(result.total) : '–'}
            </span>
          </div>
          <div className="field">
            <label htmlFor="builder-budget">งบที่ตั้งไว้ (บาท)</label>
            <input
              id="builder-budget"
              data-testid="builder-budget"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="เช่น 35000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              aria-invalid={!!budgetProblem(budget)}
              aria-describedby="builder-budget-error"
            />
            {budgetProblem(budget) && (
              <span id="builder-budget-error" className="small bad-text" data-testid="builder-budget-error" role="alert">
                {budgetProblem(budget)}
              </span>
            )}
          </div>
          {budgetVal !== undefined && result && (
            <div className="budget-bar" aria-hidden="true">
              <div className={over ? 'over' : ''} style={{ width: `${Math.min(100, (result.total / budgetVal) * 100)}%` }} />
            </div>
          )}
          <div data-testid="builder-remaining" className={`strong ${over ? 'bad-text' : result?.remaining !== null && result?.remaining !== undefined ? 'good-text' : 'muted'}`}>
            {!result || result.remaining === null || result.remaining === undefined
              ? 'ยังไม่ได้ตั้งงบ'
              : over
                ? `เกินงบ ${thb(Math.abs(result.remaining))}`
                : `เหลืองบ ${thb(result.remaining)}`}
          </div>
          <p className="small muted">งบเทียบกับราคาสินค้าตอนนี้ (รวม flash sale) ก่อนส่วนลดอื่น ไม่รวมค่าประกอบ</p>

          {psuWarning && !psuAcked && (
            <div className="alert alert-warn stack-xs" data-testid="builder-warning-psu" role="status">
              <strong>⚠ {psuWarning.message}</strong>
              <span className="small">เตือนเท่านั้น ไม่ห้ามสั่ง · ของในสเปกยังอยู่ครบ</span>
              <div className="row-wrap">
                {psuWarning.suggestSku && (
                  <button type="button" className="btn btn-warn btn-sm" data-testid="psu-upgrade" onClick={() => choose('psu', psuWarning.suggestSku!)}>
                    เปลี่ยนเป็น {suggest?.specs?.psuOutputW ? `${suggest.specs.psuOutputW}W` : suggest?.name ?? psuWarning.suggestSku}
                    {suggest && parts.psu && bySku.get(parts.psu)
                      ? ` (+${thb(suggest.currentPrice - bySku.get(parts.psu)!.currentPrice)})`
                      : ''}
                  </button>
                )}
                <button type="button" className="btn btn-outline-warn btn-sm" data-testid="psu-keep" onClick={() => setPsuAckKey(psuKey)}>
                  ใช้ตัวเดิม (รับทราบแล้ว)
                </button>
              </div>
            </div>
          )}
          {psuWarning && psuAcked && (
            <div className="alert alert-warn small" role="status" data-testid="builder-warning-psu-kept">
              ⚠ ใช้พาวเวอร์ตัวเดิม (รับทราบแล้ว · ยังเตือนอยู่): {psuWarning.message}
            </div>
          )}
          {otherWarnings.map((w, i) => (
            <div key={i} className="alert alert-warn small">
              ⚠ {w.message}
            </div>
          ))}

          {conflicts.length > 0 ? (
            <div className="alert alert-error-soft stack-xs" data-testid="builder-conflict" role="status">
              <strong>ชิ้นที่เลือกไว้ใส่ด้วยกันไม่ได้ · แก้ก่อนใส่ตะกร้า</strong>
              <ul>
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {c.categories.map(builderLabel).join(' + ')}: {c.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            selected.length > 1 && <div className="alert alert-ok small">✓ เข้ากันได้ทุกชิ้นที่เลือก</div>
          )}

          <div className="divider-top stack-xs">
            <label className="check">
              <input type="checkbox" data-testid="builder-assembly" checked={assembly} onChange={(e) => setAssembly(e.target.checked)} />
              ให้ร้านประกอบ
            </label>
            <div className="row-between">
              <span>ค่าประกอบ</span>
              <span className="mono" data-testid="builder-assembly-fee">
                {result ? thb(result.assemblyFee) : '–'}
              </span>
            </div>
            <span className="small muted" data-testid="builder-missing">
              {result && result.missingCategories.length > 0
                ? `เลือกครบ 7 หมวดจะประกอบให้ฟรี (ยังขาด ${result.missingCategories.map(builderLabel).join(' ')})`
                : result
                  ? 'ครบ 7 หมวดแล้ว ประกอบให้ฟรี'
                  : ''}
            </span>
          </div>

          <div className="row-wrap">
            <button type="button" className="btn btn-outline grow" data-testid="builder-save" onClick={save} disabled={saving || selected.length === 0}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกสเปก + แชร์ลิงก์'}
            </button>
            <button type="button" className="btn btn-red grow" data-testid="builder-add-all" disabled={!canAdd} onClick={addAll}>
              ใส่ตะกร้าทั้งชุด
            </button>
          </div>
          {!canAdd && conflicts.length > 0 && <p className="small bad-text">แก้ชิ้นที่ใส่ด้วยกันไม่ได้ก่อน จึงจะใส่ตะกร้าได้</p>}
          {saved && (
            <div className="card-sub stack-xs" role="status">
              <span className="small">บันทึกแล้ว ส่งลิงก์นี้ให้คนอื่นดูได้ (เปิดได้โดยไม่ต้องล็อกอิน)</span>
              <a href={saved.url} data-testid="builder-share-link" className="mono break">
                {saved.url}
              </a>
              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(saved.url).then(() => setCopied(true), () => setCopied(false));
                  }}
                >
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                </button>
                <Link to={`/b/${saved.code}`} className="btn btn-sm btn-ghost">
                  เปิดดู
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
