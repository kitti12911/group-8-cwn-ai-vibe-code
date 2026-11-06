package pricing_test

// TC ที่เพิ่มหลัง mutation testing รอบที่ 1 (MUTATION-REPORT.md ข้อ 4)
// ทุกข้อในไฟล์นี้มาจาก mutant ที่รอด ไม่ใช่เขียนเผื่อไว้ลอย ๆ

import (
	"testing"
	"time"

	. "bitbaan/backend/internal/pricing"
)

// สินค้าสมมติสำหรับทดสอบค่าขอบที่ราคาสินค้าจริงไปไม่ถึง (TEST-DATA.md ข้อ 7)
func synth(price int64, redTag bool) Product {
	return Product{SKU: "SYNTH", Name: "สินค้าทดสอบ", Category: "SSD", Price: price, RedTag: redTag}
}

func quoteOf(price int64, shipping string) Quote {
	return Compute(Input{
		Lines:    []Line{{Product: synth(price, false), Qty: 1}},
		Tier:     TierNone,
		Shipping: shipping,
		Now:      thu1000,
	})
}

// TC-SHIP-01 ค่าขอบ ฿3,000 · ฆ่า mutant S1 (`>=` → `>` และ 3000 → 3001)
// ราคาสินค้าจริงไปไม่ถึง G4 = 3,000 พอดี จึงต้องทดสอบที่ชั้นนี้ (E67–E68)
func TestShippingFreeBoundary(t *testing.T) {
	for _, c := range []struct {
		g4   int64
		want int64
	}{{2999, 60}, {3000, 0}, {3001, 0}} {
		q := quoteOf(c.g4, "standard")
		if q.G4 != c.g4 {
			t.Fatalf("G4 = %d ต้องเป็น %d", q.G4, c.g4)
		}
		if q.ShippingFee != c.want {
			t.Errorf("G4 %d: ค่าส่ง = %d ต้องเป็น %d", c.g4, q.ShippingFee, c.want)
		}
	}
}

// ฆ่า mutant S4 — `Reship` ไม่เคยถูกเรียกใน unit test เดิมเลย ทั้งที่ออเดอร์จากใบเสนอราคาใช้ทางนี้ (FR-52)
func TestReshipRecomputesFeeTotalAndVAT(t *testing.T) {
	for _, c := range []struct {
		shipping string
		g4       int64
		wantFee  int64
	}{
		{"standard", 2999, 60},
		{"standard", 3000, 0},
		{"express", 100000, 150},
		{"pickup", 1, 0},
	} {
		q := quoteOf(c.g4, "pickup")
		Reship(&q, c.shipping)
		if q.ShippingFee != c.wantFee {
			t.Errorf("%s G4 %d: ค่าส่ง = %d ต้องเป็น %d", c.shipping, c.g4, q.ShippingFee, c.wantFee)
		}
		if want := c.g4 + c.wantFee; q.Total != want {
			t.Errorf("%s G4 %d: ยอดชำระ = %d ต้องเป็น %d", c.shipping, c.g4, q.Total, want)
		}
		if q.VATSatang != VATSatang(q.Total) || q.PreVATSatang+q.VATSatang != q.Total*100 {
			t.Errorf("%s G4 %d: VAT ไม่ถูกคิดใหม่หลังเปลี่ยนวิธีส่ง", c.shipping, c.g4)
		}
	}
}

// ฆ่า mutant S2 — ราคาที่ลูกค้าเห็นบนหน้าสินค้าและหน้าจัดสเปก (FR-05 · FR-09) ไม่มี unit test เดิม
func TestUnitPriceFlashSale(t *testing.T) {
	red, plain := synth(4590, true), synth(6290, false)
	for _, c := range []struct {
		name string
		p    Product
		now  time.Time
		want int64
	}{
		{"ป้ายแดง ในช่วง flash sale", red, fri1230, 4131},
		{"ป้ายแดง นอกช่วง", red, fri1000, 4590},
		{"ป้ายแดง วันพฤหัส", red, thu1000, 4590},
		{"ไม่ใช่ป้ายแดง ในช่วง flash sale", plain, fri1230, 6290},
	} {
		if got := UnitPrice(c.p, c.now, 0); got != c.want {
			t.Errorf("%s: ได้ %d ต้องเป็น %d", c.name, got, c.want)
		}
	}
}

