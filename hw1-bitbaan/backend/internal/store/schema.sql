-- Schema from DESIGN.md section 4. Money is NUMERIC, never float (NFR-05).
-- The cart lives in the browser, so there are no cart tables.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE,                       -- C2..C11, S1, S2 (TEST-DATA.md 2); null for new sign-ups
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'owner')),
  is_business   boolean NOT NULL DEFAULT false,
  tax_id        char(13) CHECK (tax_id ~ '^[0-9]{13}$'),   -- BR-40
  company_name  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  sku              text PRIMARY KEY,
  name             text NOT NULL,
  category         text NOT NULL,
  price            numeric(10,2) NOT NULL,
  red_tag          boolean NOT NULL DEFAULT false,
  on_hand          int NOT NULL CHECK (on_hand >= 0),
  available        int NOT NULL CHECK (available >= 0),   -- last line of defence against overselling (BR-32)
  per_buyer_limit  int,
  in_builder       boolean NOT NULL DEFAULT false,
  sort_order       int NOT NULL
);

CREATE TABLE product_lots (
  id          bigserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  sku         text NOT NULL REFERENCES products(sku),
  qty         int NOT NULL,
  release_at  timestamptz NOT NULL,
  released    boolean NOT NULL DEFAULT false
);

CREATE TABLE spend_ledger (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  amount      numeric(12,2) NOT NULL,
  source      text NOT NULL CHECK (source IN ('web', 'store')),
  occurred_at timestamptz NOT NULL,
  order_id    uuid
);

CREATE TABLE store_sales (
  id          bigserial PRIMARY KEY,
  sku         text NOT NULL REFERENCES products(sku),
  qty         int NOT NULL CHECK (qty >= 1),
  amount      numeric(12,2) NOT NULL,
  staff_id    uuid REFERENCES users(id),
  customer_id uuid REFERENCES users(id),
  sold_at     timestamptz NOT NULL
);

CREATE TABLE builds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code    text NOT NULL UNIQUE,
  owner_id      uuid REFERENCES users(id),
  budget        numeric(12,2),
  want_assembly boolean NOT NULL DEFAULT false,
  saved_at      timestamptz NOT NULL
);

CREATE TABLE build_items (
  build_id      uuid NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  category      text NOT NULL,
  sku           text NOT NULL REFERENCES products(sku),
  price_at_save numeric(10,2) NOT NULL,
  PRIMARY KEY (build_id, category)
);

CREATE TABLE coupons (
  code             text PRIMARY KEY,
  kind             text NOT NULL CHECK (kind IN ('fixed', 'percent')),
  value            numeric(10,2) NOT NULL,
  min_amount       numeric(12,2) NOT NULL DEFAULT 0,
  max_discount     numeric(12,2) NOT NULL DEFAULT 0,
  categories       text[] NOT NULL DEFAULT '{}',
  first_order_only boolean NOT NULL DEFAULT false,
  login_required   boolean NOT NULL DEFAULT false,
  expires_at       timestamptz
);

CREATE TABLE quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_no    text NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES users(id),
  issued_at   timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,              -- BR-39
  total       numeric(12,2) NOT NULL,
  snapshot    jsonb NOT NULL                     -- the priced lines, locked
);

CREATE TABLE quote_items (
  quote_id   uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  sku        text NOT NULL REFERENCES products(sku),
  qty        int NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  PRIMARY KEY (quote_id, sku)
);

