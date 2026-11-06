package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"bitbaan/backend/internal/catalog"
	"bitbaan/backend/internal/clock"
	"bitbaan/backend/internal/compat"
	"bitbaan/backend/internal/pricing"
)

const Bangkok = "กรุงเทพมหานคร"

type Item struct {
	SKU string `json:"sku"`
	Qty int    `json:"qty"`
}

type OrderInput struct {
	Items    []Item  `json:"items"`
	Coupon   *string `json:"coupon"`
	Shipping string  `json:"shipping"`
	Province *string `json:"province"`
	Assembly bool    `json:"assembly"`
	Guest    *struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
		Email string `json:"email"`
	} `json:"guest"`
	Address *struct {
		Line     string `json:"line"`
		Province string `json:"province"`
	} `json:"address"`
}

func (in *OrderInput) province() string {
	if in.Address != nil && in.Address.Province != "" {
		return in.Address.Province
	}
	if in.Province != nil {
		return *in.Province
	}
	return ""
}

// lines validates and merges cart items (INVALID_ITEMS).
func lines(items []Item) ([]pricing.Line, error) {
	merged := map[string]int{}
	var order []string
	for _, it := range items {
		sku := strings.ToUpper(strings.TrimSpace(it.SKU))
		if _, ok := catalog.BySKU(sku); !ok || it.Qty < 1 {
			return nil, E(http.StatusBadRequest, "INVALID_ITEMS", "รายการสินค้าไม่ถูกต้อง")
		}
		if _, seen := merged[sku]; !seen {
			order = append(order, sku)
		}
		merged[sku] += it.Qty
	}
	if len(order) == 0 {
		return nil, E(http.StatusBadRequest, "INVALID_ITEMS", "ตะกร้าว่าง")
	}
	out := make([]pricing.Line, 0, len(order))
	for _, sku := range order {
		out = append(out, pricing.Line{Product: catalog.P(sku), Qty: merged[sku]})
	}
	return out, nil
}

// ValidateShipping rejects unknown shipping methods, and express to a known province outside Bangkok (BR-23, FR-32).
// An empty method means standard. A quote without a province is allowed (the cart prices before the address is typed).
func (in OrderInput) ValidateShipping() error {
	switch in.Shipping {
	case "", "standard", "express", "pickup":
	default:
		return E(http.StatusBadRequest, "INVALID_SHIPPING", "วิธีส่งต้องเป็น standard, express หรือ pickup")
	}
	if in.Shipping == "express" && in.province() != "" && in.province() != Bangkok {
		return E(http.StatusBadRequest, "EXPRESS_NOT_AVAILABLE", "ส่งด่วนได้เฉพาะกรุงเทพมหานคร")
	}
	return nil
}

// Validate: budget is optional, but when given it must be whole baht and more than 0 (BR-35).
func (b BuildInput) Validate() error {
	if b.Budget != nil && (*b.Budget <= 0 || *b.Budget%100 != 0) {
		return E(http.StatusBadRequest, "INVALID_BUDGET", "งบต้องเป็นจำนวนเต็มบาท มากกว่า ฿0")
	}
	return nil
}

func normShipping(s string) string {
	switch s {
	case "express", "pickup":
		return s
	}
	return "standard"
}

// Price computes a quote for the buyer at the web's current time (POST /api/quote). Saves nothing.
func (s *Store) Price(ctx context.Context, u *User, in OrderInput) (pricing.Quote, error) {
	if err := in.ValidateShipping(); err != nil {
		return pricing.Quote{}, err
	}
	ls, err := lines(in.Items)
	if err != nil {
		return pricing.Quote{}, err
	}
	return s.priceLines(ctx, u, ls, in, s.Clock.Now())
}

func (s *Store) priceLines(ctx context.Context, u *User, ls []pricing.Line, in OrderInput, now time.Time) (pricing.Quote, error) {
	tier, _, err := s.TierOf(ctx, u, now)
	if err != nil {
		return pricing.Quote{}, err
	}
	first, err := s.FirstOrder(ctx, u)
	if err != nil {
		return pricing.Quote{}, err
	}
	held, err := s.couponHeld(ctx, u)
	if err != nil {
		return pricing.Quote{}, err
	}
	p := pricing.Input{Lines: ls, Tier: tier, LoggedIn: u != nil, FirstOrder: first, FirstCouponHeld: held,
		Shipping: normShipping(in.Shipping), Assembly: in.Assembly, Now: now, BugMode: s.BugMode}
	if in.Coupon != nil && strings.TrimSpace(*in.Coupon) != "" {
		p.CouponCode = strings.ToUpper(strings.TrimSpace(*in.Coupon))
		if p.Coupon, err = s.Coupon(ctx, p.CouponCode); err != nil {
			return pricing.Quote{}, err
		}
	}
	return pricing.Compute(p), nil
}

