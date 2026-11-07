# BUG_MODE=2 · บั๊กที่ทีมคู่ (red team) ฝังไว้ (ห้ามเปิดจนจบการบ้านขั้น 5)

> ไฟล์นี้คือเฉลยของ `BUG_MODE=2` · ทีมเจ้าของเว็บต้องรันแผนทดสอบของตัวเอง **แบบไม่แก้ไฟล์เทสต์** ก่อน แล้วค่อยเปิดไฟล์นี้เทียบ
> ทุกข้อฝังหลัง `BugMode == 2` เท่านั้น · `BUG_MODE=0` และ `BUG_MODE=1` ให้ผลเหมือนเดิมทุกตัวอักษร (พิสูจน์ใน §สุดท้าย)
> **การเปลี่ยนโค้ดทั้ง 5 จุด** ขัดกับ **ประโยคตรง ๆ** ใน `INTERVIEW.md` หรือ `API-CONTRACT.md` ไม่ใช่กับสมมติฐานที่ยังค้างใน `QUESTIONS-TO-OWNER.md` (K1–K9 / S1–S5 / Q1–Q37)
> ⚠️ แต่ **ข้อความบรรยายผลกระทบ** ในไฟล์นี้บางจุดเคยอ้างบัญชีหรือประโยคที่ผูกกับสมมติฐานที่ยังค้าง · จุดเหล่านั้นถูกตัดหรือลดระดับแล้วในรอบตรวจ (ดู `BUG-HUNT.md` ข้อ 2.5 "เฉลยที่ต้องแก้")
> ไม่ซ้ำ BR-06, BR-18, BR-30 ซึ่งเป็นของ `BUG_MODE=1` แล้ว

## สรุป

| # | กฎที่ผิด | ชนิด | อยู่ที่ | อาการสั้น ๆ | เสียหาย |
| --- | --- | --- | --- | --- | ---: |
| 1 | BR-01 (ระดับสมาชิก) | ขอบ | `internal/pricing/pricing.go:71` · `internal/store/store.go:309` | ยอดสะสม ฿20,000 **พอดี** ไม่ได้เป็น Silver (ต้อง ฿20,001 ขึ้นไป) | ลูกค้าเสีย 3% ทุกบิล (฿188 ในบิลตัวอย่าง) |
| 2 | BR-23 (ส่งด่วน) | เงิน | `internal/pricing/pricing.go:250` | ส่งด่วนกลายเป็น **ฟรี** เมื่อค่าสินค้า ≥ ฿3,000 ทั้งที่ร้านบอกว่าไม่มีส่งฟรี | ร้านเสีย ฿150 ต่อออเดอร์ |
| 3 | BR-36 (ยกเลิก) | สิทธิ์ | `internal/store/orders.go:518` (+ `:338`, `:535`) | ออเดอร์ที่ **แพ็กแล้ว** ยังกดยกเลิกได้และได้เงินคืนเต็ม | ร้านเสีย ฿7,351 ต่อออเดอร์ที่แพ็กแล้ว |
| 4 | BR-31 (จำกัดคนละ 1 ใบ) | สิทธิ์ | `internal/store/orders.go:163` (+ `:202`) | ใส่การ์ดจอรุ่นใหม่ **2 ใบในออเดอร์เดียว** ผ่าน (3 ใบยังบล็อก) | พ่อค้ากวาดเพิ่ม ฿23,990 ต่อรอบ |
| 5 | FR-44 / API-CONTRACT 3.6 | สถานะ | `internal/store/orders.go:898` (+ `:915`) | พนักงาน **ข้ามขั้น** PAID → SHIPPED ได้ ไม่ต้องผ่าน PACKED | ลูกค้าเสียสิทธิ์ยกเลิก ฿1,286 |

ทุก repro เริ่มจาก `POST /api/test/reset` ใหม่เสมอ (เวลาเว็บ = ศุกร์ 13 พ.ย. 2026 10:00:00+07:00) · เงินใน API เป็น **สตางค์**

```bash
curl -s -X POST http://localhost:3000/api/test/reset
```

---

## บั๊ก #1 · BR-01 · ยอดสะสม ฿20,000 พอดี ไม่ได้ Silver (ขอบ)

**ประโยคที่ขัด** — `INTERVIEW.md` ข้อ 1 หัวข้อ "สมาชิก" บรรทัด 19 · **คุณเก่ง (เจ้าของร้าน)**:
> "**Silver** ยอดสะสมตั้งแต่ ฿20,000 ลด 3%"

