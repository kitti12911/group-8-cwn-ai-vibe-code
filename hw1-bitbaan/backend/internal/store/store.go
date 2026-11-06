// Package store is the database layer (DESIGN.md internal/store). Money in the DB is NUMERIC;
// in Go it is int64 baht (whole) or int64 satang where fractions exist (VAT).
package store

import (
	"context"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"bitbaan/backend/internal/clock"
	"bitbaan/backend/internal/pricing"
)

//go:embed schema.sql
var schemaSQL string

type Store struct {
	Pool    *pgxpool.Pool
	Clock   *clock.Clock
	BugMode int
}

// AppError becomes `{ "error": Code, "message": Message, ...Extra }` with HTTP Status (API-CONTRACT 1).
type AppError struct {
	Status  int
	Code    string
	Message string
	Extra   map[string]any
}

func (e *AppError) Error() string { return e.Code + ": " + e.Message }

func E(status int, code, msg string) *AppError { return &AppError{Status: status, Code: code, Message: msg} }

var (
	ErrNotFound      = E(http.StatusNotFound, "NOT_FOUND", "ไม่พบข้อมูล")
	ErrLoginRequired = E(http.StatusUnauthorized, "LOGIN_REQUIRED", "กรุณาเข้าสู่ระบบ")
	ErrForbidden     = E(http.StatusForbidden, "FORBIDDEN", "ไม่มีสิทธิ์")
)

func isUnique(err error, index string) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505" && (index == "" || pe.ConstraintName == index)
}

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ---------- reset & maintenance ----------

var seedHash []byte

// Reset drops everything and seeds TEST-DATA.md (NFR-07).
func (s *Store) Reset(ctx context.Context) error {
	if seedHash == nil {
		h, err := bcrypt.GenerateFromPassword([]byte("Bit12345"), bcrypt.MinCost)
		if err != nil {
			return err
		}
		seedHash = h
	}
	conn, err := s.Pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); err != nil {
		return fmt.Errorf("drop: %w", err)
	}
	if _, err := conn.Exec(ctx, schemaSQL); err != nil {
		return fmt.Errorf("schema: %w", err)
	}
	return seed(ctx, conn.Conn(), string(seedHash))
}

// HasSchema reports whether the database was already initialised.
func (s *Store) HasSchema(ctx context.Context) bool {
	var ok bool
	_ = s.Pool.QueryRow(ctx, "SELECT to_regclass('public.products') IS NOT NULL").Scan(&ok)
	return ok
}

// Maintain releases new lots whose time has come and expires holds past 30:00 (FR-41, BR-34).
// Safe to call any time; runs every second and before every API request.
func (s *Store) Maintain(ctx context.Context) error {
	now := s.Clock.Now()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `UPDATE product_lots SET released = true WHERE NOT released AND release_at <= $1 RETURNING sku, qty`, now)
	if err != nil {
		return err
	}
	type lot struct {
		sku string
		qty int
	}
	var lots []lot
	for rows.Next() {
		var l lot
		if err := rows.Scan(&l.sku, &l.qty); err != nil {
			return err
		}
		lots = append(lots, l)
	}
	rows.Close()
	for _, l := range lots {
		if _, err := tx.Exec(ctx, `UPDATE products SET available = available + $2, on_hand = on_hand + $2 WHERE sku = $1`, l.sku, l.qty); err != nil {
			return err
		}
	}
	cutoff := s.holdCutoff(now)
	ids := []string{}
	rows, err = tx.Query(ctx, `SELECT id::text FROM orders WHERE status = 'PENDING' AND hold_until < $1 ORDER BY id FOR UPDATE SKIP LOCKED`, cutoff)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	for _, id := range ids {
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'EXPIRED', expired_at = $2 WHERE id = $1`, id, now); err != nil {
			return err
		}
		if err := releaseOrder(ctx, tx, id); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// holdCutoff: a PENDING order may be paid while hold_until >= cutoff (BR-30, A-17).
func (s *Store) holdCutoff(now time.Time) time.Time {
	if s.BugMode == 1 {
		return now.Truncate(time.Minute) // BUG_MODE=1: see BUGS.md #3
	}
	return now
}

// releaseOrder gives stock, the per-buyer claim and the coupon back (expire / cancel).
func releaseOrder(ctx context.Context, tx pgx.Tx, orderID string) error {
	if _, err := tx.Exec(ctx, `UPDATE products p SET available = p.available + i.qty FROM order_items i WHERE i.order_id = $1 AND i.sku = p.sku`, orderID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE limited_claims SET status = 'released' WHERE order_id = $1`, orderID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE coupon_redemptions SET status = 'released' WHERE order_id = $1`, orderID)
	return err
}

// nextNumber returns PREFIX-YYMMDD-NNNN using the counters table (FR-58).
func nextNumber(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, prefix string, at time.Time) (string, error) {
	p := prefix + "-" + at.In(clock.TZ).Format("060102")
	var n int
	err := q.QueryRow(ctx, `INSERT INTO counters (prefix, n) VALUES ($1, 1) ON CONFLICT (prefix) DO UPDATE SET n = counters.n + 1 RETURNING n`, p).Scan(&n)
	return fmt.Sprintf("%s-%04d", p, n), err
}

// ---------- users ----------

type User struct {
	ID         string
	Code       *string
	Email      string
	Name       string
	Phone      string
	Role       string
	IsBusiness bool
	TaxID      *string
	Company    *string
}

const userCols = `id::text, code, email, name, phone, role, is_business, tax_id, company_name`

func scanUser(r pgx.Row) (*User, error) {
	var u User
	if err := r.Scan(&u.ID, &u.Code, &u.Email, &u.Name, &u.Phone, &u.Role, &u.IsBusiness, &u.TaxID, &u.Company); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (s *Store) UserByCode(ctx context.Context, code string) (*User, error) {
	return scanUser(s.Pool.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE code = $1`, code))
}