// ---------- orders ----------

type Refund struct {
	ID          int64      `json:"id"`
	Kind        string     `json:"kind"`
	Amount      int64      `json:"-"`
	Fee         int64      `json:"-"`
	Status      string     `json:"status"`
	RequestedAt time.Time  `json:"-"`
	RefundedAt  *time.Time `json:"-"`
}

type Order struct {
	ID                                                                           string
	No, Status                                                                   string
	PlacedAt, HoldUntil                                                          time.Time
	PaidAt, PackedAt, ShippedAt, DeliveredAt, CancelledAt, ReturnedAt, ExpiredAt *time.Time
	UserID                                                                       *string
	BuyerCode                                                                    *string
	Name, Phone, Email                                                           string
	Shipping                                                                     string
	AddressLine, Province                                                        *string
	Quote                                                                        pricing.Quote
	Refunds                                                                      []Refund
	CanCancel, CanReturn                                                         bool
	ReturnUntil                                                                  *time.Time
}

// ReturnRefund: opened box pays a fee of floor(10% of goods paid); shipping is never refunded (BR-38).
func ReturnRefund(goods int64, opened bool) (refund, fee int64) {
	if opened {
		fee = goods / 10
	}
	return goods - fee, fee
}

// ReturnDeadline: 23:59:59 of the 7th day after delivery (BR-37).
func ReturnDeadline(delivered time.Time) time.Time {
	d := delivered.In(clock.TZ)
	return time.Date(d.Year(), d.Month(), d.Day(), 23, 59, 59, 0, clock.TZ).AddDate(0, 0, 7)
}