// ฆ่า mutant S3 — ราคาสมาชิกบนหน้าสินค้า (FR-59) ไม่มี unit test เดิม
func TestMemberPriceEveryTier(t *testing.T) {
	p := synth(4590, false)
	for _, c := range []struct {
		tier Tier
		want int64
	}{
		{TierNone, 4590},
		{TierGeneral, 4590},
		{TierSilver, 4453},   // 4,590 − 137.70 → ปัดลง 137
		{TierGold, 4361},     // 4,590 − 229.50 → ปัดลง 229
		{TierBusiness, 4223}, // 4,590 − 367.20 → ปัดลง 367
	} {
		if got := MemberPrice(p, thu1000, c.tier, 0); got != c.want {
			t.Errorf("%s: ได้ %d ต้องเป็น %d", c.tier, got, c.want)
		}
	}
}

// ฆ่า mutant S5 — ขอบการปัด VAT · เคสที่ปัดขึ้นกับปัดลงต่างกัน 1 สตางค์
// คุณจอย บ.101 "ฝ่ายบัญชีเคยตีกลับเพราะต่างกัน 1 สตางค์"
func TestVATRoundingHalfUp(t *testing.T) {
	for _, c := range []struct {
		total int64
		want  int64
	}{
		{1, 7},          // ฿0.07
		{95, 621},       // 66,500 ÷ 107 = 621.495 → ปัดลง (ขอบที่ไวที่สุด)
		{3091, 20221},   // ฿202.21 ไม่ใช่ ฿202.22
		{9624, 62961},   // Q03
		{53682, 351191}, // Q11 · คิดทีละบรรทัดจะได้ 351192 ซึ่งผิด
		{72508, 474351}, // Q10
	} {
		if got := VATSatang(c.total); got != c.want {
			t.Errorf("ยอด ฿%d: VAT = %d สตางค์ ต้องเป็น %d", c.total, got, c.want)
		}
	}
}

// ฆ่า mutant ในตัวจัดรูปแบบตัวเลข — ข้อความเหตุผลของคูปองเป็นส่วนหนึ่งของ FR-27
func TestCouponRejectMessageHasGroupedNumber(t *testing.T) {
	q := Compute(Input{
		Lines:      []Line{{Product: synth(1999, false), Qty: 1}},
		Tier:       TierGeneral,
		LoggedIn:   true,
		FirstOrder: true,
		Coupon:     coupons["NEWBIT200"],
		CouponCode: "NEWBIT200",
		Shipping:   "pickup",
		Now:        thu1000,
	})
	if q.Coupon.Status != "REJECTED" {
		t.Fatalf("ยอด 1,999 ต้องใช้โค้ดไม่ได้ ได้ %s", q.Coupon.Status)
	}
	if got := *q.Coupon.Reason; got != "ยอดไม่ถึง ฿2,000" {
		t.Errorf("ข้อความเหตุผล = %q ต้องเป็น %q", got, "ยอดไม่ถึง ฿2,000")
	}
}

// ---- รอบที่ 3 · เพิ่มจาก mutant ที่ยังรอดหลังรอบที่ 2 ----

// ขอบ ฿2,000 ของ NEWBIT200 ครบ 3 ค่า (E43–E45) · ฆ่า mutant S6 (`<` → `<=`)
func TestCouponMinAmountBoundary(t *testing.T) {
	for _, c := range []struct {
		g3     int64
		wantOK bool
	}{{1999, false}, {2000, true}, {2001, true}} {
		q := Compute(Input{
			Lines: []Line{{Product: synth(c.g3, false), Qty: 1}}, Tier: TierGeneral, LoggedIn: true, FirstOrder: true,
			Coupon: coupons["NEWBIT200"], CouponCode: "NEWBIT200", Shipping: "pickup", Now: thu1000,
		})
		if ok := q.Coupon.Status == "APPLIED"; ok != c.wantOK {
			t.Errorf("G3 %d: status = %s ต้องใช้ได้ = %v", c.g3, q.Coupon.Status, c.wantOK)
		}
	}
}

