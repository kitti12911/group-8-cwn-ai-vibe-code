package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"bitbaan/backend/internal/catalog"
	"bitbaan/backend/internal/clock"
	"bitbaan/backend/internal/pricing"
)

// DefaultNow is "today" after reset (TEST-DATA.md 1, T-01).
var DefaultNow = clock.Date(2026, time.November, 13, 10, 0, 0)

type seedUser struct {
	code, email, name, phone, role string
	business                       bool
	tax, company                   *string
}

func sp(s string) *string { return &s }

// TEST-DATA.md 2
var seedUsers = []seedUser{
	{"C2", "nida@bitbaan.test", "คุณนิดา", "081-000-0002", "customer", false, nil, nil},
	{"C3", "oat@bitbaan.test", "คุณโอ๊ต", "081-000-0003", "customer", false, nil, nil},
	{"C4", "ploy@bitbaan.test", "คุณพลอย", "081-000-0004", "customer", false, nil, nil},
	{"C5", "joy@designco.test", "คุณจอย", "081-000-0005", "customer", true, sp("0105559000123"), sp("บริษัท ดีไซน์โค จำกัด")},
	{"C6", "tan@bitbaan.test", "คุณต้น", "081-000-0006", "customer", false, nil, nil},
	{"C7", "edge19999@bitbaan.test", "ขอบ Silver ต่ำกว่า", "081-000-0007", "customer", false, nil, nil},
	{"C8", "edge99999@bitbaan.test", "ขอบ Gold ต่ำกว่า", "081-000-0008", "customer", false, nil, nil},
	{"C9", "edge100k@bitbaan.test", "ขอบ Gold พอดี", "081-000-0009", "customer", false, nil, nil},
	{"C10", "edge365@bitbaan.test", "ขอบ 365 วัน", "081-000-0010", "customer", false, nil, nil},
	{"C11", "newbiz@bitbaan.test", "คุณนิว", "081-000-0011", "customer", true, sp("0105569000001"), sp("บริษัท เปิดใหม่ จำกัด")},
	{"S1", "mint@bitbaan.test", "คุณมิ้นท์", "", "staff", false, nil, nil},
	{"S2", "keng@bitbaan.test", "คุณเก่ง", "", "owner", false, nil, nil},
}

type ledgerRow struct {
	code   string
	at     time.Time
	source string
	amount int64
	order  string // order_no, "" for store
}

// TEST-DATA.md 2.1 (store carry-overs make the 6.2 totals exact)
var seedLedger = []ledgerRow{
	{"C2", clock.Date(2026, 8, 1, 12, 0, 0), "store", 4500, ""},
	{"C3", clock.Date(2026, 3, 1, 12, 0, 0), "store", 15520, ""},
	{"C4", clock.Date(2026, 5, 1, 12, 0, 0), "store", 124441, ""},
	{"C5", clock.Date(2026, 1, 1, 12, 0, 0), "store", 472649, ""},
	{"C6", clock.Date(2026, 2, 1, 12, 0, 0), "store", 18000, ""},
	{"C6", clock.Date(2025, 10, 1, 12, 0, 0), "store", 8000, ""},
	{"C7", clock.Date(2026, 6, 1, 12, 0, 0), "store", 19999, ""},
	{"C8", clock.Date(2026, 6, 1, 12, 0, 0), "store", 99999, ""},
	{"C9", clock.Date(2026, 6, 1, 12, 0, 0), "store", 100000, ""},
	{"C10", clock.Date(2025, 11, 13, 10, 0, 0), "store", 20000, ""},
}

type seedOrder struct {
	no, code  string
	items     []pricing.Line
	tier      pricing.Tier
	coupon    string
	shipping  string
	placed    time.Time
	status    string
	paid      time.Time
	packed    *time.Time
	shipped   *time.Time
	delivered *time.Time
	address   string
	province  string
}

func tp(t time.Time) *time.Time { return &t }

func line(sku string, qty int) pricing.Line { return pricing.Line{Product: catalog.P(sku), Qty: qty} }

