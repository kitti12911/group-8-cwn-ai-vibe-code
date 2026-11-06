// Package api implements API-CONTRACT.md over net/http.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"bitbaan/backend/internal/catalog"
	"bitbaan/backend/internal/clock"
	"bitbaan/backend/internal/compat"
	"bitbaan/backend/internal/pricing"
	"bitbaan/backend/internal/store"
)

type Server struct {
	S        *store.Store
	TestMode bool
	mux      *http.ServeMux
}

func New(s *store.Store, testMode bool) *Server {
	srv := &Server{S: s, TestMode: testMode, mux: http.NewServeMux()}
	srv.routes()
	return srv
}

func (srv *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if !strings.HasPrefix(r.URL.Path, "/api/test/") && r.URL.Path != "/api/health" {
		if err := srv.S.Maintain(r.Context()); err != nil {
			log.Printf("maintain: %v", err)
		}
	}
	srv.mux.ServeHTTP(w, r)
	if r.URL.Path != "/api/health" {
		log.Printf("%s %s %s", r.Method, r.URL.RequestURI(), time.Since(start).Round(time.Millisecond))
	}
}

type handler func(w http.ResponseWriter, r *http.Request) (any, error)

func (srv *Server) h(fn handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		v, err := fn(w, r)
		if err != nil {
			writeErr(w, err)
			return
		}
		status := http.StatusOK
		if c, ok := v.(created); ok {
			status, v = http.StatusCreated, c.v
		}
		writeJSON(w, status, v)
	}
}

type created struct{ v any }

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, err error) {
	var ae *store.AppError
	if errors.As(err, &ae) {
		body := map[string]any{"error": ae.Code, "message": ae.Message}
		for k, v := range ae.Extra {
			body[k] = v
		}
		writeJSON(w, ae.Status, body)
		return
	}
	log.Printf("internal error: %v", err)
	writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "INTERNAL", "message": "ระบบขัดข้อง กรุณาลองใหม่"})
}

func decode(r *http.Request, v any) error {
	if r.Body == nil || r.ContentLength == 0 {
		return nil
	}
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return store.E(http.StatusBadRequest, "INVALID_JSON", "รูปแบบข้อมูลไม่ถูกต้อง")
	}
	return nil
}

// user resolves X-Test-User (TEST_MODE only) or the bb_session cookie. nil = guest.
func (srv *Server) user(r *http.Request) (*store.User, error) {
	if code := strings.TrimSpace(r.Header.Get("X-Test-User")); code != "" && srv.TestMode {
		if strings.EqualFold(code, "C1") || strings.EqualFold(code, "GUEST") {
			return nil, nil
		}
		u, err := srv.S.UserByCode(r.Context(), strings.ToUpper(code))
		if err != nil {
			return nil, err
		}
		if u == nil {
			return nil, store.E(http.StatusUnauthorized, "UNKNOWN_TEST_USER", "ไม่พบผู้ใช้ทดสอบ "+code)
		}
		return u, nil
	}
	if c, err := r.Cookie("bb_session"); err == nil && c.Value != "" {
		return srv.S.UserBySession(r.Context(), c.Value)
	}
	return nil, nil
}

func (srv *Server) mustUser(r *http.Request) (*store.User, error) {
	u, err := srv.user(r)
	if err == nil && u == nil {
		err = store.ErrLoginRequired
	}
	return u, err
}

func (srv *Server) staff(r *http.Request) (*store.User, error) {
	u, err := srv.mustUser(r)
	if err != nil {
		return nil, err
	}
	if u.Role != "staff" && u.Role != "owner" {
		return nil, store.ErrForbidden
	}
	return u, nil
}

func satang(baht int64) int64 { return baht * 100 }

func iso(t time.Time) string { return clock.Format(t) }

func isoP(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := iso(*t)
	return &s
}

// ---------- JSON shapes (API-CONTRACT 3) ----------