func (s *Store) UserBySession(ctx context.Context, token string) (*User, error) {
	return scanUser(s.Pool.QueryRow(ctx, `SELECT `+prefixed("u", userCols)+` FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`, token))
}

func prefixed(alias, cols string) string {
	parts := strings.Split(cols, ", ")
	for i, p := range parts {
		parts[i] = alias + "." + p
	}
	return strings.Join(parts, ", ")
}

func (s *Store) Login(ctx context.Context, email, password string) (*User, string, error) {
	var hash string
	var id string
	err := s.Pool.QueryRow(ctx, `SELECT id::text, password_hash FROM users WHERE lower(email) = lower($1)`, strings.TrimSpace(email)).Scan(&id, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return nil, "", E(http.StatusUnauthorized, "INVALID_LOGIN", "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
	}
	return s.newSession(ctx, id)
}

func (s *Store) newSession(ctx context.Context, userID string) (*User, string, error) {
	token := randomToken(24)
	if _, err := s.Pool.Exec(ctx, `INSERT INTO sessions (token, user_id) VALUES ($1, $2)`, token, userID); err != nil {
		return nil, "", err
	}
	u, err := scanUser(s.Pool.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE id = $1`, userID))
	return u, token, err
}

func (s *Store) Logout(ctx context.Context, token string) {
	_, _ = s.Pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
}

type RegisterInput struct {
	Email    string  `json:"email"`
	Password string  `json:"password"`
	Name     string  `json:"name"`
	Phone    string  `json:"phone"`
	Company  *string `json:"company"`
	TaxID    *string `json:"taxId"`
}

// Register creates a member; with a tax ID it is a Business account at once (FR-56, BR-40).
func (s *Store) Register(ctx context.Context, in RegisterInput) (*User, string, error) {
	in.Email = strings.TrimSpace(in.Email)
	if in.Email == "" || !strings.Contains(in.Email, "@") || len(in.Password) < 6 || strings.TrimSpace(in.Name) == "" {
		return nil, "", E(http.StatusBadRequest, "INVALID_INPUT", "กรอกชื่อ อีเมล และรหัสผ่านอย่างน้อย 6 ตัว")
	}
	business := in.TaxID != nil && strings.TrimSpace(*in.TaxID) != ""
	if business {
		t := strings.TrimSpace(*in.TaxID)
		if len(t) != 13 || strings.Trim(t, "0123456789") != "" {
			return nil, "", E(http.StatusBadRequest, "INVALID_TAX_ID", "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก")
		}
		in.TaxID = &t
		if in.Company == nil || strings.TrimSpace(*in.Company) == "" {
			return nil, "", E(http.StatusBadRequest, "INVALID_INPUT", "กรอกชื่อบริษัท")
		}
	} else {
		in.TaxID, in.Company = nil, nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}
	var id string
	err = s.Pool.QueryRow(ctx, `INSERT INTO users (email, password_hash, name, phone, is_business, tax_id, company_name)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`, in.Email, string(hash), in.Name, in.Phone, business, in.TaxID, in.Company).Scan(&id)
	if isUnique(err, "") {
		return nil, "", E(http.StatusConflict, "EMAIL_TAKEN", "อีเมลนี้สมัครไว้แล้ว")
	}
	if err != nil {
		return nil, "", err
	}
	return s.newSession(ctx, id)
}

// Spend12m: paid goods in the last 365 days, web + store, current order excluded (BR-04, A-23, T-05).
func (s *Store) Spend12m(ctx context.Context, userID string, now time.Time) (int64, error) {
	var v int64
	err := s.Pool.QueryRow(ctx, `SELECT COALESCE(sum(amount), 0)::bigint FROM spend_ledger
		WHERE user_id = $1 AND occurred_at >= $2 AND occurred_at <= $3`, userID, now.AddDate(0, 0, -365), now).Scan(&v)
	return v, err
}

func (s *Store) TierOf(ctx context.Context, u *User, now time.Time) (pricing.Tier, int64, error) {
	if u == nil {
		return pricing.TierNone, 0, nil
	}
	spend, err := s.Spend12m(ctx, u.ID, now)
	if err != nil {
		return "", 0, err
	}
	return pricing.TierFor(spend, u.IsBusiness), spend, nil
}

// FirstOrder: no paid order that was not cancelled (BR-16).
func (s *Store) FirstOrder(ctx context.Context, u *User) (bool, error) {
	if u == nil {
		return false, nil
	}
	var has bool
	err := s.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM orders WHERE user_id = $1 AND status IN ('PAID','PACKED','SHIPPED','DELIVERED','RETURNED'))`, u.ID).Scan(&has)
	return !has, err
}

func (s *Store) Coupon(ctx context.Context, code string) (*pricing.Coupon, error) {
	var c pricing.Coupon
	err := s.Pool.QueryRow(ctx, `SELECT code, kind, value::bigint, min_amount::bigint, max_discount::bigint, categories, first_order_only, login_required, expires_at
		FROM coupons WHERE code = $1`, strings.ToUpper(strings.TrimSpace(code))).
		Scan(&c.Code, &c.Kind, &c.Value, &c.MinAmount, &c.MaxDiscount, &c.Categories, &c.FirstOrderOnly, &c.LoginRequired, &c.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &c, err
}

// ---------- products ----------

type Stock struct {
	SKU       string
	Available int
	OnHand    int
}

func (s *Store) StockMap(ctx context.Context) (map[string]Stock, error) {
	rows, err := s.Pool.Query(ctx, `SELECT sku, available, on_hand FROM products`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string]Stock{}
	for rows.Next() {
		var st Stock
		if err := rows.Scan(&st.SKU, &st.Available, &st.OnHand); err != nil {
			return nil, err
		}
		m[st.SKU] = st
	}
	return m, rows.Err()
}

type Lot struct {
	Qty       int
	ReleaseAt time.Time
}

func (s *Store) NextLot(ctx context.Context, sku string) (*Lot, error) {
	var l Lot
	err := s.Pool.QueryRow(ctx, `SELECT qty, release_at FROM product_lots WHERE sku = $1 AND NOT released ORDER BY release_at LIMIT 1`, sku).Scan(&l.Qty, &l.ReleaseAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &l, err
}

// AdminLot is one scheduled or released stock lot (FR-06, BR-34).
type AdminLot struct {
	Code      string
	SKU       string
	Qty       int
	ReleaseAt time.Time
	Released  bool
}

func (s *Store) AdminLots(ctx context.Context) ([]AdminLot, error) {
	rows, err := s.Pool.Query(ctx, `SELECT code, sku, qty, release_at, released FROM product_lots ORDER BY release_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminLot{}
	for rows.Next() {
		var l AdminLot
		if err := rows.Scan(&l.Code, &l.SKU, &l.Qty, &l.ReleaseAt, &l.Released); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// ScheduleLot adds a new lot that opens for sale at releaseAt (FR-06). The stock is
// added by Maintain when the time comes, so before that the product cannot be ordered.
func (s *Store) ScheduleLot(ctx context.Context, sku string, qty int, releaseAt time.Time) (*AdminLot, error) {
	sku = strings.ToUpper(strings.TrimSpace(sku))
	var exists bool
	if err := s.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM products WHERE sku = $1)`, sku).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists || qty < 1 || qty > 1000 {
		return nil, E(http.StatusBadRequest, "INVALID_LOT", "ข้อมูลล็อตไม่ถูกต้อง: ต้องมีรหัสสินค้าและจำนวน 1–1,000")
	}
	if !releaseAt.After(s.Clock.Now()) {
		return nil, E(http.StatusBadRequest, "INVALID_LOT", "เวลาเปิดขายต้องอยู่หลังเวลาตอนนี้")
	}
	l := AdminLot{SKU: sku, Qty: qty, ReleaseAt: releaseAt}
	err := s.Pool.QueryRow(ctx, `INSERT INTO product_lots (code, sku, qty, release_at)
		VALUES ('LOT-' || $1 || '-' || (SELECT count(*) + 1 FROM product_lots WHERE sku = $1), $1, $2, $3)
		RETURNING code`, sku, qty, releaseAt).Scan(&l.Code)
	if err != nil {
		return nil, err
	}
	return &l, nil
}