// เพดานคูปองและการตัดไม่ให้เกินยอดสินค้า · ฆ่า mutant S7 (`>` → `>=` ที่เพดานและที่ clamp)
func TestCouponCapAndClamp(t *testing.T) {
	capped := &Coupon{Code: "CAPTEST", Kind: "percent", Value: 50, MaxDiscount: 1000}
	// 50% ของ 2,000 = 1,000 พอดี = เพดานพอดี → ต้องได้ 1,000 ไม่ใช่ถูกตัด
	q := Compute(Input{Lines: []Line{{Product: synth(2000, false), Qty: 1}}, Tier: TierGeneral, LoggedIn: true,
		Coupon: capped, CouponCode: "CAPTEST", Shipping: "pickup", Now: thu1000})
	if q.Coupon.Amount != 1000 {
		t.Errorf("ชนเพดานพอดี: ส่วนลด = %d ต้องเป็น 1000", q.Coupon.Amount)
	}
	// 50% ของ 4,000 = 2,000 เกินเพดาน → ตัดเหลือ 1,000
	q = Compute(Input{Lines: []Line{{Product: synth(4000, false), Qty: 1}}, Tier: TierGeneral, LoggedIn: true,
		Coupon: capped, CouponCode: "CAPTEST", Shipping: "pickup", Now: thu1000})
	if q.Coupon.Amount != 1000 {
		t.Errorf("เกินเพดาน: ส่วนลด = %d ต้องถูกตัดเหลือ 1000", q.Coupon.Amount)
	}
	// ส่วนลดแบบจำนวนเงินห้ามเกินยอดสินค้า — ยอดชำระห้ามติดลบ
	big := &Coupon{Code: "BIGTEST", Kind: "fixed", Value: 500}
	q = Compute(Input{Lines: []Line{{Product: synth(100, false), Qty: 1}}, Tier: TierGeneral, LoggedIn: true,
		Coupon: big, CouponCode: "BIGTEST", Shipping: "pickup", Now: thu1000})
	if q.Coupon.Amount != 100 || q.Total != 0 {
		t.Errorf("ส่วนลด %d ยอด %d — ส่วนลดต้องไม่เกินยอดสินค้า และยอดชำระต้องไม่ติดลบ", q.Coupon.Amount, q.Total)
	}
}

// คูปองเปอร์เซ็นต์แบบไม่จำกัดหมวด (สาขาที่คูปองของร้านตอนนี้ยังไปไม่ถึง) · ฆ่า mutant S8
func TestPercentCouponWithoutCategories(t *testing.T) {
	c := &Coupon{Code: "ALL10", Kind: "percent", Value: 10}
	q := Compute(Input{Lines: []Line{{Product: synth(1234, false), Qty: 1}}, Tier: TierGeneral, LoggedIn: true,
		Coupon: c, CouponCode: "ALL10", Shipping: "pickup", Now: thu1000})
	if q.Coupon.Amount != 123 { // 10% ของ 1,234 = 123.4 → ปัดลง
		t.Errorf("ส่วนลด = %d ต้องเป็น 123 (ปัดลง)", q.Coupon.Amount)
	}
	if q.Total != 1111 {
		t.Errorf("ยอดชำระ = %d ต้องเป็น 1111", q.Total)
	}
}

// คูปองจำกัดหมวด แต่ตะกร้าไม่มีหมวดนั้นเลย · ฆ่า mutant S9 (`base == 0`)
func TestCategoryCouponWithNoEligibleItem(t *testing.T) {
	q := Compute(Input{Lines: []Line{{Product: synth(5000, false), Qty: 1}}, Tier: TierGeneral, LoggedIn: true,
		Coupon: coupons["GAMER5"], CouponCode: "GAMER5", Shipping: "pickup", Now: thu1000})
	if q.Coupon.Status != "REJECTED" || *q.Coupon.Reason != "โค้ดนี้ใช้ได้เฉพาะการ์ดจอและจอ" {
		t.Errorf("status = %s reason = %v", q.Coupon.Status, q.Coupon.Reason)
	}
}