CREATE TABLE orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no        text NOT NULL UNIQUE,
  user_id         uuid REFERENCES users(id),
  buyer_name      text NOT NULL,
  buyer_phone     text NOT NULL,
  buyer_email     text NOT NULL,
  buyer_key       text NOT NULL,                 -- user:<id> or phone:<digits> (T-06)
  status          text NOT NULL CHECK (status IN ('PENDING','PAID','PACKED','SHIPPED','DELIVERED','EXPIRED','CANCELLED','RETURNED')),
  placed_at       timestamptz NOT NULL,          -- prices locked here (BR-09)
  hold_until      timestamptz NOT NULL,          -- placed_at + 30 minutes (BR-30)
  paid_at         timestamptz,
  packed_at       timestamptz,
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  cancelled_at    timestamptz,
  returned_at     timestamptz,
  expired_at      timestamptz,
  shipping_method text NOT NULL,
  address_line    text,
  province        text,
  coupon_code     text REFERENCES coupons(code),
  quote_id        uuid REFERENCES quotes(id),
  list_total      numeric(12,2) NOT NULL,
  flash_discount  numeric(12,2) NOT NULL,
  bundle_discount numeric(12,2) NOT NULL,
  member_rate     numeric(5,2) NOT NULL,
  member_discount numeric(12,2) NOT NULL,
  coupon_discount numeric(12,2) NOT NULL,
  goods_total     numeric(12,2) NOT NULL,        -- G4
  assembly_fee    numeric(10,2) NOT NULL,
  shipping_fee    numeric(10,2) NOT NULL,
  total           numeric(12,2) NOT NULL,
  snapshot        jsonb NOT NULL                 -- full Quote as priced at placed_at
);

CREATE TABLE order_items (
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku             text NOT NULL REFERENCES products(sku),
  qty             int NOT NULL CHECK (qty >= 1),
  unit_list_price numeric(10,2) NOT NULL,
  unit_price      numeric(10,2) NOT NULL,
  PRIMARY KEY (order_id, sku)
);

CREATE TABLE payments (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),   -- pay once (FR-43)
  amount   numeric(12,2) NOT NULL,
  method   text NOT NULL,
  paid_at  timestamptz NOT NULL
);

CREATE TABLE limited_claims (
  id        bigserial PRIMARY KEY,
  lot_id    bigint NOT NULL REFERENCES product_lots(id),
  buyer_key text NOT NULL,
  order_id  uuid NOT NULL REFERENCES orders(id),
  status    text NOT NULL CHECK (status IN ('held', 'paid', 'released'))
);
-- one per buyer per lot (BR-31): two tabs at once, the second hits this index
CREATE UNIQUE INDEX one_claim_per_buyer_per_lot ON limited_claims (lot_id, buyer_key) WHERE status IN ('held', 'paid');

CREATE TABLE coupon_redemptions (
  id       bigserial PRIMARY KEY,
  code     text NOT NULL REFERENCES coupons(code),
  user_id  uuid REFERENCES users(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  status   text NOT NULL CHECK (status IN ('held', 'paid', 'released'))
);
-- NEWBIT200 once per account (BR-17)
CREATE UNIQUE INDEX one_first_order_coupon ON coupon_redemptions (user_id) WHERE code = 'NEWBIT200' AND status IN ('held', 'paid');

CREATE TABLE refunds (
  id           bigserial PRIMARY KEY,
  order_id     uuid NOT NULL REFERENCES orders(id),
  kind         text NOT NULL CHECK (kind IN ('CANCEL', 'RETURN')),
  amount       numeric(12,2) NOT NULL,
  fee          numeric(12,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE')),
  requested_at timestamptz NOT NULL,
  refunded_at  timestamptz
);

CREATE TABLE tax_invoices (
  id           bigserial PRIMARY KEY,
  order_id     uuid NOT NULL UNIQUE REFERENCES orders(id),
  invoice_no   text NOT NULL UNIQUE,
  issued_at    timestamptz NOT NULL,
  buyer_name   text NOT NULL,
  company_name text,
  tax_id       char(13),
  base_amount  numeric(12,2) NOT NULL,
  vat          numeric(12,2) NOT NULL,
  total        numeric(12,2) NOT NULL,
  CHECK (base_amount + vat = total)
);

-- per-day running numbers for BB-YYMMDD-NNNN, Q-YYMMDD-NNNN, INV-YYMMDD-NNNN (FR-58)
CREATE TABLE counters (
  prefix text PRIMARY KEY,
  n      int NOT NULL
);