func quoteJSON(q pricing.Quote) map[string]any {
	ls := []map[string]any{}
	for _, l := range q.Lines {
		var fp *int64
		if l.UnitFlashPrice != nil {
			v := satang(*l.UnitFlashPrice)
			fp = &v
		}
		ls = append(ls, map[string]any{"sku": l.SKU, "name": l.Name, "category": l.Category, "qty": l.Qty,
			"unitPrice": satang(l.UnitPrice), "unitFlashPrice": fp, "amount": satang(l.Amount)})
	}
	var tier any
	if q.Tier != "" {
		tier = q.Tier
	}
	return map[string]any{
		"pricedAt": iso(q.PricedAt), "lines": ls,
		"listTotal": satang(q.ListTotal), "flashDiscount": satang(q.FlashDiscount), "g1": satang(q.G1),
		"bundles": q.Bundles, "bundleDiscount": satang(q.BundleDiscount), "g2": satang(q.G2),
		"tier": tier, "memberRate": q.MemberRate, "memberDiscount": satang(q.MemberDiscount), "g3": satang(q.G3),
		"coupon": map[string]any{"code": q.Coupon.Code, "status": q.Coupon.Status, "reason": q.Coupon.Reason, "amount": satang(q.Coupon.Amount)},
		"g4": satang(q.G4), "assemblyFee": satang(q.AssemblyFee), "shippingFee": satang(q.ShippingFee),
		"total": satang(q.Total), "vat": q.VATSatang, "preVat": q.PreVATSatang,
	}
}

func (srv *Server) orderJSON(o *store.Order) map[string]any {
	refunds := []map[string]any{}
	for _, r := range o.Refunds {
		refunds = append(refunds, map[string]any{"id": r.ID, "kind": r.Kind, "amount": satang(r.Amount), "fee": satang(r.Fee),
			"status": r.Status, "requestedAt": iso(r.RequestedAt), "refundedAt": isoP(r.RefundedAt)})
	}
	// FR-48: the customer sees the refund for both choices before confirming
	var preview any
	if o.CanReturn {
		ur, uf := store.ReturnRefund(o.Quote.G4, false)
		or, of := store.ReturnRefund(o.Quote.G4, true)
		preview = map[string]any{
			"unopened": map[string]any{"refund": satang(ur), "fee": satang(uf)},
			"opened":   map[string]any{"refund": satang(or), "fee": satang(of)},
		}
	}
	var addr any
	if o.AddressLine != nil {
		addr = map[string]any{"line": *o.AddressLine, "province": o.Province}
	}
	return map[string]any{
		"orderNo": o.No, "status": o.Status, "placedAt": iso(o.PlacedAt), "holdUntil": iso(o.HoldUntil),
		"paidAt": isoP(o.PaidAt), "packedAt": isoP(o.PackedAt), "shippedAt": isoP(o.ShippedAt), "deliveredAt": isoP(o.DeliveredAt),
		"cancelledAt": isoP(o.CancelledAt), "returnedAt": isoP(o.ReturnedAt), "expiredAt": isoP(o.ExpiredAt),
		"buyer":    map[string]any{"code": o.BuyerCode, "name": o.Name, "phone": o.Phone, "email": o.Email},
		"shipping": o.Shipping, "address": addr, "quote": quoteJSON(o.Quote),
		"canCancel": o.CanCancel, "canReturn": o.CanReturn, "returnUntil": isoP(o.ReturnUntil), "returnPreview": preview, "refunds": refunds,
	}
}

func (srv *Server) productJSON(it catalog.Item, st store.Stock, tier pricing.Tier, now time.Time) map[string]any {
	cur := pricing.UnitPrice(it.Product, now, srv.S.BugMode)
	var member any
	if tier != pricing.TierNone {
		member = satang(pricing.MemberPrice(it.Product, now, tier, srv.S.BugMode))
	}
	specs := it.Specs
	if specs.CaseSupports == nil {
		specs.CaseSupports = []string{}
	}
	return map[string]any{
		"sku": it.SKU, "name": it.Name, "category": it.Category, "price": satang(it.Price), "redTag": it.RedTag,
		"currentPrice": satang(cur), "memberPrice": member, "available": st.Available, "perBuyerLimit": it.PerBuyerLimit,
		"inBuilder": it.InBuilder, "specs": specs,
	}
}

func (srv *Server) meJSON(ctx context.Context, u *store.User) (map[string]any, error) {
	now := srv.S.Clock.Now()
	tier, spend, err := srv.S.TierOf(ctx, u, now)
	if err != nil {
		return nil, err
	}
	var next any
	var toNext any
	switch tier {
	case pricing.TierGeneral:
		next, toNext = "SILVER", satang(20000-spend)
	case pricing.TierSilver:
		next, toNext = "GOLD", satang(100000-spend)
	}
	return map[string]any{"code": u.Code, "email": u.Email, "name": u.Name, "phone": u.Phone, "role": u.Role,
		"tier": tier, "memberRate": tier.Rate(), "spend12m": satang(spend), "nextTier": next, "toNextTier": toNext,
		"company": u.Company, "taxId": u.TaxID}, nil
}