ย้ำอีกที่หนึ่งใน `INTERVIEW.md` ข้อ 6.2 แถว C3: `oat@bitbaan.test` · ระดับ **Silver** · ยอดสะสม "**฿20,000 พอดี**"
คำว่า "ตั้งแต่" และคำว่า "พอดี" ในตารางของร้านเอง ปิดประตูการตีความว่าขอบนี้เป็นแบบ "มากกว่า"
ไม่ใช่ข้อค้างใน `QUESTIONS-TO-OWNER.md`: K9 ถามเรื่องคุณต้น (C6) ที่ ฿18,000 · Q14a/Q14b ถามว่ายอดสะสม *นับอะไร* และ *นับกี่วัน* — ไม่มีข้อไหนถามว่าขอบ ฿20,000 รวมค่าพอดีหรือไม่

**ที่แก้** — `backend/internal/pricing/pricing.go:68-82` (`TierForMode`, แยกออกมาจาก `TierFor` เดิม) และ `backend/internal/store/store.go:309` (`TierOf` ส่ง `s.BugMode` เข้าไป)

```go
silverMin := int64(20000) // BR-01: "ตั้งแต่ ฿20,000"
if bugMode == 2 {
    silverMin = 20001 // BUG_MODE=2: see BUGS2.md #1
}
```

**repro**

```bash
curl -s -X POST http://localhost:3000/api/test/reset
curl -s http://localhost:3000/api/me -H 'X-Test-User: C3'
curl -s -X POST http://localhost:3000/api/quote -H 'X-Test-User: C3' -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"CPU-N5","qty":1}],"shipping":"standard"}'
```

| | ถูก (BUG_MODE=0) | บั๊ก (BUG_MODE=2) |
| --- | --- | --- |
| `/api/me` ของ C3 | `tier: "SILVER"` · `memberRate: 3` · `nextTier: "GOLD"` · `toNextTier: 8000000` | `tier: "GENERAL"` · `memberRate: 0` · `nextTier: "SILVER"` · `toNextTier: 0` |
| quote CPU-N5 | `memberDiscount: 18800` · `total: 610200` (฿6,102) | `memberDiscount: 0` · `total: 629000` (฿6,290) |
| หน้า `/account` | `member-tier` = Silver | `member-tier` = ทั่วไป และ `to-next-tier` = **฿0** ทั้งที่ยังไม่ได้ Silver |

C7 (฿19,999) และ C8/C9 ไม่เปลี่ยน จึงเห็นเฉพาะที่ขอบ ฿20,000 พอดี

> หมายเหตุความยุติธรรม: บัญชี C10 (`edge365@bitbaan.test`) ก็เปลี่ยนตามไปด้วย แต่ **ห้ามใช้ C10 เป็นหลักฐานของบั๊กนี้** เพราะระดับที่ถูกต้องของ C10 ยังขึ้นกับคำถามที่ร้านยังไม่ตอบ (Q14b / A-23 · "12 เดือนล่าสุด" นับ 365 วันพอดีด้วยไหม) · หลักฐานที่ใช้ได้คือ C3 ซึ่งร้านระบุไว้เองในตาราง 6.2 ว่าเป็น Silver ที่ยอด ฿20,000 พอดี

**เสียหาย** — ลูกค้าที่ยอดอยู่ที่ขอบพอดีถูกเก็บเพิ่ม 3% ของทุกบิล · ตัวอย่างบิลเดียว **฿188** (6,290 − 6,102) · ถ้าซื้อครบ ฿20,000 ปีถัดไป = เสีย ฿600 ต่อปี และร้านเสียความน่าเชื่อถือกับคนที่ "เพิ่งขึ้นระดับ"

---

## บั๊ก #2 · BR-23 · ส่งด่วนกลายเป็นส่งฟรีเมื่อยอด ≥ ฿3,000 (เงิน)

**ประโยคที่ขัด** — `INTERVIEW.md` ข้อ 1 หัวข้อ "ค่าส่ง" บรรทัด 50 · **คุณเก่ง (เจ้าของร้าน)**:
> "ส่งด่วนในกรุงเทพฯ ฿150 **(ไม่มีส่งฟรี)**"

วงเล็บ "(ไม่มีส่งฟรี)" เป็นคำของเจ้าของร้านเอง ไม่ใช่สมมติฐาน · Q6a ที่ยังค้างถามเฉพาะว่ายอด ฿3,000 ของ **ส่งปกติ** วัดจากยอดไหน · Q20 ถามแค่ว่า "ในกรุงเทพฯ" ครอบคลุมปริมณฑลไหม — ไม่มีข้อไหนเปิดช่องให้ส่งด่วนฟรี