func digits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// PlaceOrder creates a PENDING order and holds every item in one transaction (FR-36).
// fixed != nil means the prices come from a saved quotation (FR-52).
func (s *Store) PlaceOrder(ctx context.Context, u *User, in OrderInput, fixed *pricing.Quote, quoteID *string) (*Order, error) {
	now := s.Clock.Now()
	ls, err := lines(in.Items)
	if err != nil {
		return nil, err
	}
	in.Shipping = normShipping(in.Shipping)
	name, phone, email := "", "", ""
	if u != nil {
		name, phone, email = u.Name, u.Phone, u.Email
		if u.Company != nil {
			name = *u.Company
		}
	} else {
		if in.Guest == nil || strings.TrimSpace(in.Guest.Name) == "" || digits(in.Guest.Phone) == "" || !strings.Contains(in.Guest.Email, "@") {
			return nil, E(http.StatusBadRequest, "GUEST_INFO_REQUIRED", "กรุณากรอกชื่อ เบอร์โทร และอีเมล")
		}
		name, phone, email = strings.TrimSpace(in.Guest.Name), strings.TrimSpace(in.Guest.Phone), strings.TrimSpace(in.Guest.Email)
	}
	if err := in.ValidateShipping(); err != nil {
		return nil, err
	}
	var addrLine, province *string
	if in.Shipping != "pickup" {
		if in.Address == nil || strings.TrimSpace(in.Address.Line) == "" || in.province() == "" {
			return nil, E(http.StatusBadRequest, "ADDRESS_REQUIRED", "กรุณากรอกที่อยู่จัดส่งและจังหวัด")
		}
		l, p := strings.TrimSpace(in.Address.Line), in.province()
		addrLine, province = &l, &p
		if in.Shipping == "express" && p != Bangkok {
			return nil, E(http.StatusBadRequest, "EXPRESS_NOT_AVAILABLE", "ส่งด่วนได้เฉพาะกรุงเทพมหานคร")
		}
	}
	// per-buyer limit inside one order (BR-31)
	for _, l := range ls {
		if it, _ := catalog.BySKU(l.Product.SKU); it.PerBuyerLimit != nil && l.Qty > *it.PerBuyerLimit {
			return nil, &AppError{Status: http.StatusConflict, Code: "LIMIT_REACHED", Message: "รุ่นนี้จำกัดคนละ 1 ใบ", Extra: map[string]any{"sku": l.Product.SKU}}
		}
	}
	var q pricing.Quote
	if fixed != nil {
		q = *fixed
		q.PricedAt = now
		pricing.Reship(&q, in.Shipping)
	} else {
		if q, err = s.priceLines(ctx, u, ls, in, now); err != nil {
			return nil, err
		}
	}
	if q.Coupon.Status == "REJECTED" {
		return nil, &AppError{Status: http.StatusBadRequest, Code: "COUPON_REJECTED", Message: *q.Coupon.Reason, Extra: map[string]any{"reason": *q.Coupon.Reason}}
	}
	buyerKey := "phone:" + digits(phone)
	var userID *string
	if u != nil {
		buyerKey, userID = "user:"+u.ID, &u.ID
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// 1) hold stock with a conditional update, rows locked in SKU order (DESIGN.md T-01, T-02)
	sorted := append([]pricing.Line(nil), ls...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Product.SKU < sorted[j].Product.SKU })
	for _, l := range sorted {
		var left int
		err := tx.QueryRow(ctx, `UPDATE products SET available = available - $2 WHERE sku = $1 AND available >= $2 RETURNING available`, l.Product.SKU, l.Qty).Scan(&left)
		if errors.Is(err, pgx.ErrNoRows) {
			var avail int
			_ = tx.QueryRow(ctx, `SELECT available FROM products WHERE sku = $1`, l.Product.SKU).Scan(&avail)
			return nil, &AppError{Status: http.StatusConflict, Code: "OUT_OF_STOCK", Message: stockMessage(l.Product.Name, avail),
				Extra: map[string]any{"sku": l.Product.SKU, "available": avail}}
		}
		if err != nil {
			return nil, err
		}
	}
	// 2) order row
	no, err := nextNumber(ctx, tx, "BB", now)
	if err != nil {
		return nil, err
	}
	snap, _ := json.Marshal(q)
	var orderID string
	var couponCode *string
	if q.Coupon.Status == "APPLIED" {
		couponCode = q.Coupon.Code
	}
	err = tx.QueryRow(ctx, `INSERT INTO orders (order_no, user_id, buyer_name, buyer_phone, buyer_email, buyer_key, status, placed_at, hold_until,
			shipping_method, address_line, province, coupon_code, quote_id, list_total, flash_discount, bundle_discount, member_rate, member_discount,
			coupon_discount, goods_total, assembly_fee, shipping_fee, total, snapshot)
		VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id::text`,
		no, userID, name, phone, email, buyerKey, now, now.Add(30*time.Minute), in.Shipping, addrLine, province, couponCode, quoteID,
		q.ListTotal, q.FlashDiscount, q.BundleDiscount, q.MemberRate, q.MemberDiscount, q.Coupon.Amount, q.G4, q.AssemblyFee, q.ShippingFee, q.Total, snap).Scan(&orderID)
	if err != nil {
		return nil, err
	}
	for _, ql := range q.Lines {
		unit := ql.UnitPrice
		if ql.UnitFlashPrice != nil {
			unit = *ql.UnitFlashPrice
		}
		if _, err := tx.Exec(ctx, `INSERT INTO order_items (order_id, sku, qty, unit_list_price, unit_price) VALUES ($1,$2,$3,$4,$5)`,
			orderID, ql.SKU, ql.Qty, ql.UnitPrice, unit); err != nil {
			return nil, err
		}
	}
	// 3) per-buyer claim on the current lot (BR-31); the unique index stops a second tab
	for _, l := range ls {
		it, _ := catalog.BySKU(l.Product.SKU)
		if it.PerBuyerLimit == nil {
			continue
		}
		_, err := tx.Exec(ctx, `INSERT INTO limited_claims (lot_id, buyer_key, order_id, status)
			SELECT id, $2, $3, 'held' FROM product_lots WHERE sku = $1 AND released ORDER BY release_at DESC LIMIT 1`, l.Product.SKU, buyerKey, orderID)
		if isUnique(err, "one_claim_per_buyer_per_lot") {
			return nil, &AppError{Status: http.StatusConflict, Code: "LIMIT_REACHED", Message: "รุ่นนี้จำกัดคนละ 1 ใบ คุณมีออเดอร์ที่กันไว้หรือซื้อไปแล้ว", Extra: map[string]any{"sku": l.Product.SKU}}
		}
		if err != nil {
			return nil, err
		}
	}
	// 4) coupon redemption; NEWBIT200 once per account (BR-17)
	if couponCode != nil {
		_, err := tx.Exec(ctx, `INSERT INTO coupon_redemptions (code, user_id, order_id, status) VALUES ($1, $2, $3, 'held')`, *couponCode, userID, orderID)
		if isUnique(err, "one_first_order_coupon") {
			return nil, E(http.StatusConflict, "COUPON_USED", "โค้ดนี้ใช้ได้กับออเดอร์แรกเท่านั้น และถูกใช้ไปแล้ว")
		}
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, no)
}

const orderCols = `o.id::text, o.order_no, o.status, o.placed_at, o.hold_until, o.paid_at, o.packed_at, o.shipped_at, o.delivered_at, o.cancelled_at,
	o.returned_at, o.expired_at, o.user_id::text, u.code, o.buyer_name, o.buyer_phone, o.buyer_email, o.shipping_method, o.address_line, o.province, o.snapshot`

