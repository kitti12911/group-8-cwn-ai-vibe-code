# API Contract · บิตบ้าน คอมพิวเตอร์

สัญญาระหว่าง `frontend/` (Vite + React) · `backend/` (Go) · test (Playwright) · oracle (การบ้านขั้น 3)
ทำตามรูปแบบของ `06_homework/01_coworking-testplan/API-CONTRACT.md` (เงินเป็นสตางค์ · error มี `error` + `message` · `X-Test-User` · `data-testid`) แต่ endpoint เป็นของร้านคอมพิวเตอร์

> ห้ามเปลี่ยนชื่อ รูปแบบ หรือความหมายของสิ่งที่อยู่ในไฟล์นี้โดยไม่แก้ไฟล์นี้ก่อน · เพิ่มของใหม่ได้

## 1. พื้นฐาน

| เรื่อง | ค่า |
| --- | --- |
| เว็บ | `http://localhost:3000` (container `bitbaan-frontend` · nginx ส่ง `/api/*` ต่อให้ `bitbaan-backend:8080`) |
| ฐานข้อมูล | PostgreSQL 16 container `bitbaan-db` · พอร์ตเครื่องเรา `5434` |
| เวลา | ISO 8601 พร้อม offset `+07:00` เสมอ เช่น `2026-11-13T12:30:00+07:00` |
| เงิน | หน่วย **สตางค์ (integer)** ทุกจุดใน API · ราคาสินค้า ส่วนลด และยอดชำระเป็นบาทเต็มเสมอ (หาร 100 ลงตัว) · มีแค่ `vat` และ `preVat` ที่มีเศษสตางค์ |
| ผู้ใช้ | ล็อกอินด้วย cookie `bb_session` (จาก `POST /api/auth/login`) · หรือส่ง header `X-Test-User: <code>` เช่น `C3`, `S1` แทนการล็อกอิน (เฉพาะ `TEST_MODE=1`) · ไม่มีทั้งคู่ = ลูกค้าไม่ล็อกอิน |
| error | HTTP 4xx + `{ "error": "<CODE>", "message": "<ข้อความไทย>" }` · บาง error มีฟิลด์เพิ่ม เช่น `sku` |
| รหัสลูกค้า | `C1` ไม่มีบัญชี (ใช้แบบไม่ล็อกอิน) · `C2`–`C11` · พนักงาน `S1` · เจ้าของ `S2` ตาม `TEST-DATA.md` ข้อ 2 |

### ค่าคงที่

| ชื่อ | ค่า |
| --- | --- |
| หมวดสินค้า `category` | `CPU` `MB` `RAM` `GPU` `SSD` `PSU` `CASE` `MON` |
| หมวดในหน้าจัดสเปก | `cpu` `mb` `ram` `gpu` `ssd` `psu` `case` (ตัวเล็ก ใช้เป็น key ของ `parts`) |
| ระดับ `tier` | `GENERAL` `SILVER` `GOLD` `BUSINESS` · ไม่ล็อกอิน = `null` |
| วิธีส่ง `shipping` | `standard` `express` `pickup` |
| สถานะออเดอร์ `status` | `PENDING` (รอจ่าย กันของอยู่) `PAID` `PACKED` `SHIPPED` `DELIVERED` `EXPIRED` `CANCELLED` `RETURNED` |
| จังหวัดที่ส่งด่วนได้ | `กรุงเทพมหานคร` เท่านั้น |

## 2. endpoint สำหรับทดสอบ (มีเฉพาะ `TEST_MODE=1`)

| method | path | body | ตอบ |
| --- | --- | --- | --- |
| POST | `/api/test/reset` | — | ล้างข้อมูลแล้ว seed ใหม่ตาม `TEST-DATA.md` · เวลาเว็บกลับเป็น `2026-11-13T10:00:00+07:00` แบบหยุดนิ่ง · `{ "ok": true }` |
| POST | `/api/test/clock` | `{ "now": "<ISO>", "running"?: false }` | ตั้งเวลาเว็บ · `running: true` = เดินต่อจากค่านั้นตามเวลาจริง · ทำงานปล่อยของหมดเวลาและเปิดล็อตใหม่ทันที · `{ "ok": true, "now": "<ISO>" }` |
| GET | `/api/test/clock` | — | `{ "now": "<ISO>", "running": bool }` |
| GET | `/api/test/bug-mode` | — | `{ "bugMode": 0 \| 1 \| 2 }` |