**ที่แก้** — `backend/internal/pricing/pricing.go:246-252` (`Compute`, กิ่ง `case "express"`)

```go
case "express":
    q.ShippingFee = 150
    if in.BugMode == 2 && q.G4 >= 3000 {
        q.ShippingFee = 0 // BUG_MODE=2: see BUGS2.md #2
    }
```

**repro** (ลูกค้าไม่ล็อกอิน เพื่อไม่ให้ปนกับบั๊ก #1)

```bash
curl -s -X POST http://localhost:3000/api/test/reset
curl -s -X POST http://localhost:3000/api/quote -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"GPU-V46","qty":1}],"shipping":"express","province":"กรุงเทพมหานคร"}'
curl -s -X POST http://localhost:3000/api/quote -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"RAM-16","qty":1}],"shipping":"express","province":"กรุงเทพมหานคร"}'
curl -s -X POST http://localhost:3000/api/orders -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"GPU-V46","qty":1}],"shipping":"express","guest":{"name":"บีม","phone":"0810000001","email":"beam@test.th"},"address":{"line":"1 ถ.ทดสอบ","province":"กรุงเทพมหานคร"}}'
```

| ตะกร้า (ศุกร์ 10:00 ยังไม่ถึง flash sale) | ถูก (BUG_MODE=0) | บั๊ก (BUG_MODE=2) |
| --- | --- | --- |
| GPU-V46 ฿11,490 ส่งด่วน | `shippingFee: 15000` · `total: 1164000` (฿11,640) | `shippingFee: 0` · `total: 1149000` (฿11,490) |
| RAM-16 ฿1,890 ส่งด่วน (Q12) | `shippingFee: 15000` · `total: 204000` (฿2,040) | เหมือนเดิม ฿2,040 ← ตะกร้าเล็กยังถูกต้อง จึงหาเจอยาก |
| ออเดอร์จริง | `quote.shippingFee` 15000 บนหน้า `/checkout/:orderNo` · `quote-shipping` แสดง `150.00` | `shippingFee` 0 · `quote-shipping` แสดง `0.00` (ไม่ใช่คำว่า "ฟรี" — `QuoteBreakdown.tsx` เรนเดอร์เป็นตัวเลขบาทเสมอตาม `API-CONTRACT.md` ข้อ 4) |

**เสียหาย** — ร้านจ่ายค่าส่งด่วนจริงให้บริษัทขนส่งเอง แต่ไม่ได้เก็บจากลูกค้า = **ขาดทุน ฿150 ต่อออเดอร์** ทุกออเดอร์ส่งด่วนที่ค่าสินค้า ≥ ฿3,000 (ซึ่งเป็นออเดอร์ส่วนใหญ่ของร้านคอม) · 20 ออเดอร์/เดือน = ฿3,000/เดือน

---

## บั๊ก #3 · BR-36 · ยกเลิกออเดอร์ที่แพ็กแล้วได้ (สิทธิ์)

**ประโยคที่ขัด** — `INTERVIEW.md` ข้อ 1 หัวข้อ "ยกเลิกและคืนของ" บรรทัด 60 · **คุณเก่ง (เจ้าของร้าน)**:
> "ยกเลิก**ก่อนร้านแพ็กของ** คืนเงินเต็ม"

คำว่า "ก่อนร้านแพ็กของ" เป็นเส้นแบ่งที่เจ้าของร้านพูดเอง · Q15c ที่ยังค้างถามเฉพาะว่าคืน **ค่าส่ง** ด้วยไหม ไม่ได้ถามว่ายกเลิกหลังแพ็กได้ไหม · `API-CONTRACT.md` ข้อ 3.3 ก็เขียนไว้ว่า `409 CANNOT_CANCEL` (แพ็กแล้ว BR-36)

**ที่แก้** — `backend/internal/store/orders.go:515-521` (`cancellable`) ถูกเรียกจาก `scanOrder` (`:338`) และ `Cancel` (`:535`)

```go
func (s *Store) cancellable(status string) bool {
    if s.BugMode == 2 && status == "PACKED" {
        return true // BUG_MODE=2: see BUGS2.md #3
    }
    return status == "PENDING" || status == "PAID"
}
```

**repro** — ใช้ออเดอร์ที่ seed ไว้ `BB-261112-0001` (C5 · MON-27 · ยอด ฿7,351 · สถานะ PACKED ตั้งแต่ 13 พ.ย. 09:30)

```bash
curl -s -X POST http://localhost:3000/api/test/reset
curl -s http://localhost:3000/api/orders/BB-261112-0001 -H 'X-Test-User: C5'
curl -s -X POST http://localhost:3000/api/orders/BB-261112-0001/cancel -H 'X-Test-User: C5'
curl -s http://localhost:3000/api/admin/stock -H 'X-Test-User: S1'
```

| | ถูก (BUG_MODE=0) | บั๊ก (BUG_MODE=2) |
| --- | --- | --- |
| `GET` ออเดอร์ | `canCancel: false` · หน้า `/orders/BB-261112-0001` ไม่มีปุ่ม `cancel-order` | `canCancel: true` · ปุ่มยกเลิกโผล่ |
| `POST .../cancel` | `409 { "error": "CANNOT_CANCEL" }` (E125) | `200 { "status": "CANCELLED", "refund": 735100 }` |
| สต็อก MON-27 | `available: 5` เท่าเดิม | `available: 6` ของถูกคืนเข้าชั้นทั้งที่แพ็กใส่กล่องไปแล้ว |

(ออเดอร์ `BB-261113-0001` ที่ยัง PAID ยกเลิกได้เหมือนเดิม คืน ฿1,286 — พฤติกรรมถูกต้อง ไม่เปลี่ยน)

**เสียหาย** — ร้านคืนเงิน **฿7,351** ให้ออเดอร์ที่แพ็กเสร็จรอส่งแล้ว ต้องแกะกล่อง นับของเข้าชั้นใหม่ และถ้าของออกจากร้านไปแล้วจริง ๆ ก็คือของหาย · ยังทำให้ `spend_ledger` ของ C5 หายไป ฿7,351 ด้วย

---

## บั๊ก #4 · BR-31 · ซื้อการ์ดจอรุ่นจำกัดได้ 2 ใบในออเดอร์เดียว (สิทธิ์)

**ประโยคที่ขัด** — `INTERVIEW.md` ข้อ 1 หัวข้อ "จองของ" บรรทัด 56 · **คุณเก่ง (เจ้าของร้าน)**:
> "การ์ดจอรุ่นใหม่ **จำกัดคนละ 1 ใบ** 'กันพ่อค้ามากวาดไปขายต่อ'"

ข้อที่ยังค้าง Q9a ถามว่า "คนละ" นับตาม **บัญชี / ที่อยู่ / เบอร์** และ Q9b ถามว่านับ **ต่อล็อตหรือตลอดไป** — เคสนี้เป็น **บัญชีเดียว ออเดอร์เดียว ล็อตเดียว** จึงผิดไม่ว่าร้านจะตอบ Q9a/Q9b แบบไหน · `API-CONTRACT.md` ข้อ 3.3 ระบุ `409 LIMIT_REACHED` "เกินสิทธิ์คนละ 1 ใบ (BR-31)"

**ที่แก้** — `backend/internal/store/orders.go:160-166` (`limitFor`) ถูกเรียกใน `PlaceOrder` (`:202`)

```go
func (s *Store) limitFor(perBuyerLimit int) int {
    if s.BugMode == 2 {
        return perBuyerLimit + 1 // BUG_MODE=2: see BUGS2.md #4
    }
    return perBuyerLimit
}
```

เป็นขอบ +1 ใบเท่านั้น: 3 ใบยังโดน `409 LIMIT_REACHED` และออเดอร์ที่ 2 ของคนเดิมยังโดน unique index `one_claim_per_buyer_per_lot` อยู่ จึงเหลือรูเดียวคือ "2 ใบในใบสั่งเดียว"

**repro** — ต้องมีของ ≥ 2 ใบ จึงเลื่อนเวลาไปหลังล็อต `LOT-V57-2` เปิด (จันทร์ 16 พ.ย. 10:00 · `INTERVIEW.md` ข้อ 6.5)

```bash
curl -s -X POST http://localhost:3000/api/test/reset
curl -s -X POST http://localhost:3000/api/test/clock -H 'Content-Type: application/json' \
  -d '{"now":"2026-11-16T10:00:00+07:00"}'
curl -s http://localhost:3000/api/products/GPU-V57
curl -s -X POST http://localhost:3000/api/orders -H 'X-Test-User: C3' -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"GPU-V57","qty":2}],"shipping":"pickup"}'
curl -s -X POST http://localhost:3000/api/orders -H 'X-Test-User: C4' -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"GPU-V57","qty":3}],"shipping":"pickup"}'
```

| | ถูก (BUG_MODE=0) | บั๊ก (BUG_MODE=2) |
| --- | --- | --- |
| GPU-V57 หลังล็อตเปิด | `available: 3` · `perBuyerLimit: 1` | เหมือนกัน (หน้าสินค้ายังเขียน "จำกัดคนละ 1 ใบ") |
| C3 สั่ง qty 2 | `409 { "error": "LIMIT_REACHED", "sku": "GPU-V57" }` (E105) | `201` ออเดอร์สำเร็จ 2 ใบ `total: 4798000` (฿47,980) · available เหลือ 1 |
| C4 สั่ง qty 3 | `409 LIMIT_REACHED` | `409 LIMIT_REACHED` (ขอบ +1 เท่านั้น) |

เช็กเร็วแบบไม่ต้องเลื่อนนาฬิกา: หลัง reset (ของเหลือ 1 ใบ) สั่ง `GPU-V57` qty 2 — ที่ถูกต้องตอบ `LIMIT_REACHED` แต่ตอนบั๊กจะหลุดไปตอบ `OUT_OF_STOCK` แทน เพราะด่านสิทธิ์ไม่ทำงานแล้ว
หมายเหตุ: ตอน BUG_MODE=2 บัญชี C3 ถูกบั๊ก #1 ลดระดับเป็น "ทั่วไป" ยอดจึงไม่มีส่วนลดสมาชิก (ถ้าทดสอบเทียบยอดให้ดูข้อ #1 ประกอบ)

**เสียหาย** — ของเข้าล็อตละ 2–3 ใบ ("ของมาน้อย คนแย่งกันทุกล็อต" บ.14) คนเดียวกวาดไปได้ 2 ใบ = **฿23,990** ที่ลูกค้าอีกคนควรได้ · เป็นปัญหาเดียวกับที่คุณเก่งเล่าไว้ บ.66 ว่า "ต้องโทรขอโทษไปหนึ่งคน เสียลูกค้าไปเลย"

---

## บั๊ก #5 · FR-44 / API-CONTRACT 3.6 · พนักงานข้ามขั้น PAID → SHIPPED ได้ (สถานะ)

**ประโยคที่ขัด** — `API-CONTRACT.md` ข้อ 3.6 (ตาราง "หลังร้าน") แถว `POST /api/admin/orders/:no/status`:
> "`Order` · **ข้ามขั้น**หรือตั้งเป็น `PAID` เอง `409 INVALID_TRANSITION` (FR-44)"

ประโยคใน `API-CONTRACT.md` ข้างบนคือฐานเดียวของบั๊กนี้ และเพียงพอ · ไม่มีคำถามค้างใน `QUESTIONS-TO-OWNER.md` เรื่องลำดับสถานะหลังร้าน

> เดิมเฉลยฉบับร่างหนุนข้อนี้ด้วย `INTERVIEW.md` บรรทัด 66 ("ระบบใหม่ห้ามเกิดแบบนี้อีก") · **ตัดออกแล้ว** เพราะประโยคนั้นคือที่มาของ S5 ซึ่งเป็นคำถามที่ร้าน **ยังไม่ตอบ** การใช้มันค้ำบั๊กจึงผิดกติกาความยุติธรรม

**ที่แก้** — `backend/internal/store/orders.go:895-901` (`allowedNext`) ถูกเรียกใน `SetStatus` (`:915`)

```go
func (s *Store) allowedNext(status, to string) bool {
    if s.BugMode == 2 && status == "PAID" && to == "SHIPPED" {
        return true // BUG_MODE=2: see BUGS2.md #5
    }
    return nextStatus[status] == to
}
```

**repro** — ออเดอร์ที่ seed ไว้ `BB-261113-0001` (C4 · RAM-D4 · ยอด ฿1,286 · สถานะ PAID ยังไม่แพ็ก)

```bash
curl -s -X POST http://localhost:3000/api/test/reset
curl -s -X POST http://localhost:3000/api/admin/orders/BB-261113-0001/status -H 'X-Test-User: S1' \
  -H 'Content-Type: application/json' -d '{"status":"SHIPPED"}'
curl -s http://localhost:3000/api/orders/BB-261113-0001 -H 'X-Test-User: C4'
curl -s -X POST http://localhost:3000/api/orders/BB-261113-0001/cancel -H 'X-Test-User: C4'
```

| | ถูก (BUG_MODE=0) | บั๊ก (BUG_MODE=2) |
| --- | --- | --- |
| ตั้ง SHIPPED จาก PAID | `409 { "error": "INVALID_TRANSITION" }` | `200` · `status: "SHIPPED"` · `shippedAt` มีค่า แต่ `packedAt: null` |
| ออเดอร์ของลูกค้า | ยัง `PAID` · `canCancel: true` | `SHIPPED` · `canCancel: false` · ปุ่ม `cancel-order` หายจากหน้า `/orders/...` |
| ยกเลิกต่อ | `200` คืน ฿1,286 (R2/E124) | `409 CANNOT_CANCEL` |
| สต็อก RAM-D4 `onHand` | 11 | 10 (ตัดสต็อกตอน SHIPPED โดยไม่เคยผ่านการแพ็ก) |

`PACKED → DELIVERED` และ `PENDING → PACKED` ยังตอบ `409` เหมือนเดิม — เปิดรูเดียวคือ PAID → SHIPPED

**เสียหาย** — ลูกค้าเสียสิทธิ์ยกเลิกที่ บ.60 ให้ไว้ (**฿1,286** ในเคสนี้ และเป็นยอดเต็มของออเดอร์ใด ๆ ที่โดน) เพราะระบบกระโดดข้ามสถานะ "แพ็กแล้ว" ไปเอง · ร้านเองก็เสียจุดตรวจก่อนส่ง (ของออกจากร้านโดยไม่มีคนแพ็ก) และไทม์ไลน์ในหลังร้านอ่านไม่ได้ว่าใครแพ็กเมื่อไหร่

---

## การพิสูจน์ว่า BUG_MODE=0 และ 1 ไม่กระทบ

```
cd backend && go build ./... && go test ./internal/...
BUILD OK
?   bitbaan/backend/internal/api     [no test files]
?   bitbaan/backend/internal/catalog [no test files]
?   bitbaan/backend/internal/clock   [no test files]
ok  bitbaan/backend/internal/compat  (cached)
ok  bitbaan/backend/internal/pricing 1.221s
?   bitbaan/backend/internal/store   [no test files]
```

ตารางเทียบ 3 โหมดด้วย harness ชั่วคราว (ลบทิ้งแล้ว ไม่อยู่ใน repo)

| เคส | mode 0 | mode 1 | mode 2 |
| --- | --- | --- | --- |
| `TierForMode(19999/20000/20001/100000, …)` | GENERAL / **SILVER** / SILVER / GOLD | GENERAL / **SILVER** / SILVER / GOLD | GENERAL / **GENERAL** / SILVER / GOLD |
| guest GPU-V46 ส่งด่วน | ค่าส่ง 150 · ยอด 11,640 | ค่าส่ง 150 · ยอด 11,640 | ค่าส่ง **0** · ยอด 11,490 |
| guest RAM-16 ส่งด่วน (Q12) | 150 · 2,040 | 150 · 2,040 | 150 · 2,040 |
| Q03 / Q26 / Q01 ของ `TEST-DATA.md` | 9,624 / 9,774 / 2,250 ✓ | เท่ากัน | — |

ฟังก์ชันอื่นที่แตะ (`cancellable`, `limitFor`, `allowedNext`) เขียนให้ค่ากลับ **เหมือนเงื่อนไขเดิมทุกประการ** เมื่อ `BugMode != 2`
และไม่มีการเปลี่ยน signature ของฟังก์ชันเดิมสักตัว (เพิ่ม `TierForMode` ใหม่ · `TierFor` เดิมยังเรียกได้เหมือนเดิมและให้ผลเดิม)

## สิ่งที่ไม่ได้ทำตามกติกา

- ไม่มีข้อไหนทำให้แอป 5xx ค้าง ช้า หรือข้อมูลหาย · ไม่มีการแก้ `data-testid` · ไม่มีการแก้ migration/schema
- ไม่มีข้อไหนต้องเปิดฐานข้อมูลดูถึงจะเห็น ทุกข้อเห็นผ่าน API (ข้อ 1, 3, 5 เห็นผ่านหน้าเว็บด้วย)
- ไม่แตะ BR-06, BR-18, BR-30 (ของ `BUG_MODE=1`)
- ทั้ง 5 ข้ออยู่คนละกฎและคนละฟังก์ชัน