func (s *Store) scanOrder(ctx context.Context, row pgx.Row) (*Order, error) {
	var o Order
	var snap []byte
	err := row.Scan(&o.ID, &o.No, &o.Status, &o.PlacedAt, &o.HoldUntil, &o.PaidAt, &o.PackedAt, &o.ShippedAt, &o.DeliveredAt, &o.CancelledAt,
		&o.ReturnedAt, &o.ExpiredAt, &o.UserID, &o.BuyerCode, &o.Name, &o.Phone, &o.Email, &o.Shipping, &o.AddressLine, &o.Province, &snap)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(snap, &o.Quote); err != nil {
		return nil, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT id, kind, amount::bigint, fee::bigint, status, requested_at, refunded_at FROM refunds WHERE order_id = $1 ORDER BY id`, o.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var r Refund
		if err := rows.Scan(&r.ID, &r.Kind, &r.Amount, &r.Fee, &r.Status, &r.RequestedAt, &r.RefundedAt); err != nil {
			return nil, err
		}
		o.Refunds = append(o.Refunds, r)
	}
	now := s.Clock.Now()
	o.CanCancel = o.Status == "PENDING" || o.Status == "PAID"
	if o.DeliveredAt != nil {
		d := ReturnDeadline(*o.DeliveredAt)
		o.ReturnUntil = &d
		o.CanReturn = o.Status == "DELIVERED" && !now.After(d)
	}
	return &o, nil
}

func (s *Store) GetOrder(ctx context.Context, no string) (*Order, error) {
	return s.scanOrder(ctx, s.Pool.QueryRow(ctx, `SELECT `+orderCols+` FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.order_no = $1`, no))
}

func (s *Store) listOrders(ctx context.Context, where string, args ...any) ([]*Order, error) {
	rows, err := s.Pool.Query(ctx, `SELECT o.order_no FROM orders o WHERE `+where+` ORDER BY o.placed_at DESC, o.order_no DESC`, args...)
	if err != nil {
		return nil, err
	}
	var nos []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return nil, err
		}
		nos = append(nos, n)
	}
	rows.Close()
	out := []*Order{}
	for _, n := range nos {
		o, err := s.GetOrder(ctx, n)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, nil
}

func (s *Store) MyOrders(ctx context.Context, u *User) ([]*Order, error) {
	return s.listOrders(ctx, `o.user_id = $1`, u.ID)
}

func (s *Store) AdminOrders(ctx context.Context, status, date string) ([]*Order, error) {
	where, args := "true", []any{}
	if status != "" {
		args = append(args, status)
		where += " AND o.status = $1"
	}
	if date != "" {
		d, err := time.ParseInLocation("2006-01-02", date, clock.TZ)
		if err != nil {
			return nil, E(http.StatusBadRequest, "INVALID_DATE", "รูปแบบวันที่ต้องเป็น YYYY-MM-DD")
		}
		args = append(args, d, d.AddDate(0, 0, 1))
		where += " AND o.placed_at >= $" + itoa(len(args)-1) + " AND o.placed_at < $" + itoa(len(args))
	}
	return s.listOrders(ctx, where, args...)
}

func itoa(n int) string { return strconv.Itoa(n) }

// lockOrder loads and row-locks an order inside tx.
func lockOrder(ctx context.Context, tx pgx.Tx, no string) (id, status string, holdUntil time.Time, deliveredAt *time.Time, userID *string, total, goods int64, err error) {
	err = tx.QueryRow(ctx, `SELECT id::text, status, hold_until, delivered_at, user_id::text, total::bigint, goods_total::bigint FROM orders WHERE order_no = $1 FOR UPDATE`, no).
		Scan(&id, &status, &holdUntil, &deliveredAt, &userID, &total, &goods)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return
}

// Pay accepts payment while inside the hold (BR-30). Paying twice returns the first result (FR-43).
func (s *Store) Pay(ctx context.Context, no, method string) (*Order, error) {
	now := s.Clock.Now()
	if method != "card" {
		method = "promptpay"
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	id, status, holdUntil, _, userID, total, goods, err := lockOrder(ctx, tx, no)
	if err != nil {
		return nil, err
	}
	switch status {
	case "PAID", "PACKED", "SHIPPED", "DELIVERED", "RETURNED":
		tx.Rollback(ctx)
		return s.GetOrder(ctx, no)
	case "EXPIRED":
		return nil, E(http.StatusConflict, "ORDER_EXPIRED", "ออเดอร์หมดเวลาแล้ว ของถูกปล่อยคืน กรุณาสั่งใหม่")
	case "CANCELLED":
		return nil, E(http.StatusConflict, "ORDER_NOT_PENDING", "ออเดอร์นี้ถูกยกเลิกแล้ว")
	}
	if holdUntil.Before(s.holdCutoff(now)) {
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'EXPIRED', expired_at = $2 WHERE id = $1`, id, now); err != nil {
			return nil, err
		}
		if err := releaseOrder(ctx, tx, id); err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return nil, E(http.StatusConflict, "ORDER_EXPIRED", "ออเดอร์หมดเวลาแล้ว ของถูกปล่อยคืน กรุณาสั่งใหม่")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO payments (order_id, amount, method, paid_at) VALUES ($1, $2, $3, $4)`, id, total, method, now); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'PAID', paid_at = $2 WHERE id = $1`, id, now); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE limited_claims SET status = 'paid' WHERE order_id = $1 AND status = 'held'`, id); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE coupon_redemptions SET status = 'paid' WHERE order_id = $1 AND status = 'held'`, id); err != nil {
		return nil, err
	}
	if userID != nil {
		if _, err := tx.Exec(ctx, `INSERT INTO spend_ledger (user_id, amount, source, occurred_at, order_id) VALUES ($1, $2, 'web', $3, $4)`, *userID, goods, now, id); err != nil {
			return nil, err
		}
	}
	if err := issueInvoice(ctx, tx, id, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, no)
}