func builderJSON(r compat.Result) map[string]any {
	var budget, remaining any
	if r.Budget != nil {
		budget, remaining = satang(*r.Budget), satang(*r.Remaining)
	}
	return map[string]any{"total": satang(r.Total), "budget": budget, "remaining": remaining, "overBudget": r.OverBudget,
		"assemblyFee": satang(r.AssemblyFee), "missingCategories": r.MissingCategories, "conflicts": r.Conflicts,
		"warnings": r.Warnings, "options": r.Options, "canAddToCart": r.CanAddToCart}
}

func (srv *Server) evaluate(b store.BuildInput) compat.Result {
	now := srv.S.Clock.Now()
	var budget *int64
	if b.Budget != nil {
		v := *b.Budget / 100
		budget = &v
	}
	return compat.Evaluate(b.PartMap(), budget, b.Assembly, func(p pricing.Product) int64 { return pricing.UnitPrice(p, now, srv.S.BugMode) })
}

// ---------- routes ----------

func (srv *Server) routes() {
	m := srv.mux
	m.HandleFunc("GET /api/health", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) { return map[string]any{"ok": true}, nil }))

	// test endpoints (API-CONTRACT 2)
	if srv.TestMode {
		m.HandleFunc("POST /api/test/reset", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
			if err := srv.S.Reset(r.Context()); err != nil {
				return nil, err
			}
			srv.S.Clock.Set(store.DefaultNow, false)
			return map[string]any{"ok": true}, nil
		}))
		m.HandleFunc("POST /api/test/clock", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
			var in struct {
				Now     string `json:"now"`
				Running bool   `json:"running"`
			}
			if err := decode(r, &in); err != nil {
				return nil, err
			}
			t, err := time.Parse(time.RFC3339, in.Now)
			if err != nil {
				return nil, store.E(http.StatusBadRequest, "INVALID_TIME", "ต้องเป็นเวลา ISO 8601 เช่น 2026-11-13T12:00:00+07:00")
			}
			srv.S.Clock.Set(t, in.Running)
			if err := srv.S.Maintain(r.Context()); err != nil {
				return nil, err
			}
			return map[string]any{"ok": true, "now": iso(srv.S.Clock.Now())}, nil
		}))
		m.HandleFunc("GET /api/test/clock", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
			return map[string]any{"now": iso(srv.S.Clock.Now()), "running": srv.S.Clock.Running()}, nil
		}))
		m.HandleFunc("GET /api/test/bug-mode", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
			return map[string]any{"bugMode": srv.S.BugMode}, nil
		}))
	}

	m.HandleFunc("GET /api/time", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		now := srv.S.Clock.Now()
		ends, next := pricing.FlashWindow(now)
		active := pricing.FlashActive(now, srv.S.BugMode)
		var endsAt any
		if active {
			endsAt = iso(ends)
		}
		return map[string]any{"now": iso(now), "flash": map[string]any{"active": active, "endsAt": endsAt, "nextStart": iso(next)}}, nil
	}))

	// products
	m.HandleFunc("GET /api/products", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		u, err := srv.user(r)
		if err != nil {
			return nil, err
		}
		now := srv.S.Clock.Now()
		tier, _, err := srv.S.TierOf(r.Context(), u, now)
		if err != nil {
			return nil, err
		}
		st, err := srv.S.StockMap(r.Context())
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, it := range catalog.Items {
			out = append(out, srv.productJSON(it, st[it.SKU], tier, now))
		}
		return out, nil
	}))
	m.HandleFunc("GET /api/products/{sku}", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		it, ok := catalog.BySKU(strings.ToUpper(r.PathValue("sku")))
		if !ok {
			return nil, store.ErrNotFound
		}
		u, err := srv.user(r)
		if err != nil {
			return nil, err
		}
		now := srv.S.Clock.Now()
		tier, _, err := srv.S.TierOf(r.Context(), u, now)
		if err != nil {
			return nil, err
		}
		st, err := srv.S.StockMap(r.Context())
		if err != nil {
			return nil, err
		}
		p := srv.productJSON(it, st[it.SKU], tier, now)
		lot, err := srv.S.NextLot(r.Context(), it.SKU)
		if err != nil {
			return nil, err
		}
		p["nextLot"] = nil
		if lot != nil {
			p["nextLot"] = map[string]any{"qty": lot.Qty, "releaseAt": iso(lot.ReleaseAt)}
		}
		return p, nil
	}))

	// builder
	m.HandleFunc("POST /api/builder/evaluate", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		var b store.BuildInput
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		return builderJSON(srv.evaluate(b)), nil
	}))
	m.HandleFunc("POST /api/builds", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		var b store.BuildInput
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		u, err := srv.user(r)
		if err != nil {
			return nil, err
		}
		code, at, err := srv.S.SaveBuild(r.Context(), u, b)
		if err != nil {
			return nil, err
		}
		return created{map[string]any{"code": code, "savedAt": iso(at)}}, nil
	}))
	m.HandleFunc("GET /api/builds/{code}", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		b, err := srv.S.GetBuild(r.Context(), r.PathValue("code"))
		if err != nil {
			return nil, err
		}
		items := []map[string]any{}
		in := store.BuildInput{Parts: map[string]*string{}, Assembly: b.Assembly}
		for _, it := range b.Items {
			sku := it.SKU
			in.Parts[it.Category] = &sku
			items = append(items, map[string]any{"category": it.Category, "sku": it.SKU, "name": it.Name,
				"priceAtSave": satang(it.PriceAtSave), "currentPrice": satang(it.CurrentPrice), "diff": satang(it.CurrentPrice - it.PriceAtSave), "available": it.Available})
		}
		var budget any
		if b.Budget != nil {
			v := satang(*b.Budget)
			in.Budget, budget = &v, v
		}
		return map[string]any{"code": b.Code, "savedAt": iso(b.SavedAt), "budget": budget, "assembly": b.Assembly, "items": items,
			"evaluation": builderJSON(srv.evaluate(in))}, nil
	}))

	// pricing and orders
	m.HandleFunc("POST /api/quote", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		var in store.OrderInput
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		u, err := srv.user(r)
		if err != nil {
			return nil, err
		}
		q, err := srv.S.Price(r.Context(), u, in)
		if err != nil {
			return nil, err
		}
		return quoteJSON(q), nil
	}))
	m.HandleFunc("POST /api/orders", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		var in store.OrderInput
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		u, err := srv.user(r)
		if err != nil {
			return nil, err
		}
		o, err := srv.S.PlaceOrder(r.Context(), u, in, nil, nil)
		if err != nil {
			return nil, err
		}
		return created{map[string]any{"orderNo": o.No, "status": o.Status, "placedAt": iso(o.PlacedAt), "holdUntil": iso(o.HoldUntil), "quote": quoteJSON(o.Quote)}}, nil
	}))
	m.HandleFunc("GET /api/orders", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		u, err := srv.mustUser(r)
		if err != nil {
			return nil, err
		}
		os, err := srv.S.MyOrders(r.Context(), u)
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, o := range os {
			out = append(out, map[string]any{"orderNo": o.No, "status": o.Status, "placedAt": iso(o.PlacedAt), "total": satang(o.Quote.Total)})
		}
		return out, nil
	}))
	m.HandleFunc("GET /api/orders/{no}", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		o, err := srv.ownOrder(r)
		if err != nil {
			return nil, err
		}
		return srv.orderJSON(o), nil
	}))
	m.HandleFunc("POST /api/orders/{no}/pay", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		o, err := srv.ownOrder(r)
		if err != nil {
			return nil, err
		}
		var in struct {
			Method string `json:"method"`
		}
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		o, err = srv.S.Pay(r.Context(), o.No, in.Method)
		if err != nil {
			return nil, err
		}
		return map[string]any{"status": o.Status, "paidAt": isoP(o.PaidAt)}, nil
	}))
	m.HandleFunc("POST /api/orders/{no}/cancel", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		o, err := srv.ownOrder(r)
		if err != nil {
			return nil, err
		}
		o, refund, err := srv.S.Cancel(r.Context(), o.No)
		if err != nil {
			return nil, err
		}
		return map[string]any{"status": o.Status, "refund": satang(refund)}, nil
	}))
	m.HandleFunc("POST /api/orders/{no}/return", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		o, err := srv.ownOrder(r)
		if err != nil {
			return nil, err
		}
		var in struct {
			Opened bool `json:"opened"`
		}
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		o, refund, fee, err := srv.S.Return(r.Context(), o.No, in.Opened)
		if err != nil {
			return nil, err
		}
		return map[string]any{"status": o.Status, "refund": satang(refund), "fee": satang(fee)}, nil
	}))
	m.HandleFunc("GET /api/orders/{no}/invoice", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		o, err := srv.ownOrder(r)
		if err != nil {
			return nil, err
		}
		inv, err := srv.S.Invoice(r.Context(), o.No)
		if err != nil {
			return nil, err
		}
		q := quoteJSON(pricing.Quote{Lines: inv.Lines})
		return map[string]any{"invoiceNo": inv.No, "orderNo": inv.OrderNo, "issuedAt": iso(inv.IssuedAt),
			"buyer": map[string]any{"name": inv.Name, "company": inv.Company, "taxId": inv.Tax},
			"lines": q["lines"], "total": satang(inv.Total), "vat": inv.VAT, "preVat": inv.PreVAT}, nil
	}))

	// quotations
	m.HandleFunc("POST /api/quotes", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		var in struct {
			Items  []store.Item `json:"items"`
			Coupon *string      `json:"coupon"`
		}
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		u, err := srv.mustUser(r)
		if err != nil {
			return nil, err
		}
		qt, err := srv.S.CreateQuote(r.Context(), u, in.Items, in.Coupon)
		if err != nil {
			return nil, err
		}
		return created{srv.quotationJSON(qt)}, nil
	}))
	m.HandleFunc("GET /api/quotes", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		u, err := srv.mustUser(r)
		if err != nil {
			return nil, err
		}
		qs, err := srv.S.MyQuotes(r.Context(), u)
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, q := range qs {
			out = append(out, srv.quotationJSON(q))
		}
		return out, nil
	}))
	m.HandleFunc("GET /api/quotes/{no}", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		u, err := srv.mustUser(r)
		if err != nil {
			return nil, err
		}
		qt, err := srv.S.GetQuote(r.Context(), r.PathValue("no"))
		if err != nil {
			return nil, err
		}
		if qt.UserID != u.ID && u.Role == "customer" {
			return nil, store.ErrNotFound
		}
		return srv.quotationJSON(qt), nil
	}))
	m.HandleFunc("POST /api/quotes/{no}/order", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		var in store.OrderInput
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		u, err := srv.mustUser(r)
		if err != nil {
			return nil, err
		}
		o, err := srv.S.OrderFromQuote(r.Context(), u, r.PathValue("no"), in)
		if err != nil {
			return nil, err
		}
		return created{map[string]any{"orderNo": o.No, "status": o.Status, "placedAt": iso(o.PlacedAt), "holdUntil": iso(o.HoldUntil), "quote": quoteJSON(o.Quote)}}, nil
	}))

	// account
	m.HandleFunc("POST /api/auth/register", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		var in store.RegisterInput
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		u, token, err := srv.S.Register(r.Context(), in)
		if err != nil {
			return nil, err
		}
		setSession(w, token)
		me, err := srv.meJSON(r.Context(), u)
		return created{me}, err
	}))
	m.HandleFunc("POST /api/auth/login", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		var in struct{ Email, Password string }
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		u, token, err := srv.S.Login(r.Context(), in.Email, in.Password)
		if err != nil {
			return nil, err
		}
		setSession(w, token)
		return srv.meJSON(r.Context(), u)
	}))
	m.HandleFunc("POST /api/auth/logout", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		if c, err := r.Cookie("bb_session"); err == nil {
			srv.S.Logout(r.Context(), c.Value)
		}
		http.SetCookie(w, &http.Cookie{Name: "bb_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
		return map[string]any{"ok": true}, nil
	}))
	m.HandleFunc("GET /api/me", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		u, err := srv.mustUser(r)
		if err != nil {
			return nil, err
		}
		return srv.meJSON(r.Context(), u)
	}))

	// back office
	m.HandleFunc("GET /api/admin/stock", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		if _, err := srv.staff(r); err != nil {
			return nil, err
		}
		st, err := srv.S.AdminStock(r.Context())
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, x := range st {
			out = append(out, map[string]any{"sku": x.SKU, "name": x.Name, "onHand": x.OnHand, "held": x.Held, "available": x.Available, "redTag": x.RedTag, "perBuyerLimit": x.PerBuyerLimit})
		}
		return out, nil
	}))
	m.HandleFunc("POST /api/admin/store-sale", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		u, err := srv.staff(r)
		if err != nil {
			return nil, err
		}
		var in struct {
			SKU          string  `json:"sku"`
			Qty          int     `json:"qty"`
			CustomerCode *string `json:"customerCode"`
		}
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		if in.Qty == 0 {
			in.Qty = 1
		}
		left, err := srv.S.StoreSale(r.Context(), u, in.SKU, in.Qty, in.CustomerCode)
		if err != nil {
			return nil, err
		}
		return map[string]any{"sku": strings.ToUpper(in.SKU), "available": left}, nil
	}))
	m.HandleFunc("GET /api/admin/lots", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		if _, err := srv.staff(r); err != nil {
			return nil, err
		}
		ls, err := srv.S.AdminLots(r.Context())
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, l := range ls {
			out = append(out, map[string]any{"code": l.Code, "sku": l.SKU, "qty": l.Qty, "releaseAt": iso(l.ReleaseAt), "released": l.Released})
		}
		return out, nil
	}))
	m.HandleFunc("POST /api/admin/lots", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		if _, err := srv.staff(r); err != nil {
			return nil, err
		}
		var in struct {
			SKU       string `json:"sku"`
			Qty       int    `json:"qty"`
			ReleaseAt string `json:"releaseAt"`
		}
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		at, err := time.Parse(time.RFC3339, in.ReleaseAt)
		if err != nil {
			return nil, store.E(http.StatusBadRequest, "INVALID_LOT", "เวลาเปิดขายต้องเป็นรูปแบบ ISO 8601 เช่น 2026-11-14T10:00:00+07:00")
		}
		l, err := srv.S.ScheduleLot(r.Context(), in.SKU, in.Qty, at)
		if err != nil {
			return nil, err
		}
		return created{map[string]any{"code": l.Code, "sku": l.SKU, "qty": l.Qty, "releaseAt": iso(l.ReleaseAt), "released": false}}, nil
	}))
	m.HandleFunc("GET /api/admin/orders", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		if _, err := srv.staff(r); err != nil {
			return nil, err
		}
		os, err := srv.S.AdminOrders(r.Context(), r.URL.Query().Get("status"), r.URL.Query().Get("date"))
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, o := range os {
			out = append(out, srv.orderJSON(o))
		}
		return out, nil
	}))
	m.HandleFunc("POST /api/admin/orders/{no}/status", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		if _, err := srv.staff(r); err != nil {
			return nil, err
		}
		var in struct {
			Status string `json:"status"`
		}
		if err := decode(r, &in); err != nil {
			return nil, err
		}
		o, err := srv.S.SetStatus(r.Context(), r.PathValue("no"), strings.ToUpper(in.Status))
		if err != nil {
			return nil, err
		}
		return srv.orderJSON(o), nil
	}))
	m.HandleFunc("POST /api/admin/refunds/{id}/done", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) {
		if _, err := srv.staff(r); err != nil {
			return nil, err
		}
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			return nil, store.ErrNotFound
		}
		at, err := srv.S.RefundDone(r.Context(), id)
		if err != nil {
			return nil, err
		}
		return map[string]any{"id": id, "status": "DONE", "refundedAt": isoP(at)}, nil
	}))

	m.HandleFunc("/api/", srv.h(func(w http.ResponseWriter, r *http.Request) (any, error) { return nil, store.ErrNotFound }))
}