## 3. endpoint ของระบบ

### 3.1 เวลาและสินค้า

| method | path | ตอบ |
| --- | --- | --- |
| GET | `/api/time` | `{ "now": "<ISO>", "flash": { "active": bool, "endsAt": "<ISO>" \| null, "nextStart": "<ISO>" } }` · หน้าเว็บใช้นับถอยหลังจากเวลานี้ ไม่ใช่นาฬิกาเครื่อง (NFR-16) |
| GET | `/api/products` | `[Product]` |
| GET | `/api/products/:sku` | `Product` + `"nextLot": { "qty", "releaseAt" } \| null` · ไม่พบ `404 NOT_FOUND` |

```json
Product = {
  "sku": "MB-B6", "name": "เมนบอร์ด B6-Lite", "category": "MB",
  "price": 459000, "redTag": true,
  "currentPrice": 413100,          // ราคาตอนนี้ (หลัง flash ถ้าอยู่ในช่วง)
  "memberPrice": 400800 | null,    // currentPrice หลังส่วนลดสมาชิกของคนที่ล็อกอิน (FR-59) · ไม่ล็อกอิน = null
  "available": 6, "perBuyerLimit": null | 1, "inBuilder": true,
  "specs": { "socket": "NX-1", "ramType": "DDR4", "formFactor": "mATX",
             "caseSupports": [], "gpuLengthMm": null, "caseMaxGpuMm": null,
             "tdpW": null, "recommendedPsuW": null, "psuOutputW": null }
}
```

### 3.2 หน้าจัดสเปกและลิงก์สเปก

| method | path | body | ตอบ |
| --- | --- | --- | --- |
| POST | `/api/builder/evaluate` | `{ "parts": { "cpu": "CPU-N5" \| null, "mb", "ram", "gpu", "ssd", "psu", "case" }, "budget"?: <สตางค์>, "assembly": bool }` | `BuilderResult` · ไม่บันทึกอะไร |
| POST | `/api/builds` | เหมือน evaluate | `201` `{ "code": "<8 ตัว>", "savedAt" }` |
| GET | `/api/builds/:code` | — | `{ "code", "savedAt", "budget", "assembly", "items": [{ "category", "sku", "name", "priceAtSave", "currentPrice", "diff", "available" }], "evaluation": BuilderResult }` · ไม่พบ `404 NOT_FOUND` |

```json
BuilderResult = {
  "total": 2343000,                 // ผลรวม currentPrice ของชิ้นที่เลือก (BR-35)
  "budget": 3500000 | null, "remaining": 1157000 | null, "overBudget": false,
  "assemblyFee": 50000, "missingCategories": ["ram", "ssd", "psu"],
  "conflicts": [{ "categories": ["cpu", "mb"], "code": "SOCKET_MISMATCH", "message": "socket ไม่ตรง: CPU ใช้ NX-1 บอร์ดใช้ NX-2" }],
  "warnings":  [{ "code": "PSU_LOW", "message": "พาวเวอร์อาจไม่พอ: 550W < ที่การ์ดจอแนะนำ 750W", "suggestSku": "PSU-750" }],
  "options": { "ram": [{ "sku": "RAM-16", "allowed": false, "reason": "บอร์ดนี้รับ DDR4" }], "...": [] },
  "canAddToCart": true              // false เมื่อมี conflicts (FR-12) · warnings ไม่บล็อก (FR-13)
}
```

รหัส conflict: `SOCKET_MISMATCH` (BR-25) · `RAM_MISMATCH` (BR-26) · `GPU_TOO_LONG` (BR-27) · `FORM_FACTOR` (BR-28) · warning: `PSU_LOW` (BR-29)