func issueInvoice(ctx context.Context, tx pgx.Tx, orderID string, at time.Time) error {
	no, err := nextNumber(ctx, tx, "INV", at)
	if err != nil {
		return err
	}
	var total int64
	var name string
	var company, tax *string
	if err := tx.QueryRow(ctx, `SELECT o.total::bigint, o.buyer_name, u.company_name, u.tax_id FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`, orderID).
		Scan(&total, &name, &company, &tax); err != nil {
		return err
	}
	vat := pricing.VATSatang(total)
	_, err = tx.Exec(ctx, `INSERT INTO tax_invoices (order_id, invoice_no, issued_at, buyer_name, company_name, tax_id, base_amount, vat, total)
		VALUES ($1,$2,$3,$4,$5,$6, ($7::numeric / 100), ($8::numeric / 100), $9)`, orderID, no, at, name, company, tax, total*100-vat, vat, total)
	return err
}

type Invoice struct {
	No, OrderNo  string
	IssuedAt     time.Time
	Name         string
	Company, Tax *string
	Total        int64 // baht
	VAT, PreVAT  int64 // satang
	Lines        []pricing.QuoteLine
}

func (s *Store) Invoice(ctx context.Context, no string) (*Invoice, error) {
	o, err := s.GetOrder(ctx, no)
	if err != nil {
		return nil, err
	}
	var inv Invoice
	err = s.Pool.QueryRow(ctx, `SELECT invoice_no, issued_at, buyer_name, company_name, tax_id, total::bigint, (vat * 100)::bigint, (base_amount * 100)::bigint
		FROM tax_invoices WHERE order_id = $1`, o.ID).Scan(&inv.No, &inv.IssuedAt, &inv.Name, &inv.Company, &inv.Tax, &inv.Total, &inv.VAT, &inv.PreVAT)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, E(http.StatusConflict, "NOT_PAID", "ออเดอร์ยังไม่ได้ชำระเงิน")
	}
	inv.OrderNo, inv.Lines = o.No, o.Quote.Lines
	return &inv, err
}

// Cancel before packing; paid orders refund everything including shipping (BR-36, A-24).
func (s *Store) Cancel(ctx context.Context, no string) (*Order, int64, error) {
	now := s.Clock.Now()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)
	id, status, _, _, _, total, _, err := lockOrder(ctx, tx, no)
	if err != nil {
		return nil, 0, err
	}
	if status != "PENDING" && status != "PAID" {
		msg := map[string]string{
			"CANCELLED": "ออเดอร์นี้ถูกยกเลิกไปแล้ว",
			"EXPIRED":   "ออเดอร์นี้หมดเวลาแล้ว ไม่ต้องยกเลิก",
			"RETURNED":  "ออเดอร์นี้คืนของไปแล้ว",
		}[status]
		if msg == "" {
			msg = "ร้านแพ็กของแล้ว ยกเลิกไม่ได้ กรุณาใช้การคืนของเมื่อได้รับสินค้า"
		}
		return nil, 0, E(http.StatusConflict, "CANNOT_CANCEL", msg)
	}
	var refund int64
	if status == "PAID" {
		refund = total
		if _, err := tx.Exec(ctx, `INSERT INTO refunds (order_id, kind, amount, fee, requested_at) VALUES ($1, 'CANCEL', $2, 0, $3)`, id, refund, now); err != nil {
			return nil, 0, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM spend_ledger WHERE order_id = $1`, id); err != nil {
			return nil, 0, err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'CANCELLED', cancelled_at = $2 WHERE id = $1`, id, now); err != nil {
		return nil, 0, err
	}
	if err := releaseOrder(ctx, tx, id); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	o, err := s.GetOrder(ctx, no)
	return o, refund, err
}

