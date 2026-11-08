import { useState } from 'react';
import { PROVINCES } from '../format';
import type { Shipping } from '../types';

export interface ShippingValue {
  shipping: Shipping;
  province: string;
  line: string;
}

/** Shipping radios + address (cart page and quotation page). */
export function ShippingForm({
  value,
  onChange,
  currentFee,
}: {
  value: ShippingValue;
  onChange: (v: ShippingValue) => void;
  /** formatted fee of the selected option from the latest quote, e.g. "0.00" */
  currentFee?: string;
}) {
  const set = (patch: Partial<ShippingValue>) => onChange({ ...value, ...patch });
  const opts: { id: Shipping; name: string; desc: string; fee: string }[] = [
    { id: 'standard', name: 'ส่งปกติ', desc: '฿60 · ฟรีเมื่อยอดสินค้าหลังส่วนลดครบ ฿3,000', fee: '฿60' },
    { id: 'express', name: 'ส่งด่วนในกรุงเทพฯ', desc: '฿150 · เฉพาะกรุงเทพมหานคร · ไม่มีส่งฟรี', fee: '฿150' },
    { id: 'pickup', name: 'รับที่ร้าน', desc: 'ฟรี · ชั้น 4 ห้างไอที ปิ่นเกล้า · เปิด 10:00–21:00 ทุกวัน', fee: 'ฟรี' },
  ];
  const expressBad = value.shipping === 'express' && value.province !== 'กรุงเทพมหานคร';
  const [switched, setSwitched] = useState(false);

  return (
    <div className="stack">
      <fieldset className="radio-group">
        <legend className="h3">วิธีรับสินค้า</legend>
        {opts.map((o) => (
          <label key={o.id} className={`radio-card ${value.shipping === o.id ? 'on' : ''}`}>
            <input
              type="radio"
              name="shipping"
              value={o.id}
              data-testid={`shipping-${o.id}`}
              checked={value.shipping === o.id}
              onChange={() => set({ shipping: o.id })}
            />
            <span className="radio-card-body">
              <span className="strong">{o.name}</span>
              <span className="small muted">{o.desc}</span>
            </span>
            <span className="mono strong">{value.shipping === o.id && currentFee !== undefined ? currentFee : o.fee}</span>
          </label>
        ))}
      </fieldset>

      {value.shipping === 'pickup' ? (
        <p className="note">รับที่ร้าน ชั้น 4 ห้างไอที ปิ่นเกล้า · ร้านเปิด 10:00–21:00 ทุกวัน · นำเลขออเดอร์มาแสดงที่หน้าร้าน</p>
      ) : (
        <div className="stack-sm">
          <h3 className="h3">ที่อยู่จัดส่ง</h3>
          <div className="field">
            <label htmlFor="address-line">ที่อยู่ (บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ รหัสไปรษณีย์)</label>
            <input
              id="address-line"
              data-testid="address-line"
              type="text"
              autoComplete="street-address"
              value={value.line}
              onChange={(e) => set({ line: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="address-province">จังหวัด</label>
            <select
              id="address-province"
              data-testid="address-province"
              value={value.province}
              onChange={(e) => {
                const province = e.target.value;
                // FR-32 · C4 exploration: express is Bangkok only — switch to standard instead of keeping ฿150 in the total
                if (value.shipping === 'express' && province && province !== 'กรุงเทพมหานคร') {
                  set({ province, shipping: 'standard' });
                  setSwitched(true);
                } else {
                  set({ province });
                  setSwitched(false);
                }
              }}
            >
              <option value="">— เลือกจังหวัด —</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {expressBad && <p className="note warn">ส่งด่วนได้เฉพาะที่อยู่ในกรุงเทพมหานคร</p>}
          {switched && (
            <p className="note warn" role="status" data-testid="shipping-switched">
              เปลี่ยนเป็นส่งปกติแล้ว เพราะส่งด่วนได้เฉพาะกรุงเทพมหานคร
            </p>
          )}
          <p className="small muted">1 ออเดอร์ส่งได้ 1 ที่อยู่ ถ้าต้องส่งหลายที่ให้แยกออเดอร์</p>
        </div>
      )}
    </div>
  );
}