### 3.3 ราคา (ไม่บันทึก) และออเดอร์

| method | path | body / query | ตอบ |
| --- | --- | --- | --- |
| POST | `/api/quote` | `OrderInput` | `Quote` · ไม่บันทึกอะไร · โค้ดที่ใช้ไม่ได้ไม่ทำให้ error แต่ `coupon.status = "REJECTED"` |
| POST | `/api/orders` | `OrderInput` + `"guest"?: { "name", "phone", "email" }` + `"address"?: { "line", "province" }` | `201` `{ "orderNo": "BB-261113-0001", "status": "PENDING", "placedAt", "holdUntil", "quote": Quote }` |
| GET | `/api/orders` | (ต้องล็อกอิน) | `[OrderSummary]` ของฉัน ใหม่สุดก่อน |
| GET | `/api/orders/:no` | `?phone=` สำหรับคนไม่ล็อกอิน · ใช้กับทุก path ใต้ `/api/orders/:no` (pay, cancel, return, invoice) ด้วย | `Order` · ไม่ใช่ของตัวเอง `404 NOT_FOUND` |
| POST | `/api/orders/:no/pay` | `{ "method": "promptpay" \| "card" }` | `{ "status": "PAID", "paidAt" }` · จ่ายซ้ำได้ผลเดิมไม่ตัดเงินซ้ำ (FR-43) |
| POST | `/api/orders/:no/cancel` | — | `{ "status": "CANCELLED", "refund": <สตางค์> }` |
| POST | `/api/orders/:no/return` | `{ "opened": bool }` | `{ "status": "RETURNED", "refund": <สตางค์>, "fee": <สตางค์> }` |
| GET | `/api/orders/:no/invoice` | — | `{ "invoiceNo", "orderNo", "issuedAt", "buyer": { "name", "company", "taxId" }, "lines": [...], "total", "vat", "preVat" }` · ยังไม่จ่าย `409 NOT_PAID` |

```json
OrderInput = {
  "items": [{ "sku": "CPU-N5", "qty": 1 }],
  "coupon"?: "NEWBIT200",
  "shipping": "standard",
  "province"?: "กรุงเทพมหานคร",     // ต้องมีเมื่อ shipping = express
  "assembly"?: false                // ให้ร้านประกอบ (ค่าประกอบตาม BR-21: 0 ถ้ามีครบ 7 หมวดในหน้าจัดสเปก หมวดละ 1 ชิ้น)
}

Quote = {
  "pricedAt": "<ISO>",
  "lines": [{ "sku", "name", "category", "qty", "unitPrice", "unitFlashPrice": 413100 | null, "amount" }],
  "listTotal": 1088000, "flashDiscount": 45900, "g1": 1042100,
  "bundles": 1, "bundleDiscount": 50000, "g2": 992100,
  "tier": "SILVER", "memberRate": 3, "memberDiscount": 29700, "g3": 962400,
  "coupon": { "code": "GAMER5" | null, "status": "APPLIED" | "REJECTED" | "NONE", "reason": "<ไทย>" | null, "amount": 0 },
  "g4": 962400, "assemblyFee": 0, "shippingFee": 0,
  "total": 962400, "vat": 62961, "preVat": 899439
}
```

**กติกาของรูปแบบนี้:** `g1 = listTotal − flashDiscount` · `g2 = g1 − bundleDiscount` · `g3 = g2 − memberDiscount` · `g4 = g3 − coupon.amount` · `total = g4 + assemblyFee + shippingFee` · `preVat = total − vat` · กติกาคิดเงินอยู่ใน `REQUIREMENTS.md` ข้อ 2.2–2.4 และ BR-40

