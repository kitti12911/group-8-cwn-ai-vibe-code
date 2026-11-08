// Package pricing computes the net price of a cart (REQUIREMENTS.md 2.2–2.4, BR-40).
// It is a pure function: no database, time is a parameter (DESIGN.md T-04).
// Internally everything is whole baht (int64); the API layer converts to satang.
package pricing

import (
	"time"

	"bitbaan/backend/internal/clock"
)

// Builder categories (FR-08). MON is not in the builder.
var BuilderCats = []string{"CPU", "MB", "RAM", "GPU", "SSD", "PSU", "CASE"}

type Product struct {
	SKU      string
	Name     string
	Category string // CPU MB RAM GPU SSD PSU CASE MON
	Price    int64  // list price, baht, VAT included
	RedTag   bool
}

type Line struct {
	Product Product
	Qty     int
}

// Coupon as stored in the shop's data (TEST-DATA.md 3.3).
type Coupon struct {
	Code           string
	Kind           string // fixed | percent
	Value          int64  // baht for fixed, percent for percent
	MinAmount      int64  // baht, compared against G3 (A-12)
	MaxDiscount    int64  // baht, 0 = no cap
	Categories     []string
	FirstOrderOnly bool
	LoginRequired  bool
	ExpiresAt      *time.Time
}

type Tier string

const (
	TierNone     Tier = "" // not logged in
	TierGeneral  Tier = "GENERAL"
	TierSilver   Tier = "SILVER"
	TierGold     Tier = "GOLD"
	TierBusiness Tier = "BUSINESS"
)

// Rate is the member discount percent (BR-01 to BR-03).
func (t Tier) Rate() int64 {
	switch t {
	case TierSilver:
		return 3
	case TierGold:
		return 5
	case TierBusiness:
		return 8
	}
	return 0
}

// TierFor maps 12-month spend to a tier (BR-01, BR-02). Business is decided by the account, not spend.
func TierFor(spend12m int64, business bool) Tier { return TierForMode(spend12m, business, 0) }

// TierForMode is TierFor with the bug switch of the caller (API-CONTRACT 6).
func TierForMode(spend12m int64, business bool, bugMode int) Tier {
	silverMin := int64(20000) // BR-01: "ตั้งแต่ ฿20,000"
	if bugMode == 2 {
		silverMin = 20001 // BUG_MODE=2: see BUGS2.md #1
	}
	switch {
	case business:
		return TierBusiness
	case spend12m >= 100000:
		return TierGold
	case spend12m >= silverMin:
		return TierSilver
	}
	return TierGeneral
}

type Input struct {
	Lines      []Line
	Tier       Tier
	LoggedIn   bool
	FirstOrder bool    // account has no paid, non-cancelled order (BR-16)
	Coupon     *Coupon // nil = no code entered
	CouponCode string  // what the customer typed (may be unknown)
	Shipping   string  // standard | express | pickup
	Assembly   bool
	Now        time.Time
	BugMode    int
	// FirstCouponHeld: the account's first-order coupon is already held by a PENDING order (BR-17)
	FirstCouponHeld bool
}

type QuoteLine struct {
	SKU            string `json:"sku"`
	Name           string `json:"name"`
	Category       string `json:"category"`
	Qty            int    `json:"qty"`
	UnitPrice      int64  `json:"unitPrice"`
	UnitFlashPrice *int64 `json:"unitFlashPrice"`
	Amount         int64  `json:"amount"`
}

type CouponResult struct {
	Code   *string `json:"code"`
	Status string  `json:"status"` // APPLIED | REJECTED | NONE
	Reason *string `json:"reason"`
	Amount int64   `json:"amount"`
}

// Quote is in baht. The API converts every money field to satang.
type Quote struct {
	PricedAt       time.Time
	Lines          []QuoteLine
	ListTotal      int64
	FlashDiscount  int64
	G1             int64
	Bundles        int64
	BundleDiscount int64
	G2             int64
	Tier           Tier
	MemberRate     int64
	MemberDiscount int64
	G3             int64
	Coupon         CouponResult
	G4             int64
	AssemblyFee    int64
	ShippingFee    int64
	Total          int64
	VATSatang      int64
	PreVATSatang   int64
}