// TEST-DATA.md 4
var seedOrders = []seedOrder{
	{"BB-260910-0001", "C3", []pricing.Line{line("CASE-L", 1), line("PSU-550", 1)}, pricing.TierGeneral, "", "standard",
		clock.Date(2026, 9, 10, 11, 0, 0), "DELIVERED", clock.Date(2026, 9, 10, 11, 5, 0),
		tp(clock.Date(2026, 9, 10, 15, 0, 0)), tp(clock.Date(2026, 9, 11, 10, 0, 0)), tp(clock.Date(2026, 9, 12, 14, 0, 0)), "99/1 ถ.ปิ่นเกล้า", Bangkok},
	{"BB-261106-0041", "C4", []pricing.Line{line("GPU-V46", 1)}, pricing.TierGold, "GAMER5", "express",
		clock.Date(2026, 11, 6, 12, 30, 0), "DELIVERED", clock.Date(2026, 11, 6, 12, 35, 0),
		tp(clock.Date(2026, 11, 6, 13, 0, 0)), tp(clock.Date(2026, 11, 6, 13, 30, 0)), tp(clock.Date(2026, 11, 6, 15, 0, 0)), "12 ซ.อารีย์", Bangkok},
	{"BB-261113-0001", "C4", []pricing.Line{line("RAM-D4", 1)}, pricing.TierGold, "", "standard",
		clock.Date(2026, 11, 13, 9, 0, 0), "PAID", clock.Date(2026, 11, 13, 9, 5, 0), nil, nil, nil, "12 ซ.อารีย์", Bangkok},
	{"BB-261112-0001", "C5", []pricing.Line{line("MON-27", 1)}, pricing.TierBusiness, "", "standard",
		clock.Date(2026, 11, 12, 14, 0, 0), "PACKED", clock.Date(2026, 11, 12, 14, 5, 0), tp(clock.Date(2026, 11, 13, 9, 30, 0)), nil, nil, "88 อาคารดีไซน์โค", Bangkok},
}