```json
Order = {
  "orderNo", "status", "placedAt", "holdUntil", "paidAt", "packedAt", "shippedAt", "deliveredAt", "cancelledAt", "returnedAt",
  "buyer": { "code": "C3" | null, "name", "phone", "email" },
  "shipping", "address": { "line", "province" } | null,
  "quote": Quote,                   // ราคาที่ล็อกตอนกดสั่ง (BR-09)
  "canCancel": bool, "canReturn": bool, "returnUntil": "<ISO>" | null,
  "returnPreview": { "unopened": { "refund", "fee" }, "opened": { "refund", "fee" } } | null,   // FR-48 · มีเมื่อ canReturn
  "refunds": [{ "id", "kind": "CANCEL" | "RETURN", "amount", "fee", "status": "PENDING" | "DONE", "requestedAt", "refundedAt" }]
}
OrderSummary = { "orderNo", "status", "placedAt", "total" }
```

**error ของ `POST /api/orders`** (ไม่สร้างออเดอร์เลยทุกกรณี FR-36)

| HTTP | error | เมื่อไร | ฟิลด์เพิ่ม |
| --- | --- | --- | --- |
| 409 | `OUT_OF_STOCK` | ของไม่พอ (BR-32, BR-33) | `sku`, `available` |
| 409 | `LIMIT_REACHED` | เกินสิทธิ์คนละ 1 ใบ (BR-31) | `sku` |
| 409 | `COUPON_USED` | NEWBIT200 ถูกใช้ไปแล้ว รวมถึงกดพร้อมกัน 2 แท็บ (BR-17) | — |
| 400 | `COUPON_REJECTED` | ส่งโค้ดที่ใช้ไม่ได้ · `message` = เหตุผลเดียวกับ `coupon.reason` | `reason` |
| 400 | `GUEST_INFO_REQUIRED` | ไม่ล็อกอินแต่ไม่ส่งชื่อ เบอร์ อีเมล | — |
| 400 | `ADDRESS_REQUIRED` | ไม่ใช่รับที่ร้านแต่ไม่ส่งที่อยู่ | — |
| 400 | `EXPRESS_NOT_AVAILABLE` | ส่งด่วนนอกกรุงเทพมหานคร (BR-23) | — |
| 400 | `INVALID_ITEMS` | ตะกร้าว่าง sku ไม่มี หรือ qty < 1 | — |

**error อื่น:** `409 ORDER_EXPIRED` (จ่ายหลังหมดเวลา BR-30) · `409 CANNOT_CANCEL` (แพ็กแล้ว BR-36) · `409 RETURN_WINDOW_CLOSED` (BR-37) · `409 NOT_DELIVERED` · `409 NOT_PAID` · `401 LOGIN_REQUIRED` · `403 FORBIDDEN` · `404 NOT_FOUND`

### 3.4 ใบเสนอราคา (บัญชี Business เท่านั้น)

| method | path | body | ตอบ |
| --- | --- | --- | --- |
| POST | `/api/quotes` | `{ "items", "coupon"? }` | `201` `{ "quoteNo": "Q-261113-0001", "issuedAt", "validUntil", "quote": Quote }` · ไม่ใช่ Business `403 FORBIDDEN` |
| GET | `/api/quotes` | — | ใบเสนอราคาของฉัน |
| GET | `/api/quotes/:no` | — | `{ "quoteNo", "issuedAt", "validUntil", "expired": bool, "quote": Quote }` |
| POST | `/api/quotes/:no/order` | `{ "shipping", "province"?, "address"? }` | เหมือน `POST /api/orders` แต่ใช้ราคาในใบเสนอ · หมดอายุ `409 QUOTE_EXPIRED` · ของไม่พอ `409 OUT_OF_STOCK` |

`validUntil` = 23:59:59 ของวันที่ 7 นับจากวันออก (BR-39) · ราคาส่งไม่เปลี่ยนตามป้าย · ค่าส่งคิดตอนสั่งตาม BR-22–24

### 3.5 บัญชี