func setSession(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: "bb_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 30 * 24 * 3600})
}

// ownOrder: the buyer (logged in), staff, or a guest who knows the phone number (?phone=).
func (srv *Server) ownOrder(r *http.Request) (*store.Order, error) {
	o, err := srv.S.GetOrder(r.Context(), r.PathValue("no"))
	if err != nil {
		return nil, err
	}
	u, err := srv.user(r)
	if err != nil {
		return nil, err
	}
	switch {
	case u != nil && (u.Role == "staff" || u.Role == "owner"):
		return o, nil
	case u != nil && o.UserID != nil && *o.UserID == u.ID:
		return o, nil
	case o.UserID == nil && digitsOnly(r.URL.Query().Get("phone")) != "" && digitsOnly(r.URL.Query().Get("phone")) == digitsOnly(o.Phone):
		return o, nil
	}
	return nil, store.ErrNotFound
}

func digitsOnly(s string) string {
	var b strings.Builder
	for _, c := range s {
		if c >= '0' && c <= '9' {
			b.WriteRune(c)
		}
	}
	return b.String()
}

func (srv *Server) quotationJSON(q *store.Quotation) map[string]any {
	return map[string]any{"quoteNo": q.No, "issuedAt": iso(q.IssuedAt), "validUntil": iso(q.ValidUntil),
		"expired": srv.S.Clock.Now().After(q.ValidUntil), "quote": quoteJSON(q.Quote)}
}