// ราคาป้ายรวมต้องคูณจำนวน และยอดชำระต้องรวมค่าประกอบกับค่าส่งครบทั้งสองก้อน · ฆ่า mutant S10
func TestListTotalAndTotalComposition(t *testing.T) {
	q := Compute(Input{
		// CPU ฿1,000 × 2 + เมนบอร์ด ฿0 — เป็นสเปกเครื่อง จึงเลือกประกอบได้ (BR-21 · R41) · ชุดประกอบ 1 คู่ −500
		Lines: []Line{
			{Product: Product{SKU: "SYNTH-CPU", Name: "CPU ทดสอบ", Category: "CPU", Price: 1000}, Qty: 2},
			{Product: Product{SKU: "SYNTH-MB", Name: "บอร์ดทดสอบ", Category: "MB", Price: 0}, Qty: 1},
		},
		Tier:     TierGeneral,
		Shipping: "standard", // G4 = 1,500 < 3,000 → ค่าส่ง 60
		Assembly: true,       // ไม่ครบ 7 หมวด → ค่าประกอบ 500
		Now:      thu1000,
	})
	if q.ListTotal != 2000 {
		t.Errorf("ราคาป้ายรวม = %d ต้องเป็น 2000 (1,000 × 2)", q.ListTotal)
	}
	if q.AssemblyFee != 500 || q.ShippingFee != 60 {
		t.Fatalf("ค่าประกอบ %d ค่าส่ง %d", q.AssemblyFee, q.ShippingFee)
	}
	if q.Total != 2060 {
		t.Errorf("ยอดชำระ = %d ต้องเป็น 2060 (2,000 − 500 + 500 + 60)", q.Total)
	}
}

// ช่วง flash sale ถัดไป (ใช้โดย GET /api/time เพื่อนับถอยหลังหน้าแรก) · ฆ่า mutant S11
func TestFlashWindowNextStart(t *testing.T) {
	endsAt, next := FlashWindow(thu1000) // พฤหัส 12 พ.ย.
	if next.Weekday() != time.Friday {
		t.Errorf("รอบถัดไปต้องเป็นวันศุกร์ ได้ %s", next.Weekday())
	}
	if next.Day() != 13 || next.Hour() != 12 {
		t.Errorf("รอบถัดไป = %s ต้องเป็น ศุกร์ 13 พ.ย. 12:00", next.Format(time.RFC3339))
	}
	if endsAt.Hour() != 13 {
		t.Errorf("สิ้นสุดรอบ = %s ต้องเป็น 13:00", endsAt.Format(time.RFC3339))
	}
	// ศุกร์ 12:30 → รอบถัดไปคือศุกร์หน้า ไม่ใช่วันนี้
	_, nextFromFriday := FlashWindow(fri1230)
	if nextFromFriday.Day() != 20 {
		t.Errorf("จากศุกร์ 13 รอบถัดไปต้องเป็นศุกร์ 20 ได้วันที่ %d", nextFromFriday.Day())
	}
}

// R41 (LAB 9): ชิ้นเดี่ยวที่ไม่ใช่สเปกเครื่อง ส่ง assembly มาก็ไม่คิดค่าประกอบ
func TestAssemblyNeedsPCSpec(t *testing.T) {
	q := Compute(Input{Lines: []Line{{Product: synth(1890, false), Qty: 1}}, Tier: TierGeneral, Shipping: "pickup", Assembly: true, Now: thu1000})
	if q.AssemblyAvailable || q.AssemblyFee != 0 {
		t.Fatalf("RAM ชิ้นเดียว + ประกอบ: available=%v fee=%d ต้องเป็น false / 0", q.AssemblyAvailable, q.AssemblyFee)
	}
}