// Return within 7 days of delivery; opened boxes pay 10% (floored); shipping is not refunded (BR-37, BR-38).
func (s *Store) Return(ctx context.Context, no string, opened bool) (*Order, int64, int64, error) {
	now := s.Clock.Now()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, 0, 0, err
	}
	defer tx.Rollback(ctx)
	id, status, _, deliveredAt, _, _, goods, err := lockOrder(ctx, tx, no)
	if err != nil {
		return nil, 0, 0, err
	}
	if status == "RETURNED" {
		return nil, 0, 0, E(http.StatusConflict, "ALREADY_RETURNED", "ออเดอร์นี้ขอคืนของไปแล้ว")
	}
	if status != "DELIVERED" || deliveredAt == nil {
		return nil, 0, 0, E(http.StatusConflict, "NOT_DELIVERED", "คืนของได้หลังได้รับสินค้าแล้วเท่านั้น")
	}
	if now.After(ReturnDeadline(*deliveredAt)) {
		return nil, 0, 0, E(http.StatusConflict, "RETURN_WINDOW_CLOSED", "เกิน 7 วันหลังได้รับสินค้า คืนของไม่ได้")
	}
	refund, fee := ReturnRefund(goods, opened)
	if _, err := tx.Exec(ctx, `INSERT INTO refunds (order_id, kind, amount, fee, requested_at) VALUES ($1, 'RETURN', $2, $3, $4)`, id, refund, fee, now); err != nil {
		return nil, 0, 0, err
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'RETURNED', returned_at = $2 WHERE id = $1`, id, now); err != nil {
		return nil, 0, 0, err
	}
	if _, err := tx.Exec(ctx, `UPDATE products p SET available = p.available + i.qty, on_hand = p.on_hand + i.qty FROM order_items i WHERE i.order_id = $1 AND i.sku = p.sku`, id); err != nil {
		return nil, 0, 0, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM spend_ledger WHERE order_id = $1`, id); err != nil {
		return nil, 0, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, 0, err
	}
	o, err := s.GetOrder(ctx, no)
	return o, refund, fee, err
}

// ---------- quotations (BR-39) ----------

type Quotation struct {
	ID, No     string
	UserID     string
	IssuedAt   time.Time
	ValidUntil time.Time
	Quote      pricing.Quote
	Items      []Item
}

// QuoteValidUntil: 23:59:59 of the 7th day after issue.
func QuoteValidUntil(issued time.Time) time.Time {
	d := issued.In(clock.TZ)
	return time.Date(d.Year(), d.Month(), d.Day(), 23, 59, 59, 0, clock.TZ).AddDate(0, 0, 7)
}