// FlashActive: every Friday 12:00:00 to before 13:00:00 (BR-06, BR-07, A-16).
func FlashActive(t time.Time, bugMode int) bool {
	t = t.In(clock.TZ)
	if t.Weekday() != time.Friday {
		return false
	}
	start := time.Date(t.Year(), t.Month(), t.Day(), 12, 0, 0, 0, clock.TZ)
	end := start.Add(time.Hour)
	if bugMode == 1 {
		return !t.Before(start) && !t.After(end) // BUG_MODE=1: see BUGS.md #1
	}
	return !t.Before(start) && t.Before(end)
}

// FlashEnds returns the end of the current flash window, and the next start after t.
func FlashWindow(t time.Time) (endsAt time.Time, nextStart time.Time) {
	t = t.In(clock.TZ)
	day := time.Date(t.Year(), t.Month(), t.Day(), 12, 0, 0, 0, clock.TZ)
	endsAt = day.Add(time.Hour)
	for i := 0; i < 8; i++ {
		s := day.AddDate(0, 0, i)
		if s.Weekday() == time.Friday && s.After(t) {
			return endsAt, s
		}
	}
	return endsAt, day.AddDate(0, 0, 7)
}

// UnitPrice is the shelf price right now (BR-08): red-tag items lose floor(10%) during flash.
func UnitPrice(p Product, now time.Time, bugMode int) int64 {
	if p.RedTag && FlashActive(now, bugMode) {
		return p.Price - p.Price/10
	}
	return p.Price
}

// MemberPrice is UnitPrice after the member discount only (FR-59).
func MemberPrice(p Product, now time.Time, t Tier, bugMode int) int64 {
	u := UnitPrice(p, now, bugMode)
	return u - u*t.Rate()/100
}

func str(s string) *string { return &s }

// Compute runs G1 → G4 → assembly → shipping → VAT (A-10, A-11, BR-40).
func Compute(in Input) Quote {
	q := Quote{PricedAt: in.Now, Tier: in.Tier}
	flash := FlashActive(in.Now, in.BugMode)
	var cpu, mb int64
	eligible := map[string]int64{} // coupon category -> amount after flash
	catQty := map[string]int{}
	for _, l := range in.Lines {
		unit := l.Product.Price
		var fp *int64
		if flash && l.Product.RedTag {
			u := unit - unit/10
			fp = &u
			unit = u
		}
		amt := unit * int64(l.Qty)
		q.Lines = append(q.Lines, QuoteLine{SKU: l.Product.SKU, Name: l.Product.Name, Category: l.Product.Category,
			Qty: l.Qty, UnitPrice: l.Product.Price, UnitFlashPrice: fp, Amount: amt})
		q.ListTotal += l.Product.Price * int64(l.Qty)
		q.G1 += amt
		eligible[l.Product.Category] += amt
		if l.Qty > 0 {
			catQty[l.Product.Category] += l.Qty
		}
		switch l.Product.Category {
		case "CPU":
			cpu += int64(l.Qty)
		case "MB":
			mb += int64(l.Qty)
		}
	}
	q.FlashDiscount = q.ListTotal - q.G1

	// G2: bundle ฿500 per CPU+MB pair (BR-10, A-14)
	q.Bundles = min(cpu, mb)
	q.BundleDiscount = 500 * q.Bundles
	q.G2 = q.G1 - q.BundleDiscount

	// G3: member discount, floored to baht (BR-11)
	q.MemberRate = in.Tier.Rate()
	q.MemberDiscount = q.G2 * q.MemberRate / 100
	q.G3 = q.G2 - q.MemberDiscount

	// G4: one coupon (BR-15 to BR-20)
	q.Coupon = CouponResult{Status: "NONE"}
	if in.CouponCode != "" {
		q.Coupon = applyCoupon(in, q, eligible)
	}
	q.G4 = q.G3 - q.Coupon.Amount

	// assembly (BR-21): ฿500 when asked for · free only for a full set — all 7 builder categories, exactly 1 piece each.
	// "only for builder specs" is enforced by the cart UI (the option shows only for carts from the builder);
	// the server can't tell where a cart came from (LAB 9 R41 · QUESTIONS-TO-OWNER E11).
	if in.Assembly {
		q.AssemblyFee = 500
		all := true
		for _, c := range BuilderCats {
			if catQty[c] != 1 {
				all = false
			}
		}
		if all {
			q.AssemblyFee = 0
		}
	}

	// shipping (BR-22 to BR-24)
	switch in.Shipping {
	case "express":
		q.ShippingFee = 150
		if in.BugMode == 2 && q.G4 >= 3000 {
			q.ShippingFee = 0 // BUG_MODE=2: see BUGS2.md #2
		}
	case "pickup":
		q.ShippingFee = 0
	default:
		if q.G4 >= 3000 {
			q.ShippingFee = 0
		} else {
			q.ShippingFee = 60
		}
	}
	q.Total = q.G4 + q.AssemblyFee + q.ShippingFee
	q.VATSatang = VATSatang(q.Total)
	q.PreVATSatang = q.Total*100 - q.VATSatang
	return q
}

