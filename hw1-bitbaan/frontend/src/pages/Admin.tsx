import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText, isApiError } from '../api';
import { ErrorMessage, Loading, useTitle } from '../components/common';
import { baht, dateTimeTH, mmss, statusLabel, STATUS_LABEL, thb } from '../format';
import { useServerNow } from '../state';
import type { Order, OrderStatus, StockRow } from '../types';

const NEXT: Partial<Record<OrderStatus, 'PACKED' | 'SHIPPED' | 'DELIVERED'>> = {
  PAID: 'PACKED',
  PACKED: 'SHIPPED',
  SHIPPED: 'DELIVERED',
};

export function Admin() {
  useTitle('หลังร้าน');
  const now = useServerNow(1000);
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const handle = (e: unknown) => {
    if (isApiError(e, 'FORBIDDEN') || isApiError(e, 'LOGIN_REQUIRED') || (isApiError(e) && (e.status === 403 || e.status === 401))) {
      setForbidden(true);
      setError(`ไม่มีสิทธิ์ · ${errorText(e)}`);
    } else setError(errorText(e));
  };

  const loadStock = useCallback(async () => {
    try {
      setStock(await api.adminStock());
    } catch (e) {
      handle(e);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await api.adminOrders(status || undefined, date || undefined));
    } catch (e) {
      handle(e);
    }
  }, [status, date]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);
  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      handle(e);
    } finally {
      setBusy(null);
    }
  };

  const storeSale = (sku: string) =>
    run(`sale-${sku}`, async () => {
      const r = await api.storeSale(sku, 1);
      setStock((rows) => rows?.map((x) => (x.sku === sku ? { ...x, available: r.available } : x)) ?? rows);
      await loadStock();
    });

  const advance = (o: Order) => {
    const next = NEXT[o.status];
    if (!next) return;
    void run(`status-${o.orderNo}`, async () => {
      await api.setStatus(o.orderNo, next);
      await loadOrders();
    });
  };

  const refundDone = (id: string | number) =>
    run(`refund-${id}`, async () => {
      await api.refundDone(id);
      await loadOrders();
    });

  if (forbidden) {
    return (
      <div className="wrap page stack narrow">
        <h1 className="h1">หลังร้าน</h1>
        <ErrorMessage>{error ?? 'ไม่มีสิทธิ์'}</ErrorMessage>
        <p>
          หน้านี้สำหรับพนักงานเท่านั้น · <Link to="/login">เข้าสู่ระบบด้วยบัญชีพนักงาน</Link>
        </p>
      </div>
    );
  }

  const pending = (orders ?? []).filter((o) => o.status === 'PENDING');
  const toPack = (orders ?? []).filter((o) => o.status === 'PAID');
  const refunds = (orders ?? []).flatMap((o) => (o.refunds ?? []).map((r) => ({ ...r, orderNo: o.orderNo })));

  return (
    <div className="wrap-wide page stack-lg">
      <div className="row-between wrap-gap">
        <h1 className="h1">หลังร้าน</h1>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => {
            void loadStock();
            void loadOrders();
          }}
        >
          โหลดใหม่
        </button>
      </div>
      <ErrorMessage>{error}</ErrorMessage>

      <div className="grid-facts">
        <div className="fact">
          <span className="small muted">กำลังกันของ (รอชำระ)</span>
          <span className="mono stat">{orders ? pending.length : '–'}</span>
        </div>
        <div className="fact">
          <span className="small muted">รอแพ็กของ</span>
          <span className="mono stat">{orders ? toPack.length : '–'}</span>
        </div>
        <div className="fact">
          <span className="small muted">เงินคืนรอโอน</span>
          <span className="mono stat">{refunds.filter((r) => r.status === 'PENDING').length}</span>
        </div>
      </div>

      <section className="card no-pad">
        <div className="card-head row-between wrap-gap">
          <h2 className="h3">สต็อก</h2>
          <span className="small muted">พร้อมขาย = ในคลัง − กันไว้ · เว็บแสดงเฉพาะพร้อมขาย</span>
        </div>
        {!stock ? (
          <div className="pad">
            <Loading />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>สินค้า</th>
                  <th className="num">ในคลัง</th>
                  <th className="num">กันไว้</th>
                  <th className="num">พร้อมขาย</th>
                  <th className="num">หน้าร้าน</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r) => (
                  <tr key={r.sku} data-testid={`admin-stock-${r.sku}`}>
                    <td className="mono small">{r.sku}</td>
                    <td>
                      <span className="row-wrap-tight">
                        {r.name}
                        {r.redTag && <span className="badge-red static sm">ป้ายแดง</span>}
                        {r.perBuyerLimit && <span className="tag-outline-dark sm">คนละ {r.perBuyerLimit}</span>}
                      </span>
                    </td>
                    <td className="num mono">{r.onHand}</td>
                    <td className="num mono">{r.held}</td>
                    <td className={`num mono strong ${r.available <= 0 ? 'bad-text' : ''}`} data-testid={`admin-available-${r.sku}`}>
                      {r.available}
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        data-testid={`admin-store-sale-${r.sku}`}
                        aria-label={`ขายหน้าร้าน −1 ${r.sku}`}
                        disabled={busy === `sale-${r.sku}`}
                        onClick={() => storeSale(r.sku)}
                      >
                        ขายหน้าร้าน −1
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card no-pad">
        <div className="card-head row-between wrap-gap">
          <h2 className="h3">ออเดอร์</h2>
          <div className="row-wrap align-center">
            <label htmlFor="admin-filter-status" className="small">
              สถานะ
            </label>
            <select id="admin-filter-status" data-testid="admin-filter-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <label htmlFor="admin-filter-date" className="small">
              วันที่
            </label>
            <input id="admin-filter-date" data-testid="admin-filter-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {!orders ? (
          <div className="pad">
            <Loading />
          </div>
        ) : orders.length === 0 ? (
          <p className="pad muted">ไม่มีออเดอร์ตามตัวกรอง</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ลูกค้า</th>
                  <th>สินค้า</th>
                  <th>สถานะ</th>
                  <th className="num">ยอด</th>
                  <th className="num">ขั้นถัดไป</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const next = NEXT[o.status];
                  const hold = o.status === 'PENDING' && o.holdUntil ? (Date.parse(o.holdUntil) - now) / 1000 : null;
                  return (
                    <tr key={o.orderNo} data-testid={`admin-order-${o.orderNo}`}>
                      <td>
                        <span className="mono strong">{o.orderNo}</span>
                        <div className="small muted">{dateTimeTH(o.placedAt)}</div>
                      </td>
                      <td className="small">
                        {o.buyer?.name ?? '–'}
                        <div className="muted">{o.buyer?.code ?? 'Guest'}</div>
                      </td>
                      <td className="small">
                        {o.quote?.lines?.map((l) => `${l.sku} ×${l.qty}`).join(', ')}
                        <div className="muted">{o.shipping === 'pickup' ? 'รับที่ร้าน' : o.shipping === 'express' ? 'ส่งด่วน' : 'ส่งปกติ'}</div>
                      </td>
                      <td>
                        <span className="status-pill" data-status={o.status}>
                          {statusLabel(o.status)}
                        </span>
                        {hold !== null && <div className="small warn-text mono">เหลือ {mmss(Math.max(0, hold))}</div>}
                      </td>
                      <td className="num mono">{o.quote ? baht(o.quote.total) : '–'}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn btn-dark btn-sm"
                          data-testid={`admin-status-${o.orderNo}`}
                          disabled={!next || busy === `status-${o.orderNo}`}
                          onClick={() => advance(o)}
                        >
                          {next ? `เปลี่ยนเป็น ${statusLabel(next)}` : 'ไม่มีขั้นถัดไป'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card no-pad">
        <div className="card-head">
          <h2 className="h3">เงินคืน</h2>
        </div>
        {refunds.length === 0 ? (
          <p className="pad muted">ยังไม่มีรายการเงินคืน (ตามตัวกรองออเดอร์ด้านบน)</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ออเดอร์</th>
                  <th>ประเภท</th>
                  <th className="num">เงินคืน</th>
                  <th className="num">ค่าธรรมเนียม</th>
                  <th>สถานะ</th>
                  <th className="num"></th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={String(r.id)} data-testid={`admin-refund-${r.id}`}>
                    <td className="mono">{r.orderNo}</td>
                    <td>{r.kind === 'CANCEL' ? 'ยกเลิก' : 'คืนของ'}</td>
                    <td className="num mono">{thb(r.amount)}</td>
                    <td className="num mono">{thb(r.fee ?? 0)}</td>
                    <td className={r.status === 'DONE' ? 'good-text' : 'warn-text'}>
                      {r.status === 'DONE' ? `โอนคืนแล้ว ${dateTimeTH(r.refundedAt)}` : 'รอโอนคืน'}
                    </td>
                    <td className="num">
                      {r.status !== 'DONE' && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          data-testid={`admin-refund-done-${r.id}`}
                          disabled={busy === `refund-${r.id}`}
                          onClick={() => refundDone(r.id)}
                        >
                          โอนคืนแล้ว
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