func (s *Store) CreateQuote(ctx context.Context, u *User, items []Item, coupon *string) (*Quotation, error) {
	if u == nil {
		return nil, ErrLoginRequired
	}
	if !u.IsBusiness {
		return nil, E(http.StatusForbidden, "FORBIDDEN", "ใบเสนอราคาใช้ได้กับบัญชี Business เท่านั้น")
	}
	ls, err := lines(items)
	if err != nil {
		return nil, err
	}
	now := s.Clock.Now()
	q, err := s.priceLines(ctx, u, ls, OrderInput{Coupon: coupon, Shipping: "standard"}, now)
	if err != nil {
		return nil, err
	}
	if q.Coupon.Status == "REJECTED" {
		return nil, &AppError{Status: http.StatusBadRequest, Code: "COUPON_REJECTED", Message: *q.Coupon.Reason, Extra: map[string]any{"reason": *q.Coupon.Reason}}
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	no, err := nextNumber(ctx, tx, "Q", now)
	if err != nil {
		return nil, err
	}
	snap, _ := json.Marshal(q)
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO quotes (quote_no, user_id, issued_at, valid_until, total, snapshot) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`,
		no, u.ID, now, QuoteValidUntil(now), q.Total, snap).Scan(&id); err != nil {
		return nil, err
	}
	for _, l := range q.Lines {
		if _, err := tx.Exec(ctx, `INSERT INTO quote_items (quote_id, sku, qty, unit_price) VALUES ($1,$2,$3,$4)`, id, l.SKU, l.Qty, l.Amount/int64(l.Qty)); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetQuote(ctx, no)
}

func (s *Store) GetQuote(ctx context.Context, no string) (*Quotation, error) {
	var qt Quotation
	var snap []byte
	err := s.Pool.QueryRow(ctx, `SELECT id::text, quote_no, user_id::text, issued_at, valid_until, snapshot FROM quotes WHERE quote_no = $1`, no).
		Scan(&qt.ID, &qt.No, &qt.UserID, &qt.IssuedAt, &qt.ValidUntil, &snap)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(snap, &qt.Quote); err != nil {
		return nil, err
	}
	for _, l := range qt.Quote.Lines {
		qt.Items = append(qt.Items, Item{SKU: l.SKU, Qty: l.Qty})
	}
	return &qt, nil
}

func (s *Store) MyQuotes(ctx context.Context, u *User) ([]*Quotation, error) {
	rows, err := s.Pool.Query(ctx, `SELECT quote_no FROM quotes WHERE user_id = $1 ORDER BY issued_at DESC`, u.ID)
	if err != nil {
		return nil, err
	}
	var nos []string
	for rows.Next() {
		var n string
		_ = rows.Scan(&n)
		nos = append(nos, n)
	}
	rows.Close()
	out := []*Quotation{}
	for _, n := range nos {
		q, err := s.GetQuote(ctx, n)
		if err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, nil
}

func (s *Store) OrderFromQuote(ctx context.Context, u *User, no string, in OrderInput) (*Order, error) {
	qt, err := s.GetQuote(ctx, no)
	if err != nil {
		return nil, err
	}
	if u == nil || u.ID != qt.UserID {
		return nil, ErrNotFound
	}
	if s.Clock.Now().After(qt.ValidUntil) {
		return nil, E(http.StatusConflict, "QUOTE_EXPIRED", "ใบเสนอราคาหมดอายุ")
	}
	in.Items, in.Assembly = qt.Items, false
	if qt.Quote.Coupon.Code != nil {
		in.Coupon = qt.Quote.Coupon.Code
	}
	return s.PlaceOrder(ctx, u, in, &qt.Quote, &qt.ID)
}

// ---------- builds (FR-18 to FR-22) ----------

type BuildInput struct {
	Parts    map[string]*string `json:"parts"`
	Budget   *int64             `json:"budget"` // satang
	Assembly bool               `json:"assembly"`
}

func (b BuildInput) PartMap() map[string]string {
	m := map[string]string{}
	for k, v := range b.Parts {
		if v != nil {
			m[strings.ToLower(k)] = strings.ToUpper(*v)
		}
	}
	return m
}

func (s *Store) SaveBuild(ctx context.Context, u *User, b BuildInput) (string, time.Time, error) {
	now := s.Clock.Now()
	parts := b.PartMap()
	var budget *int64
	if b.Budget != nil {
		v := *b.Budget / 100
		budget = &v
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", now, err
	}
	defer tx.Rollback(ctx)
	code := strings.ToUpper(randomToken(4))
	var uid *string
	if u != nil {
		uid = &u.ID
	}
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO builds (share_code, owner_id, budget, want_assembly, saved_at) VALUES ($1,$2,$3,$4,$5) RETURNING id::text`,
		code, uid, budget, b.Assembly, now).Scan(&id); err != nil {
		return "", now, err
	}
	for _, slot := range compat.Cats {
		sku, ok := parts[slot]
		if !ok {
			continue
		}
		it, ok := catalog.BySKU(sku)
		if !ok || it.Category != compat.ProductCat(slot) {
			return "", now, E(http.StatusBadRequest, "INVALID_ITEMS", "สินค้าไม่ตรงหมวด: "+sku)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO build_items (build_id, category, sku, price_at_save) VALUES ($1,$2,$3,$4)`,
			id, slot, sku, pricing.UnitPrice(it.Product, now, s.BugMode)); err != nil {
			return "", now, err
		}
	}
	return code, now, tx.Commit(ctx)
}

type BuildItem struct {
	Category, SKU, Name       string
	PriceAtSave, CurrentPrice int64
	Available                 int
}

type Build struct {
	Code     string
	SavedAt  time.Time
	Budget   *int64 // baht
	Assembly bool
	Items    []BuildItem
}

func (s *Store) GetBuild(ctx context.Context, code string) (*Build, error) {
	var b Build
	var id string
	err := s.Pool.QueryRow(ctx, `SELECT id::text, share_code, saved_at, budget::bigint, want_assembly FROM builds WHERE share_code = $1`, strings.ToUpper(code)).
		Scan(&id, &b.Code, &b.SavedAt, &b.Budget, &b.Assembly)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT bi.category, bi.sku, bi.price_at_save::bigint, p.available FROM build_items bi JOIN products p ON p.sku = bi.sku WHERE bi.build_id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := s.Clock.Now()
	byCat := map[string]BuildItem{}
	for rows.Next() {
		var it BuildItem
		if err := rows.Scan(&it.Category, &it.SKU, &it.PriceAtSave, &it.Available); err != nil {
			return nil, err
		}
		p := catalog.P(it.SKU)
		it.Name, it.CurrentPrice = p.Name, pricing.UnitPrice(p, now, s.BugMode)
		byCat[it.Category] = it
	}
	for _, slot := range compat.Cats {
		if it, ok := byCat[slot]; ok {
			b.Items = append(b.Items, it)
		}
	}
	return &b, rows.Err()
}

// ---------- back office ----------

type AdminStock struct {
	SKU, Name               string
	OnHand, Held, Available int
	RedTag                  bool
	PerBuyerLimit           *int
}

func (s *Store) AdminStock(ctx context.Context) ([]AdminStock, error) {
	st, err := s.StockMap(ctx)
	if err != nil {
		return nil, err
	}
	out := []AdminStock{}
	for _, it := range catalog.Items {
		x := st[it.SKU]
		out = append(out, AdminStock{SKU: it.SKU, Name: it.Name, OnHand: x.OnHand, Held: x.OnHand - x.Available, Available: x.Available, RedTag: it.RedTag, PerBuyerLimit: it.PerBuyerLimit})
	}
	return out, nil
}

// StoreSale takes stock from the same pool as the web (FR-07, BR-32).
func (s *Store) StoreSale(ctx context.Context, staff *User, sku string, qty int, customerCode *string) (int, error) {
	it, ok := catalog.BySKU(strings.ToUpper(sku))
	if !ok || qty < 1 {
		return 0, E(http.StatusBadRequest, "INVALID_ITEMS", "รายการสินค้าไม่ถูกต้อง")
	}
	now := s.Clock.Now()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var left int
	err = tx.QueryRow(ctx, `UPDATE products SET available = available - $2, on_hand = on_hand - $2 WHERE sku = $1 AND available >= $2 RETURNING available`, it.SKU, qty).Scan(&left)
	if errors.Is(err, pgx.ErrNoRows) {
		var avail int
		_ = tx.QueryRow(ctx, `SELECT available FROM products WHERE sku = $1`, it.SKU).Scan(&avail)
		return 0, &AppError{Status: http.StatusConflict, Code: "OUT_OF_STOCK", Message: stockMessage(it.Name, avail), Extra: map[string]any{"sku": it.SKU, "available": avail}}
	}
	if err != nil {
		return 0, err
	}
	var cust *string
	if customerCode != nil && *customerCode != "" {
		if c, _ := s.UserByCode(ctx, *customerCode); c != nil {
			cust = &c.ID
		}
	}
	amount := pricing.UnitPrice(it.Product, now, s.BugMode) * int64(qty)
	if _, err := tx.Exec(ctx, `INSERT INTO store_sales (sku, qty, amount, staff_id, customer_id, sold_at) VALUES ($1,$2,$3,$4,$5,$6)`, it.SKU, qty, amount, staff.ID, cust, now); err != nil {
		return 0, err
	}
	if cust != nil {
		if _, err := tx.Exec(ctx, `INSERT INTO spend_ledger (user_id, amount, source, occurred_at) VALUES ($1,$2,'store',$3)`, *cust, amount, now); err != nil {
			return 0, err
		}
	}
	return left, tx.Commit(ctx)
}

var nextStatus = map[string]string{"PAID": "PACKED", "PACKED": "SHIPPED", "SHIPPED": "DELIVERED"}

// SetStatus moves an order one step forward only; staff can never mark an order PAID (FR-44, FR-55).
func (s *Store) SetStatus(ctx context.Context, no, to string) (*Order, error) {
	now := s.Clock.Now()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	id, status, _, _, _, _, _, err := lockOrder(ctx, tx, no)
	if err != nil {
		return nil, err
	}
	if nextStatus[status] != to {
		return nil, E(http.StatusConflict, "INVALID_TRANSITION", "เปลี่ยนสถานะจาก "+status+" เป็น "+to+" ไม่ได้")
	}
	col := map[string]string{"PACKED": "packed_at", "SHIPPED": "shipped_at", "DELIVERED": "delivered_at"}[to]
	if _, err := tx.Exec(ctx, `UPDATE orders SET status = $2, `+col+` = $3 WHERE id = $1`, id, to, now); err != nil {
		return nil, err
	}
	if to == "SHIPPED" {
		if _, err := tx.Exec(ctx, `UPDATE products p SET on_hand = p.on_hand - i.qty FROM order_items i WHERE i.order_id = $1 AND i.sku = p.sku`, id); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, no)
}

func (s *Store) RefundDone(ctx context.Context, id int64) (*time.Time, error) {
	now := s.Clock.Now()
	tag, err := s.Pool.Exec(ctx, `UPDATE refunds SET status = 'DONE', refunded_at = $2 WHERE id = $1 AND status = 'PENDING'`, id, now)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return &now, nil
}

// stockMessage: "หมด" only when nothing is left; otherwise say how many are left (C5 exploration).
func stockMessage(name string, avail int) string {
	if avail <= 0 {
		return "สินค้าหมดแล้ว: " + name
	}
	return fmt.Sprintf("สินค้ามีไม่พอ: %s เหลือ %d ชิ้น", name, avail)
}

// couponHeld: the account already holds its first-order coupon on a PENDING order (BR-17).
func (s *Store) couponHeld(ctx context.Context, u *User) (bool, error) {
	if u == nil {
		return false, nil
	}
	var held bool
	err := s.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id
		WHERE r.user_id = $1 AND r.status = 'held' AND o.status = 'PENDING'
		  AND r.code IN (SELECT code FROM coupons WHERE first_order_only))`, u.ID).Scan(&held)
	return held, err
}