// seedTx เขียนข้อมูลตั้งต้นทั้งหมดลงในทรานแซกชันที่ผู้เรียกเปิดไว้
//
// เดิมฟังก์ชันนี้เปิด/ปิดทรานแซกชันเอง ทำให้ Reset มี 3 ขั้นแยกกัน (DROP → schema → seed)
// ถ้าล้มกลางคันฐานข้อมูลจะค้างสภาพครึ่ง ๆ · ตอนนี้ Reset ครอบทั้งหมดไว้ในทรานแซกชันเดียวจึงเป็น all-or-nothing
func seedTx(ctx context.Context, tx pgx.Tx, hash string) error {
	var err error
	ex := func(sql string, args ...any) {
		if err != nil {
			return
		}
		if _, e := tx.Exec(ctx, sql, args...); e != nil {
			err = fmt.Errorf("%s: %w", sql[:min(len(sql), 60)], e)
		}
	}
	ids := map[string]string{}
	for _, u := range seedUsers {
		var id string
		if e := tx.QueryRow(ctx, `INSERT INTO users (code, email, password_hash, name, phone, role, is_business, tax_id, company_name)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text`, u.code, u.email, hash, u.name, u.phone, u.role, u.business, u.tax, u.company).Scan(&id); e != nil {
			return e
		}
		ids[u.code] = id
	}
	for n, it := range catalog.Items {
		onHand := it.OnHand
		if onHand == 0 {
			onHand = it.Stock
		}
		ex(`INSERT INTO products (sku, name, category, price, red_tag, on_hand, available, per_buyer_limit, in_builder, sort_order)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, it.SKU, it.Name, it.Category, it.Price, it.RedTag, onHand, it.Stock, it.PerBuyerLimit, it.InBuilder, n)
	}
	ex(`INSERT INTO product_lots (code, sku, qty, release_at, released) VALUES ('LOT-V57-1','GPU-V57',1,$1,true), ('LOT-V57-2','GPU-V57',2,$2,false)`,
		clock.Date(2026, 11, 2, 10, 0, 0), clock.Date(2026, 11, 16, 10, 0, 0))
	ex(`INSERT INTO coupons (code, kind, value, min_amount, max_discount, categories, first_order_only, login_required, expires_at) VALUES
		('NEWBIT200','fixed',200,2000,0,'{}',true,true,NULL),
		('GAMER5','percent',5,0,1000,'{GPU,MON}',false,false,NULL),
		('OLD2025','fixed',300,0,0,'{}',false,false,$1)`, clock.Date(2025, 12, 31, 23, 59, 59))
	if err != nil {
		return err
	}
	coupons := map[string]*pricing.Coupon{
		"GAMER5": {Code: "GAMER5", Kind: "percent", Value: 5, MaxDiscount: 1000, Categories: []string{"GPU", "MON"}},
	}
	for _, l := range seedLedger {
		ex(`INSERT INTO spend_ledger (user_id, amount, source, occurred_at) VALUES ($1,$2,$3,$4)`, ids[l.code], l.amount, l.source, l.at)
	}
	for _, o := range seedOrders {
		u := seedUsers[0]
		for _, su := range seedUsers {
			if su.code == o.code {
				u = su
			}
		}
		in := pricing.Input{Lines: o.items, Tier: o.tier, LoggedIn: true, Shipping: o.shipping, Now: o.placed}
		if o.coupon != "" {
			in.CouponCode, in.Coupon = o.coupon, coupons[o.coupon]
		}
		q := pricing.Compute(in)
		snap, _ := json.Marshal(q)
		name := u.name
		if u.company != nil {
			name = *u.company
		}
		var couponCode *string
		if o.coupon != "" {
			couponCode = &o.coupon
		}
		var orderID string
		if e := tx.QueryRow(ctx, `INSERT INTO orders (order_no, user_id, buyer_name, buyer_phone, buyer_email, buyer_key, status, placed_at, hold_until, paid_at,
				packed_at, shipped_at, delivered_at, shipping_method, address_line, province, coupon_code, list_total, flash_discount, bundle_discount,
				member_rate, member_discount, coupon_discount, goods_total, assembly_fee, shipping_fee, total, snapshot)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING id::text`,
			o.no, ids[o.code], name, u.phone, u.email, "user:"+ids[o.code], o.status, o.placed, o.placed.Add(30*time.Minute), o.paid,
			o.packed, o.shipped, o.delivered, o.shipping, o.address, o.province, couponCode, q.ListTotal, q.FlashDiscount, q.BundleDiscount,
			q.MemberRate, q.MemberDiscount, q.Coupon.Amount, q.G4, q.AssemblyFee, q.ShippingFee, q.Total, snap).Scan(&orderID); e != nil {
			return e
		}
		for _, ql := range q.Lines {
			unit := ql.UnitPrice
			if ql.UnitFlashPrice != nil {
				unit = *ql.UnitFlashPrice
			}
			ex(`INSERT INTO order_items (order_id, sku, qty, unit_list_price, unit_price) VALUES ($1,$2,$3,$4,$5)`, orderID, ql.SKU, ql.Qty, ql.UnitPrice, unit)
		}
		ex(`INSERT INTO payments (order_id, amount, method, paid_at) VALUES ($1,$2,'promptpay',$3)`, orderID, q.Total, o.paid)
		ex(`INSERT INTO spend_ledger (user_id, amount, source, occurred_at, order_id) VALUES ($1,$2,'web',$3,$4)`, ids[o.code], q.G4, o.paid, orderID)
		if couponCode != nil {
			ex(`INSERT INTO coupon_redemptions (code, user_id, order_id, status) VALUES ($1,$2,$3,'paid')`, *couponCode, ids[o.code], orderID)
		}
		if err != nil {
			return err
		}
		if e := issueInvoice(ctx, tx, orderID, o.paid); e != nil {
			return e
		}
	}
	// TEST-DATA.md 2.1: ledger dates for the paid seed orders follow the table (B-1102 at 09:05 etc.) via paid_at above.

	// quotation Q-261106-0007 (TEST-DATA.md 4)
	issued := clock.Date(2026, 11, 6, 10, 0, 0)
	q := pricing.Compute(pricing.Input{Lines: []pricing.Line{line("MON-27", 5)}, Tier: pricing.TierBusiness, LoggedIn: true,
		CouponCode: "GAMER5", Coupon: coupons["GAMER5"], Shipping: "standard", Now: issued})
	snap, _ := json.Marshal(q)
	var qid string
	if e := tx.QueryRow(ctx, `INSERT INTO quotes (quote_no, user_id, issued_at, valid_until, total, snapshot) VALUES ('Q-261106-0007',$1,$2,$3,$4,$5) RETURNING id::text`,
		ids["C5"], issued, QuoteValidUntil(issued), q.Total, snap).Scan(&qid); e != nil {
		return e
	}
	ex(`INSERT INTO quote_items (quote_id, sku, qty, unit_price) VALUES ($1,'MON-27',5,7990)`, qid)

	// saved build BEAM35K (TEST-DATA.md 4)
	var bid string
	if e := tx.QueryRow(ctx, `INSERT INTO builds (share_code, budget, want_assembly, saved_at) VALUES ('BEAM35K', 35000, true, $1) RETURNING id::text`,
		clock.Date(2026, 11, 12, 14, 0, 0)).Scan(&bid); e != nil {
		return e
	}
	for slot, sku := range map[string]string{"cpu": "CPU-N5", "mb": "MB-B6", "ram": "RAM-D4", "gpu": "GPU-V46", "ssd": "SSD-1T", "psu": "PSU-550", "case": "CASE-M"} {
		ex(`INSERT INTO build_items (build_id, category, sku, price_at_save) VALUES ($1,$2,$3,$4)`, bid, slot, sku, catalog.P(sku).Price)
	}
	// running numbers continue after the seeded ones
	ex(`INSERT INTO counters (prefix, n) VALUES ('BB-260910',1),('BB-261106',41),('BB-261113',1),('BB-261112',1),('Q-261106',7)
		ON CONFLICT (prefix) DO UPDATE SET n = GREATEST(counters.n, EXCLUDED.n)`)
	return err
}
