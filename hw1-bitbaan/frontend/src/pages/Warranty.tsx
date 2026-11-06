import { Link, useSearchParams } from 'react-router-dom';
import { useTitle } from '../components/common';

/** FR-49: warranty claims are separate from returns (INTERVIEW.md: "ของเสียจากโรงงาน เคลมตามประกัน ไม่เกี่ยวกับการคืนของ"). */
export function Warranty() {
  useTitle('เคลมประกัน');
  const [params] = useSearchParams();
  const orderNo = params.get('order');
  return (
    <div className="wrap page stack narrow" data-testid="warranty-page">
      <h1 className="h1">เคลมประกัน · ของเสียจากโรงงาน</h1>
      <div className="card stack-xs">
        <p>ของเสียจากโรงงานเคลมตามประกันของผู้ผลิต แยกจากการคืนของ 7 วัน และไม่หักค่าธรรมเนียม</p>
        <ul>
          <li>นำสินค้าพร้อมเลขออเดอร์มาที่ร้าน ชั้น 4 ห้างไอที ปิ่นเกล้า</li>
          <li>ระยะประกันเป็นไปตามผู้ผลิตของสินค้าแต่ละชิ้น</li>
        </ul>
        {orderNo && (
          <p className="small">
            เลขออเดอร์ของคุณ <span className="mono strong" data-testid="warranty-order">{orderNo}</span>
          </p>
        )}
      </div>
      {orderNo && (
        <Link to={`/orders/${encodeURIComponent(orderNo)}`} className="btn btn-outline self-start">
          กลับไปหน้าออเดอร์
        </Link>
      )}
    </div>
  );
}