| method | path | body | ตอบ |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ "email", "password", "name", "phone", "company"?, "taxId"? }` · มี `taxId` = สมัคร Business | `201` `Me` · อีเมลซ้ำ `409 EMAIL_TAKEN` · เลขผู้เสียภาษีไม่ใช่ตัวเลข 13 หลัก `400 INVALID_TAX_ID` |
| POST | `/api/auth/login` | `{ "email", "password" }` | `Me` + cookie · ผิด `401 INVALID_LOGIN` "อีเมลหรือรหัสผ่านไม่ถูกต้อง" |
| POST | `/api/auth/logout` | — | `{ "ok": true }` |
| GET | `/api/me` | — | `Me` · ไม่ล็อกอิน `401 LOGIN_REQUIRED` |

```json
Me = { "code": "C3", "email", "name", "role": "customer" | "staff" | "owner",
       "tier": "SILVER", "memberRate": 3, "spend12m": 2000000,
       "nextTier": "GOLD" | null, "toNextTier": 8000000 | null,
       "company": null, "taxId": null }
```

### 3.6 หลังร้าน (role `staff` หรือ `owner` · คนอื่น `403 FORBIDDEN`)

| method | path | body | ตอบ |
| --- | --- | --- | --- |
| GET | `/api/admin/stock` | — | `[{ "sku", "name", "onHand", "held", "available", "redTag", "perBuyerLimit" }]` |
| POST | `/api/admin/store-sale` | `{ "sku", "qty", "customerCode"? }` | `{ "sku", "available" }` · ของไม่พอ `409 OUT_OF_STOCK` (BR-32) |
| GET | `/api/admin/lots` | — | `[{ "code", "sku", "qty", "releaseAt", "released" }]` (FR-06) |
| POST | `/api/admin/lots` | `{ "sku", "qty": 1–1000, "releaseAt": "<ISO>" }` | `201` ล็อตเดียวกัน · ของเข้า "ขายได้" เมื่อถึง `releaseAt` · เวลาไม่อยู่ในอนาคตหรือข้อมูลผิด `400 INVALID_LOT` (FR-06, BR-34) |
| GET | `/api/admin/orders` | `?status=&date=YYYY-MM-DD` | `[Order]` |
| POST | `/api/admin/orders/:no/status` | `{ "status": "PACKED" \| "SHIPPED" \| "DELIVERED" }` | `Order` · ข้ามขั้นหรือตั้งเป็น `PAID` เอง `409 INVALID_TRANSITION` (FR-44) |
| POST | `/api/admin/refunds/:id/done` | — | `{ "id", "status": "DONE", "refundedAt" }` |

## 4. `data-testid` ขั้นต่ำ

| testid | อยู่ที่ |
| --- | --- |
| `<body data-bug-mode="0\|1\|2">` และ `<html data-bug-mode data-ready="false\|true">` | ทุกหน้า · รอ `data-ready="true"` ก่อนกด |
| `nav-cart-count`, `nav-login`, `nav-account`, `nav-admin`, `flash-banner` | แถบบน |
| `product-card-<sku>`, `product-price-<sku>`, `product-flash-price-<sku>`, `product-stock-<sku>`, `add-to-cart-<sku>` | หน้ารวมสินค้า |
| `product-price`, `product-flash-price`, `member-price`, `product-stock`, `qty-minus`, `qty-value`, `qty-plus`, `add-to-cart`, `buy-now`, `limit-note`, `next-lot` | หน้าสินค้า |
| `builder-select-<cat>` (`<select>`; `<option>` มี `disabled` เมื่อใส่ไม่ได้), `builder-reason-<cat>`, `builder-total`, `builder-budget`, `builder-remaining`, `builder-conflict`, `builder-warning-psu`, `psu-upgrade`, `psu-keep`, `builder-assembly`, `builder-assembly-fee`, `builder-missing`, `builder-save`, `builder-share-link`, `builder-add-all` | หน้าจัดสเปก |
| `build-item-<cat>`, `build-price-diff-<cat>`, `build-sold-out-<cat>`, `build-remaining`, `build-add-all` | หน้าลิงก์สเปก `/b/:code` |
| `price-changed`, `cart-line-<sku>`, `cart-qty-<sku>`, `cart-plus-<sku>`, `cart-minus-<sku>`, `cart-remove-<sku>`, `coupon-input`, `coupon-apply`, `coupon-status`, `shipping-standard`, `shipping-express`, `shipping-pickup`, `assembly-toggle` | หน้าตะกร้า |
| `quote-line`, `quote-list-total`, `quote-flash`, `quote-bundle`, `quote-member`, `quote-coupon`, `quote-assembly`, `quote-shipping`, `quote-total`, `quote-vat`, `quote-pre-vat` | ใบสรุปราคา (ตะกร้า หน้าจ่ายเงิน ออเดอร์ ใบเสนอราคา) · ค่าเป็นตัวเลขบาท เช่น `9,624.00` |
| `guest-name`, `guest-phone`, `guest-email`, `address-line`, `address-province`, `place-order` | ฟอร์มสั่งซื้อ |
| `order-no`, `order-status`, `hold-until`, `countdown`, `pay-promptpay`, `pay-card` | หน้าจ่ายเงิน |
| `cancel-order`, `refund-amount`, `return-opened`, `return-unopened`, `return-preview-refund`, `return-preview-fee`, `return-submit`, `return-until`, `warranty-link`, `invoice-link`, `invoice-total`, `invoice-vat`, `invoice-pre-vat` | หน้าออเดอร์ |
| `member-tier`, `spend-12m`, `to-next-tier` | หน้าบัญชี |
| `login-email`, `login-password`, `login-submit`, `register-name`, `register-phone`, `register-email`, `register-password`, `register-company`, `register-tax-id`, `register-submit` | หน้าเข้าสู่ระบบ |
| `quote-create`, `quote-no`, `quote-valid-until`, `quote-order` | ใบเสนอราคา |
| `admin-stock-<sku>`, `admin-available-<sku>`, `admin-store-sale-<sku>`, `store-sale-sku`, `store-sale-qty`, `store-sale-customer`, `store-sale-submit`, `lot-sku`, `lot-qty`, `lot-release-at`, `lot-submit`, `lot-list`, `lot-<code>`, `admin-notice`, `admin-order-<no>`, `admin-status-<no>` | หลังร้าน |
| `error-message` | ข้อความ error ทุกจุด |

## 5. หน้าเว็บ (route)

| path | หน้า | อ้างอิงหน้าออกแบบ |
| --- | --- | --- |
| `/` | หน้าแรก | `design/index.html` |
| `/products` · `/products?cat=GPU` | สินค้าทั้งหมด | `design/Category.html` |
| `/products/:sku` | สินค้า | `design/Product.html` |
| `/builder` | จัดสเปก | (ไม่มีในหน้าออกแบบ ใช้ `img/us-builder.svg` และ `img/us-psu-swap.svg`) |
| `/b/:code` | ลิงก์สเปก | `img/us-builder.svg` |
| `/cart` | ตะกร้า | `design/Cart.html` |
| `/checkout/:orderNo` | จ่ายเงิน + นับถอยหลัง | `design/Checkout.html` · `img/us-hold.svg` |
| `/orders/:orderNo` | สถานะออเดอร์ ยกเลิก คืนของ ใบกำกับภาษี | `design/Order.html` |
| `/login` | เข้าสู่ระบบ / สมัคร / สมัคร Business | `design/Login.html` |
| `/account` | บัญชีของฉัน | `design/Account.html` |
| `/quotes/:no` | ใบเสนอราคา | `design/Quote.html` · `img/us-quote.svg` |
| `/admin` | หลังร้าน | `design/Admin.html` |
| `/warranty?order=` | เคลมประกัน (แยกจากการคืนของ · FR-49) | — |

## 6. โหมดบั๊ก

| ค่า | ใครฝัง | เฉลยอยู่ที่ |
| --- | --- | --- |
| `BUG_MODE=0` | — | — |
| `BUG_MODE=1` | Claude ตอนสร้างเว็บ 3 ตัว | `backend/BUGS.md` (ห้ามเปิดจนจบขั้น 5) |
| `BUG_MODE=2` | ทีมคู่ (ขั้น 5) | ไฟล์ที่ส่งผู้สอน |