// Reship recomputes shipping, total and VAT for a locked quote (orders from a quotation, BR-39).
func Reship(q *Quote, shipping string) {
	switch shipping {
	case "express":
		q.ShippingFee = 150
	case "pickup":
		q.ShippingFee = 0
	default:
		if q.G4 >= 3000 {
			q.ShippingFee = 0
		} else {
			q.ShippingFee = 60
		}
	}
	q.Total = q.G4 + q.AssemblyFee + q.ShippingFee
	q.VATSatang = VATSatang(q.Total)
	q.PreVATSatang = q.Total*100 - q.VATSatang
}

// VATSatang = round half up(total × 7 ÷ 107) in satang, whole bill (BR-40, A-27).
func VATSatang(totalBaht int64) int64 {
	n := totalBaht * 700 // satang × 7
	return (2*n + 107) / 214
}

// MissingBuilderCats lists builder categories absent from the lines (for the assembly hint).
func MissingBuilderCats(lines []Line) []string {
	have := map[string]bool{}
	for _, l := range lines {
		have[l.Product.Category] = true
	}
	var out []string
	for _, c := range BuilderCats {
		if !have[c] {
			out = append(out, c)
		}
	}
	return out
}

func applyCoupon(in Input, q Quote, eligible map[string]int64) CouponResult {
	code := in.CouponCode
	reject := func(r string) CouponResult {
		return CouponResult{Code: str(code), Status: "REJECTED", Reason: str(r)}
	}
	c := in.Coupon
	if c == nil {
		return reject("ไม่พบโค้ดนี้")
	}
	if c.ExpiresAt != nil && in.Now.After(*c.ExpiresAt) {
		return reject("โค้ดหมดอายุแล้ว")
	}
	if c.LoginRequired && !in.LoggedIn {
		return reject("ต้องเข้าสู่ระบบก่อนใช้โค้ดนี้")
	}
	if c.FirstOrderOnly && !in.FirstOrder {
		return reject("โค้ดนี้ใช้ได้กับออเดอร์แรกเท่านั้น")
	}
	if c.FirstOrderOnly && in.FirstCouponHeld {
		return reject("โค้ดนี้ใช้กับออเดอร์ที่รอชำระอยู่แล้ว · ยกเลิกออเดอร์นั้นก่อน หรือชำระให้เสร็จ")
	}
	var amount int64
	if len(c.Categories) > 0 {
		var base int64
		for _, cat := range c.Categories {
			base += eligible[cat]
		}
		if base == 0 {
			return reject("โค้ดนี้ใช้ได้เฉพาะการ์ดจอและจอ")
		}
		if c.Kind == "percent" {
			if in.BugMode == 1 {
				amount = base * c.Value / 100 // BUG_MODE=1: see BUGS.md #2
			} else {
				// after flash and after the member discount (BR-18, A-13)
				amount = base * (100 - q.MemberRate) * c.Value / 10000
			}
		} else {
			amount = c.Value
		}
	} else {
		if q.G3 < c.MinAmount {
			return reject("ยอดไม่ถึง ฿" + commas(c.MinAmount))
		}
		if c.Kind == "percent" {
			amount = q.G3 * c.Value / 100
		} else {
			amount = c.Value
		}
	}
	if c.MaxDiscount > 0 && amount > c.MaxDiscount {
		amount = c.MaxDiscount
	}
	if amount > q.G3 {
		amount = q.G3
	}
	return CouponResult{Code: str(code), Status: "APPLIED", Amount: amount}
}

func commas(n int64) string {
	s := ""
	for i, d := range []byte(itoa(n)) {
		if i > 0 && (len(itoa(n))-i)%3 == 0 {
			s += ","
		}
		s += string(d)
	}
	return s
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}
