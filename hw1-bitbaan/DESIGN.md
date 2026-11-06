# Design · บิตบ้าน คอมพิวเตอร์

ที่มา: `USER-STORIES.md`, `REQUIREMENTS.md` · ขั้นนี้ยังไม่เขียนโค้ดเว็บ

## วิธีอ่าน

- แผนภาพทุกรูปเขียนด้วย Mermaid และ render เป็นภาพไว้ที่ `design/<ชื่อ>.png` เพื่อยืนยันว่าไม่มี syntax error
- ทุกจุดตัดสินใจในแผนภาพมีรหัส BR กำกับ · ⚠️ A-xx = ใช้สมมติฐานใน `REQUIREMENTS.md`
- ชื่อตารางและคอลัมน์เป็นภาษาอังกฤษ เพราะเป็นชื่อที่จะอยู่ในโค้ด · คำอธิบายเป็นภาษาไทย

## สรุป

| แผนภาพ | จำนวน | ไฟล์ | ครอบคลุม |
| --- | ---: | --- | --- |
| System Architecture | 1 | `design/architecture.png` | NFR-04, NFR-07, NFR-08, NFR-10, NFR-11 |
| Use Case | 1 | `design/use-case.png` | FR-01 ถึง FR-56 |
| Flowchart | 4 | `design/flow-builder.png` `design/flow-order.png` `design/flow-price.png` `design/flow-cancel-return.png` | BR-01 ถึง BR-40 |
| ERD | 1 | `design/erd.png` | 19 ตาราง |
| Sequence | 4 | `design/seq-order.png` `design/seq-race.png` `design/seq-limit.png` `design/seq-expire.png` | BR-30 ถึง BR-32, BR-17 |
| **รวม** | **11** | | |

---

## 1. System Architecture

<!-- render: architecture -->
```mermaid
flowchart LR
  subgraph PC["① เครื่องของเรา"]
    B["เบราว์เซอร์<br/>ลูกค้า / พนักงาน"]
    PW["Playwright<br/>e2e · race · property"]
  end
  subgraph FE["② frontend (container bitbaan-frontend)"]
    UI["Vite + React + TypeScript<br/>build แล้วเสิร์ฟด้วย nginx"]
    CART["ตะกร้าเก็บในเบราว์เซอร์<br/>(localStorage)"]
  end
  subgraph BE["③ backend (container bitbaan-backend)"]
    API["Go net/http<br/>/api/*"]
    RULES["internal/pricing<br/>internal/compat<br/>(ฟังก์ชันล้วน ไม่แตะฐานข้อมูล)"]
    CLOCK["internal/clock<br/>เวลาของเว็บ (ล็อกได้)"]
    JOB["ตัวปล่อยของหมดเวลา<br/>ทุก 1 วินาที + ทุกคำขอ"]
    DBLIB["internal/store<br/>pgx · transaction + SQL"]
  end
  subgraph DB["④ db (container bitbaan-db)"]
    PG[("PostgreSQL 16<br/>CHECK · unique index<br/>row lock")]
  end
  B -- "localhost:3000" --> UI
  PW -- "localhost:3000" --> UI
  UI --- CART
  UI -- "nginx ส่งต่อ /api/* → backend:8080" --> API
  PW -- "/api/test/reset · /api/test/clock" --> API
  API --> RULES
  API --> CLOCK
  RULES --> CLOCK
  JOB --> DBLIB
  API --> DBLIB
  DBLIB -- "bitbaan-net<br/>db:5432" --> PG
  PC -. "localhost:5434 (ดูข้อมูลจากเครื่องเราเท่านั้น)" .-> PG
```

![System Architecture](design/architecture.png)

| ชั้น | อยู่ที่ไหน | หน้าที่ | ทดสอบด้วยอะไร |
| --- | --- | --- | --- |
| หน้าเว็บ | `frontend/` → container `bitbaan-frontend` (nginx) | แสดงสินค้า หน้าจัดสเปก ตะกร้า นับถอยหลัง (ตัวเลขมาจากเวลาของเว็บ NFR-16) · ตะกร้าอยู่ในเบราว์เซอร์ ราคาคิดที่ backend ทุกครั้ง | Playwright 3 เบราว์เซอร์ |
| API | `backend/` → container `bitbaan-backend` | รับคำสั่ง กดสั่ง จ่ายเงิน ยกเลิก คืนของ หลังร้าน · คำขอทดสอบ `/api/test/*` · รูปแบบตาม `API-CONTRACT.md` | Playwright `request` · `contract.spec.ts` |
| `internal/pricing` `internal/compat` | `backend/` | คิดเงินตามลำดับ G1 → G4 และตรวจความเข้ากันได้ · ฟังก์ชันล้วน รับเวลาเป็นพารามิเตอร์ | `go test` ด้วยตาราง quote ใน `TEST-DATA.md` + oracle อิสระ (การบ้านขั้น 3) |
| `internal/clock` | `backend/` | คืน "เวลาตอนนี้" ของเว็บ · ปกติใช้เวลาจริง · ตอนทดสอบล็อกด้วย `POST /api/test/clock` | ตั้งเวลาแล้วตรวจราคา flash sale |
| ตัวปล่อยของ | `backend/` | เปลี่ยนออเดอร์รอจ่ายที่เกินเวลาเป็น "หมดเวลา" และคืนของ (FR-41) | เลื่อนเวลาไป 30:01 แล้วอ่านจำนวน |
| ฐานข้อมูล | container `bitbaan-db` | เก็บข้อมูล · **ด่านสุดท้ายกันขายเกิน** ด้วย CHECK และ unique index | race test 50 รอบ (ขั้น 2) · query ตรวจหลังทดสอบ |

- ทั้ง 3 container อยู่ใน `docker-compose.yml` เดียว และคุยกันผ่าน network `bitbaan-net` · backend ต่อฐานข้อมูลที่ `db:5432` · พอร์ต **5434** เปิดให้เครื่องเราดูข้อมูลเท่านั้น
- เบราว์เซอร์และ Playwright เข้าทางเดียวคือ `localhost:3000` · nginx ส่ง `/api/*` ต่อให้ backend จึงไม่มีปัญหา CORS
- `BUG_MODE` 0 / 1 / 2 อ่านจากตัวแปรสภาพแวดล้อมของ backend ตอบที่ `GET /api/test/bug-mode` และหน้าเว็บใส่ `<body data-bug-mode>` (NFR-10)
- `/api/test/*` และ header `X-Test-User` ใช้ได้เฉพาะเมื่อ `TEST_MODE=1`
- เปลี่ยนจาก Next.js ในบท 04 เป็น Vite + Go ตามที่ทีมตัดสินใจ ดู `CONSISTENCY.md`

---

## 2. Use Case

<!-- render: use-case -->
```mermaid
flowchart LR
  G(["ลูกค้าไม่ล็อกอิน<br/>(C1, คุณบีม)"])
  M(["สมาชิก<br/>(คุณนิดา C2, คุณโอ๊ต C3,<br/>คุณพลอย C4, คุณต้น C6)"])
  BZ(["บริษัท<br/>(คุณจอย C5)"])
  P(["ผู้ปกครอง<br/>(เปิดลิงก์สเปก)"])
  ST(["พนักงาน<br/>(คุณมิ้นท์)"])
  OW(["เจ้าของร้าน<br/>(คุณเก่ง)"])
  T(["นาฬิกาของระบบ"])
  subgraph SYS["เว็บบิตบ้าน"]
    U1["ดูสินค้า ป้ายแดง flash sale<br/>FR-01–06"]
    U2["จัดสเปก ตรวจเข้ากัน เตือนพาวเวอร์ งบ<br/>FR-08–17"]
    U3["บันทึกและเปิดลิงก์สเปก<br/>FR-18–22"]
    U4["ตะกร้า คูปอง ใบสรุปราคา<br/>FR-23–30"]
    U5["กดสั่ง กันของ 30 นาที<br/>FR-31–39"]
    U6["จ่ายเงิน รับใบยืนยัน<br/>FR-40–45"]
    U7["ยกเลิก คืนของ ดูเงินคืน<br/>FR-46–50"]
    U8["ใบเสนอราคา ใบกำกับภาษี<br/>FR-51–53"]
    U9["สมัคร เข้าสู่ระบบ ดูระดับ<br/>FR-29, FR-54"]
    U10["หลังร้าน: ออเดอร์ สถานะ ขายหน้าร้าน<br/>FR-07, FR-55"]
    U11["ตั้งบัญชี Business · ตั้งเวลาเปิดขายล็อตใหม่<br/>FR-06, FR-56"]
    U12["ปล่อยของหมดเวลา<br/>FR-41"]
  end
  G --> U1 & U2 & U3 & U4 & U5 & U6 & U7
  M --> U1 & U2 & U3 & U4 & U5 & U6 & U7 & U9
  BZ --> U4 & U5 & U6 & U8 & U9
  P --> U3 & U4 & U5 & U6
  ST --> U10
  OW --> U10 & U11
  T --> U12
```

![Use Case](design/use-case.png)

---

## 3. Flowchart

### 3.1 หน้าจัดสเปก: เลือกหรือเปลี่ยนชิ้น

<!-- render: flow-builder -->
```mermaid
flowchart TD
  A["ลูกค้าเลือกชิ้นในหมวด X"] --> B{"ชิ้นนี้ใส่กับชิ้นอื่น<br/>ที่เลือกไว้ได้ไหม<br/>BR-25 socket · BR-26 แรม<br/>BR-27 ความยาวการ์ดจอ · BR-28 ขนาดบอร์ด"}
  B -- "ไม่ได้ (เลือกจากรายการ)" --> B1["ตัวเลือกกดไม่ได้ตั้งแต่แรก<br/>แสดงเหตุผล FR-10"]
  B -- "ได้" --> C["ใส่ชิ้นในสเปก<br/>อัปเดตราคารวม FR-09"]
  C --> D{"ชิ้นเดิมในหมวดอื่น<br/>ยังเข้ากันกับชิ้นใหม่ไหม<br/>(กรณีเปลี่ยนชิ้น)"}
  D -- "ไม่ได้" --> D1["ชิ้นเดิมยังอยู่ แสดงสีแดง<br/>ปุ่มใส่ตะกร้ากดไม่ได้<br/>FR-12 ⚠️ A-19"]
  D -- "ได้" --> E{"มีการ์ดจอและพาวเวอร์<br/>วัตต์ < ที่แนะนำ? BR-29"}
  D1 --> E
  E -- "ใช่" --> E1["แสดงคำเตือน + ปุ่มเปลี่ยนเป็น 750W<br/>ไม่เอาพาวเวอร์ออก FR-13, FR-14"]
  E -- "ไม่ใช่" --> F
  E1 --> F{"ใส่งบไว้ไหม"}
  F -- "ใส่" --> F1["งบ − ราคาสินค้ารวม BR-35<br/>≥ 0 เหลือ · < 0 เกิน (สั่งได้)"]
  F -- "ไม่ใส่" --> G
  F1 --> G{"ให้ร้านประกอบ?"}
  G -- "ไม่" --> G0["ค่าประกอบ ฿0"]
  G -- "ใช่" --> H{"ครบ 7 หมวด? BR-21 ⚠️ A-04"}
  H -- "ครบ" --> H1["ค่าประกอบ ฿0"]
  H -- "ไม่ครบ" --> H2["ค่าประกอบ ฿500<br/>บอกหมวดที่ขาด"]
  G0 & H1 & H2 --> Z["ปุ่ม 'ใส่ตะกร้าทั้งชุด'<br/>ใช้ได้เมื่อไม่มีชิ้นสีแดง"]
```

![Flowchart หน้าจัดสเปก](design/flow-builder.png)

### 3.2 กดสั่ง กันของ จ่ายเงิน

<!-- render: flow-order -->
```mermaid
flowchart TD
  A["ลูกค้ากด 'สั่งซื้อ'"] --> A1["ปล่อยออเดอร์หมดเวลาก่อน FR-41"]
  A1 --> B{"สินค้าทุกชิ้นถึงเวลาเปิดขาย? BR-34"}
  B -- "ยัง" --> B1["409 NOT_RELEASED"]
  B -- "ถึงแล้ว" --> C{"จำนวนที่ขายได้พอทุกชิ้น?<br/>BR-32 · BR-33"}
  C -- "ไม่พอ" --> C1["409 OUT_OF_STOCK<br/>บอกชื่อชิ้นที่หมด FR-37<br/>ไม่สร้างออเดอร์"]
  C -- "พอ" --> D{"มีสินค้าจำกัด 1 ใบ<br/>และบัญชีนี้มีสิทธิ์ค้างอยู่? BR-31"}
  D -- "มี" --> D1["409 LIMIT_REACHED FR-38"]
  D -- "ไม่มี" --> E{"มีคูปอง?"}
  E -- "NEWBIT200 แต่ใช้ไปแล้ว BR-16, BR-17" --> E1["409 COUPON_USED"]
  E -- "ใช้ได้ / ไม่มี" --> F["คิดราคา ล็อกราคา BR-09<br/>สร้างออเดอร์ 'รอจ่าย'<br/>hold_until = เวลาตอนนี้ + 30:00 BR-30"]
  F --> G["หน้าจ่ายเงิน นับถอยหลัง FR-39"]
  G --> H{"ลูกค้ากดจ่ายตอนไหน"}
  H -- "เวลาผ่านไป ≤ 30:00" --> I{"ออเดอร์นี้จ่ายแล้วหรือยัง"}
  I -- "ยัง" --> I1["บันทึกการจ่าย 1 ครั้ง<br/>สถานะ 'จ่ายแล้ว' FR-40"]
  I -- "แล้ว" --> I2["ตอบผลเดิม ไม่ตัดเงินซ้ำ FR-43"]
  H -- "เกิน 30:00 / ไม่จ่าย" --> J["ตัวปล่อยของ: 'หมดเวลา'<br/>คืนจำนวน คืนสิทธิ์ คืนคูปอง FR-41"]
  J --> J1["กดจ่ายภายหลัง → 409 ORDER_EXPIRED FR-42"]
```

![Flowchart กดสั่งและจ่ายเงิน](design/flow-order.png)

### 3.3 คำนวณราคาสุทธิตามลำดับของร้าน

ลำดับนี้เป็นสมมติฐาน ⚠️ A-10 (มีแค่ "สมาชิกก่อนคูปอง" ที่ร้านพูดเอง บ.22) · ทุกส่วนลด % ปัดส่วนลดลงเป็นบาทเต็ม ⚠️ A-11

<!-- render: flow-price -->
```mermaid
flowchart TD
  S["ราคาป้ายทุกชิ้น × จำนวน"] --> F{"ศุกร์ 12:00:00 ≤ เวลา < 13:00:00<br/>BR-06 · BR-07<br/>(เวลา = ตอนกดสั่ง BR-09)"}
  F -- "ใช่" --> F1["ชิ้นป้ายแดง: ราคา − ปัดลง(10%) BR-08"]
  F -- "ไม่ใช่" --> G1
  F1 --> G1["G1 = ผลรวมหลัง flash sale"]
  G1 --> BU{"มี CPU และเมนบอร์ด? BR-10"}
  BU -- "มี" --> BU1["G2 = G1 − 500 × min(CPU, บอร์ด)"]
  BU -- "ไม่มี" --> BU2["G2 = G1"]
  BU1 & BU2 --> MB{"ระดับสมาชิก BR-01–05"}
  MB -- "ทั่วไป / ไม่ล็อกอิน" --> M0["อัตรา 0%"]
  MB -- "Silver" --> M3["3%"]
  MB -- "Gold" --> M5["5%"]
  MB -- "Business" --> M8["8%"]
  M0 & M3 & M5 & M8 --> G3["G3 = G2 − ปัดลง(G2 × อัตรา) BR-11"]
  G3 --> CP{"คูปอง BR-19 (1 โค้ด)"}
  CP -- "NEWBIT200 · ล็อกอิน · ออเดอร์แรก<br/>G3 ≥ 2,000 BR-15, BR-16" --> C1["G4 = G3 − 200"]
  CP -- "GAMER5 · มีการ์ดจอหรือจอ BR-18" --> C2["G4 = G3 − min(ปัดลง(5% × ราคาหลัง flash ของการ์ดจอและจอ × (100 − อัตราสมาชิก)%), 1,000)"]
  CP -- "ไม่มี / ใช้ไม่ได้" --> C3["G4 = G3"]
  C1 & C2 & C3 --> AS["+ ค่าประกอบ ฿0 หรือ ฿500 BR-21"]
  AS --> SH{"วิธีส่ง"}
  SH -- "ปกติ" --> SH1{"G4 ≥ 3,000? BR-22"}
  SH1 -- "ใช่" --> S0["+ ฿0"]
  SH1 -- "ไม่ใช่" --> S60["+ ฿60"]
  SH -- "ด่วน (กรุงเทพฯ) BR-23" --> S150["+ ฿150"]
  SH -- "รับที่ร้าน BR-24" --> SP["+ ฿0"]
  S0 & S60 & S150 & SP --> T["ยอดชำระ (บาทเต็ม)"]
  T --> V["VAT = ปัดครึ่งขึ้น(ยอด × 7 ÷ 107, 2) BR-40<br/>ก่อน VAT = ยอด − VAT"]
```

![Flowchart คำนวณราคา](design/flow-price.png)

**ตัวอย่าง** คุณโอ๊ต (Silver) ศุกร์ 13 พ.ย. 12:30 · CPU-N5 + MB-B6 ส่งปกติ

| ขั้น | วิธีคิด | ยอด |
| --- | --- | ---: |
| ราคาป้าย | 6,290 + 4,590 | 10,880 |
| G1 | MB-B6 ป้ายแดง − 459 | 10,421 |
| G2 | − 500 × 1 | 9,921 |
| G3 | 9,921 × 3% = 297.63 → − 297 | 9,624 |
| G4 | ไม่มีคูปอง | 9,624 |
| ค่าส่ง | 9,624 ≥ 3,000 | 0 |
| **ยอดชำระ** | | **9,624** |
| VAT | 9,624 × 7 ÷ 107 = 629.607… | 629.61 |

### 3.4 ยกเลิกและคืนของ

<!-- render: flow-cancel-return -->
```mermaid
flowchart TD
  A["ลูกค้าเปิดออเดอร์ของตัวเอง"] --> B{"สถานะตอนนี้ BR-36"}
  B -- "รอจ่าย" --> C1["ยกเลิกได้ · ไม่มีเงินคืน<br/>คืนจำนวน คืนสิทธิ์ คืนคูปอง"]
  B -- "จ่ายแล้ว (ยังไม่แพ็ก)" --> C2["ยกเลิกได้ · คืนเต็มรวมค่าส่ง ⚠️ A-24<br/>คืนจำนวน คืนสิทธิ์"]
  B -- "แพ็กแล้ว / ส่งแล้ว" --> C3["ยกเลิกไม่ได้<br/>รอรับของแล้วใช้การคืนของ"]
  B -- "ได้รับแล้ว" --> D{"ของเสียจากโรงงาน?"}
  D -- "ใช่" --> D1["ไปช่องทางเคลมประกัน FR-49<br/>ไม่ใช้กฎคืนของ"]
  D -- "ไม่ใช่" --> E{"ยังอยู่ในช่วงคืน?<br/>ถึง 23:59:59 ของวันที่ 7 BR-37"}
  E -- "เลยแล้ว" --> E1["ขอคืนไม่ได้"]
  E -- "ยังอยู่" --> F{"แกะกล่องแล้ว? BR-38"}
  F -- "ยัง" --> F1["คืนเต็มยอดที่จ่ายของชิ้นนั้น<br/>ไม่คืนค่าส่ง"]
  F -- "แกะแล้ว" --> F2["คืน = ยอดที่จ่าย − ปัดลง(10%)<br/>ไม่คืนค่าส่ง"]
  C2 & F1 & F2 --> R["บันทึกเงินคืน 'รอโอนคืน' FR-50<br/>ร้านกด 'โอนคืนแล้ว' ในหลังร้าน"]
```

![Flowchart ยกเลิกและคืนของ](design/flow-cancel-return.png)

---

## 4. ERD

<!-- render: erd -->
```mermaid
erDiagram
  users ||--o{ orders : "สั่ง"
  users ||--o{ spend_ledger : "ยอดซื้อ"
  users ||--o{ builds : "บันทึก"
  users ||--o{ quotes : "ขอ"
  users ||--o{ sessions : "ล็อกอิน"
  products ||--o{ order_items : "อยู่ใน"
  products ||--o{ build_items : "อยู่ใน"
  products ||--o{ quote_items : "อยู่ใน"
  products ||--o{ product_lots : "เข้าเป็นล็อต"
  products ||--o{ store_sales : "ขายหน้าร้าน"
  product_lots ||--o{ limited_claims : "สิทธิ์ต่อล็อต"
  builds ||--o{ build_items : "มี"
  orders ||--|{ order_items : "มี"
  orders ||--o| payments : "จ่ายได้ 1 ครั้ง"
  orders ||--o{ limited_claims : "ใช้สิทธิ์"
  orders ||--o| coupon_redemptions : "ใช้โค้ด"
  orders ||--o{ refunds : "เงินคืน"
  orders ||--o| tax_invoices : "ใบกำกับภาษี"
  coupons ||--o{ coupon_redemptions : "ถูกใช้"
  quotes ||--|{ quote_items : "มี"
  quotes ||--o{ orders : "สั่งจากใบเสนอ"

  users {
    uuid id PK
    text email UK
    text password_hash
    text name
    text phone
    text role "customer | staff | owner"
    boolean is_business
    char13 tax_id "CHECK 13 หลัก BR-40"
    text company_name
  }
  spend_ledger {
    bigint id PK
    uuid user_id FK
    numeric_12_2 amount
    text source "web | store"
    timestamptz occurred_at "BR-04 นับ 365 วัน"
  }
  products {
    text sku PK
    text name
    text category
    numeric_10_2 price
    boolean red_tag
    int on_hand "CHECK >= 0"
    int available "CHECK >= 0 ด่านกันขายเกิน"
    int per_buyer_limit "GPU-V57 = 1"
    text socket
    text ram_type
    text form_factor
    text_array case_supports
    int gpu_length_mm
    int case_max_gpu_mm
    int tdp_w
    int recommended_psu_w
    int psu_output_w
    boolean in_builder
  }
  product_lots {
    bigint id PK
    text sku FK
    int qty
    timestamptz release_at "BR-34"
    boolean released
  }
  store_sales {
    bigint id PK
    text sku FK
    int qty
    numeric_12_2 amount
    uuid staff_id FK
    uuid customer_id FK
    timestamptz sold_at
  }
  sessions {
    text token PK
    uuid user_id FK
    timestamptz created_at
  }
  builds {
    uuid id PK
    text share_code UK
    uuid owner_id FK
    numeric_12_2 budget
    boolean want_assembly
    timestamptz saved_at
  }
  build_items {
    uuid build_id PK
    text category PK
    text sku FK
    numeric_10_2 price_at_save "ไว้แสดงส่วนต่าง FR-20"
  }
  coupons {
    text code PK
    text kind "fixed | percent"
    numeric_10_2 value
    numeric_12_2 min_amount
    numeric_12_2 max_discount
    text_array categories
    boolean first_order_only
    timestamptz expires_at
  }
  orders {
    uuid id PK
    text order_no UK
    uuid user_id FK
    text guest_phone
    text buyer_key "user:id หรือ phone:เบอร์"
    text status
    timestamptz placed_at "ล็อกราคา BR-09"
    timestamptz hold_until "placed_at + 30 นาที"
    timestamptz paid_at
    timestamptz packed_at
    timestamptz delivered_at
    text shipping_method
    text province
    text coupon_code FK
    uuid quote_id FK
    numeric_12_2 list_total
    numeric_12_2 flash_discount
    numeric_12_2 bundle_discount
    numeric_5_2 member_rate
    numeric_12_2 member_discount
    numeric_12_2 coupon_discount
    numeric_10_2 assembly_fee
    numeric_10_2 shipping_fee
    numeric_12_2 total
  }
  order_items {
    uuid order_id PK
    text sku PK
    int qty
    numeric_10_2 unit_list_price
    numeric_10_2 unit_price "หลัง flash"
    boolean opened_on_return
  }
  payments {
    uuid id PK
    uuid order_id UK "จ่ายได้ครั้งเดียว FR-43"
    numeric_12_2 amount
    timestamptz paid_at
  }
  limited_claims {
    bigint id PK
    bigint lot_id FK
    text buyer_key
    uuid order_id FK
    text status "held | paid | released"
  }
  coupon_redemptions {
    bigint id PK
    text code FK
    uuid user_id FK
    uuid order_id FK
    text status "held | paid | released"
  }
  refunds {
    bigint id PK
    uuid order_id FK
    text kind "cancel | return"
    numeric_12_2 amount
    numeric_12_2 fee
    text status "pending | done"
    timestamptz requested_at
    timestamptz refunded_at
  }
  tax_invoices {
    bigint id PK
    uuid order_id UK
    text invoice_no UK
    text company_name
    char13 tax_id
    numeric_12_2 base_amount
    numeric_12_2 vat
    numeric_12_2 total "CHECK base + vat = total"
  }
  quotes {
    uuid id PK
    text quote_no UK
    uuid user_id FK
    timestamptz issued_at
    timestamptz valid_until "BR-39"
    numeric_12_2 total
  }
  quote_items {
    uuid quote_id PK
    text sku PK
    int qty
    numeric_10_2 unit_price
  }
  app_settings {
    text key PK "clock_now | bug_mode"
    text value
  }
```

![ERD](design/erd.png)

**ตะกร้า:** อยู่ใน localStorage ของเบราว์เซอร์ ไม่มีตารางในฐานข้อมูล ราคาคิดใหม่ที่ backend ทุกครั้งที่เปิดตะกร้าและตอนกดสั่ง จึงไม่มีราคาค้างในตะกร้า

**เงิน:** ทุกคอลัมน์เงินใช้ `NUMERIC(12,2)` หรือ `NUMERIC(10,2)` ไม่ใช้ float · ในโค้ดคิดเป็นหน่วยสตางค์ (จำนวนเต็ม) แล้วแปลงกลับตอนแสดง (NFR-05) · Mermaid เขียนชนิดข้อมูลเป็น `numeric_12_2` เพราะใส่วงเล็บไม่ได้

### กลไกกันขายเกินและกันสิทธิ์ซ้ำ (ที่ชั้นข้อมูล)

```sql
-- 1) จำนวนที่ขายได้ห้ามติดลบ (BR-32): ด่านสุดท้าย แม้โค้ดเว็บมีบั๊ก
ALTER TABLE products ADD CONSTRAINT available_not_negative CHECK (available >= 0);

-- 2) กันของแบบมีเงื่อนไขในคำสั่งเดียว (ไม่ใช่เช็กก่อนแล้วค่อยบันทึก)
UPDATE products SET available = available - $qty
 WHERE sku = $sku AND available >= $qty
RETURNING available;          -- ได้ 0 แถว = ของไม่พอ → ROLLBACK ทั้งออเดอร์ (FR-36)

-- 3) คนละ 1 ใบต่อล็อต (BR-31): 2 แท็บพร้อมกัน แท็บที่ 2 ชน unique → 409
CREATE UNIQUE INDEX one_claim_per_buyer_per_lot
  ON limited_claims (lot_id, buyer_key) WHERE status IN ('held', 'paid');

-- 4) NEWBIT200 ครั้งเดียวต่อบัญชี (BR-17)
CREATE UNIQUE INDEX one_first_order_coupon
  ON coupon_redemptions (user_id) WHERE code = 'NEWBIT200' AND status IN ('held', 'paid');

-- 5) จ่ายได้ครั้งเดียวต่อออเดอร์ (FR-43)
ALTER TABLE payments ADD CONSTRAINT one_payment_per_order UNIQUE (order_id);
```

- คำสั่ง 2 ใช้ row lock ของ PostgreSQL: คำขอที่มาพร้อมกันต้องรอกันทีละคำขอที่แถวสินค้าเดียวกัน คำขอที่มาทีหลังเห็นจำนวนล่าสุดเสมอ
- ออเดอร์หลายชิ้น lock แถวสินค้าเรียงตาม `sku` เสมอ เพื่อกัน deadlock เมื่อ 2 ออเดอร์มีสินค้าชุดเดียวกันคนละลำดับ
- ขายหน้าร้าน (FR-07) ใช้คำสั่ง 2 ชุดเดียวกัน หน้าร้านกับเว็บจึงแย่งของกันได้อย่างปลอดภัย (US-03)

---

## 5. Sequence

### 5.1 ลูกค้ากดสั่งและจ่ายเงิน

<!-- render: seq-order -->
```mermaid
sequenceDiagram
  autonumber
  actor O as คุณโอ๊ต (C3)
  participant B as เบราว์เซอร์
  participant W as web (หน้าเว็บ + API)
  participant P as internal/pricing
  participant D as PostgreSQL
  O->>B: กด "สั่งซื้อ" (CPU-N5 + MB-B6, ศุกร์ 12:30)
  B->>W: POST /api/orders {items, coupon, shipping}
  W->>D: BEGIN
  W->>D: ปล่อยออเดอร์หมดเวลา (FR-41)
  W->>D: UPDATE products SET available = available - 1 WHERE sku IN (เรียงตาม sku) AND available >= 1
  D-->>W: ได้ 2 แถว (ของพอ)
  W->>D: อ่านยอด 12 เดือนจาก spend_ledger (BR-04)
  W->>P: quote(items, Silver, เวลาของเว็บ 12:30)
  P-->>W: G1 10,421 · G2 9,921 · G3 9,624 · ค่าส่ง 0 · total 9,624
  W->>D: INSERT orders (status รอจ่าย, hold_until 13:00:00) + order_items
  W->>D: COMMIT
  W-->>B: 201 {orderNo, total 9624, holdUntil}
  B-->>O: หน้าจ่ายเงิน นับถอยหลัง 30:00
  O->>B: กด "จ่ายด้วย QR" (12:41)
  B->>W: POST /api/orders/{orderNo}/pay
  W->>D: BEGIN · SELECT order FOR UPDATE
  W->>W: เวลาผ่านไป 11:00 ≤ 30:00 (BR-30)
  W->>D: INSERT payments (unique order_id) · UPDATE orders SET status จ่ายแล้ว
  W->>D: COMMIT
  W-->>B: 200 {status paid}
  B-->>O: ใบยืนยันออเดอร์
```

![Sequence กดสั่งและจ่ายเงิน](design/seq-order.png)

### 5.2 GPU-V57 เหลือ 1 ใบ 2 คนกดสั่งพร้อมกัน

<!-- render: seq-race -->
```mermaid
sequenceDiagram
  autonumber
  actor O as คุณโอ๊ต
  actor L as คุณพลอย
  participant W as web API
  participant D as PostgreSQL
  par พร้อมกัน
    O->>W: POST /api/orders (GPU-V57 × 1)
  and
    L->>W: POST /api/orders (GPU-V57 × 1)
  end
  W->>D: [โอ๊ต] BEGIN · UPDATE products SET available = available - 1 WHERE sku = 'GPU-V57' AND available >= 1
  Note over D: แถว GPU-V57 ถูก lock โดยโอ๊ต
  W->>D: [พลอย] BEGIN · UPDATE ... (คำสั่งเดียวกัน)
  Note over D: พลอยรอ lock
  D-->>W: [โอ๊ต] 1 แถว available = 0
  W->>D: [โอ๊ต] INSERT orders + limited_claims · COMMIT
  Note over D: ปล่อย lock
  D-->>W: [พลอย] 0 แถว (available = 0 ไม่ผ่าน >= 1)
  W->>D: [พลอย] ROLLBACK
  W-->>O: 201 กันของ 30 นาที
  W-->>L: 409 OUT_OF_STOCK "สินค้าหมดแล้ว"
  Note over W,D: ตรวจหลังยิง: available = 0 · ออเดอร์ GPU-V57 ที่ยังใช้งาน = 1 (BR-32)
```

![Sequence 2 คนแย่งของชิ้นสุดท้าย](design/seq-race.png)

### 5.3 บัญชีเดียวกัน 2 แท็บ กดสั่ง GPU-V57 พร้อมกัน (ของยังมี 2 ใบ)

<!-- render: seq-limit -->
```mermaid
sequenceDiagram
  autonumber
  actor T1 as คุณโอ๊ต แท็บ 1
  actor T2 as คุณโอ๊ต แท็บ 2
  participant W as web API
  participant D as PostgreSQL
  par พร้อมกัน
    T1->>W: POST /api/orders (GPU-V57 × 1)
  and
    T2->>W: POST /api/orders (GPU-V57 × 1)
  end
  W->>D: [แท็บ 1] UPDATE products ... available 2 → 1
  W->>D: [แท็บ 1] INSERT limited_claims (lot, user:C3, held)
  W->>D: [แท็บ 2] UPDATE products ... available 1 → 0
  W->>D: [แท็บ 2] INSERT limited_claims (lot, user:C3, held)
  D-->>W: [แท็บ 2] ERROR 23505 ชน one_claim_per_buyer_per_lot
  W->>D: [แท็บ 2] ROLLBACK (available กลับเป็น 1)
  W->>D: [แท็บ 1] COMMIT
  W-->>T1: 201 กันของ 30 นาที
  W-->>T2: 409 LIMIT_REACHED "รุ่นนี้จำกัดคนละ 1 ใบ"
  Note over W,D: ตรวจ: available = 1 · claim ของ C3 = 1 (BR-31)
```

![Sequence สิทธิ์คนละ 1 ใบ](design/seq-limit.png)

### 5.4 ไม่จ่ายใน 30 นาที ระบบปล่อยของคืน

<!-- render: seq-expire -->
```mermaid
sequenceDiagram
  autonumber
  participant C as internal/clock
  participant J as ตัวปล่อยของ (ทุก 1 วินาที)
  participant D as PostgreSQL
  actor L as คุณพลอย
  participant W as web API
  Note over C: กดสั่ง 12:42:00 · hold_until 13:12:00
  C->>J: เวลาของเว็บ = 13:12:01
  J->>D: BEGIN
  J->>D: UPDATE orders SET status = หมดเวลา WHERE status = รอจ่าย AND hold_until < now RETURNING id
  J->>D: UPDATE products SET available = available + qty (ของออเดอร์ที่หมดเวลา)
  J->>D: UPDATE limited_claims / coupon_redemptions SET status = released
  J->>D: COMMIT
  L->>W: GET /api/products/GPU-V57
  W->>D: ปล่อยออเดอร์หมดเวลา (ซ้ำได้ ไม่มีผลถ้าไม่มีอะไรค้าง)
  W-->>L: available = 1 ปุ่มสั่งกดได้
  Note over W: ถ้าลูกค้าเดิมกดจ่ายตอนนี้ → 409 ORDER_EXPIRED (FR-42)
```

![Sequence ปล่อยของหมดเวลา](design/seq-expire.png)

- ใช้ `hold_until < now` จึงยังจ่ายได้ที่ 30:00 พอดี (⚠️ A-17) และปล่อยของที่ 30:01
- ตัวปล่อยของรันทุก 1 วินาที **และ** ทุกคำขอที่อ่านจำนวนสินค้า ทำให้ผลไม่ขึ้นกับว่ามีคนเปิดเว็บไหม (NFR-11) และ test ที่เลื่อนเวลาเห็นผลทันทีโดยไม่ต้องรอ

---

## 6. คำถามที่ได้จากการออกแบบ

### ต้องถามร้าน

| รหัส | คำถาม | เจอตอนวาด | กระทบ |
| --- | --- | --- | --- |
| D-01 | ถ้าลูกค้ากดจ่ายตอน 29:59 แต่ธนาคารยืนยันตอน 30:05 นับว่าทันไหม | Sequence 5.1 | BR-30 |
| D-02 | ขายหน้าร้านให้สมาชิก ต้องบันทึกยอดเข้าบัญชีสมาชิกไหม ใครเป็นคนผูก | ERD `store_sales.customer_id` | BR-04 |
| D-03 | ของล็อตใหม่ 2 ใบ เข้ามาตอนที่ล็อตเก่ายังมีคนกันของค้างอยู่ สิทธิ์คนละ 1 ใบนับรวมล็อตเก่าไหม | ERD `product_lots` | BR-31 |
| D-04 | ยกเลิกออเดอร์ที่ใช้ NEWBIT200 แล้ว ได้โค้ดคืนไหม | Flowchart 3.4 | BR-16 |
| D-05 | คืนของ 1 ชิ้นจากออเดอร์ที่ได้ส่วนลดชุดประกอบ ต้องหักส่วนลดชุดประกอบคืนไหม | Flowchart 3.4 | BR-10, BR-38 |
| D-06 | คืนของแล้ว ยอดซื้อ 12 เดือนลดลงด้วยไหม ถ้าลดจนหลุด Silver ทำอย่างไรกับออเดอร์ที่ได้ 3% ไปแล้ว | ERD `spend_ledger` | BR-04 |
| D-07 | ใบเสนอราคาที่ออกในช่วง flash sale ได้ราคา flash ไหม | Flowchart 3.3 | BR-39 |
| D-08 | ผู้ปกครองจ่ายจากลิงก์สเปกของลูกที่ไม่ล็อกอิน ใบเสร็จออกชื่อใคร | Use Case | FR-22 |
| D-09 | พนักงานเปลี่ยนสถานะย้อนหลังได้ไหม เช่น กด "แพ็กแล้ว" ผิด | Flowchart 3.4 | BR-36 |

### ทีมตัดสินใจเอง

| รหัส | เรื่อง | ตัดสินใจ | เหตุผล |
| --- | --- | --- | --- |
| T-01 | กันขายเกิน | `UPDATE ... WHERE available >= qty` + `CHECK` | ไม่ต้องเช็กก่อนแล้วค่อยบันทึก จึงไม่มีช่องว่างให้คำขอแทรก |
| T-02 | ลำดับ lock | เรียงตาม `sku` | กัน deadlock ตอน 2 ออเดอร์มีของชุดเดียวกัน |
| T-03 | เวลาของเว็บ | `internal/clock` อ่าน `app_settings.clock_now` ถ้ามี | ทดสอบ flash sale และ 30 นาทีได้โดยไม่ต้องรอจริง |
| T-04 | คิดเงิน | `internal/pricing` เป็นฟังก์ชันล้วน ใช้สตางค์เป็นจำนวนเต็ม | ทดสอบด้วย unit และ property test ได้ เทียบ oracle ได้ |
| T-05 | ปล่อยของหมดเวลา | ทุก 1 วินาที + ทุกคำขอ | ไม่ต้องพึ่ง cron ภายนอก และ test เห็นผลทันที |
| T-06 | `buyer_key` | `user:<id>` หรือ `phone:<เบอร์>` | ใช้ unique index เดียวกันได้ทั้งสมาชิกและคนไม่ล็อกอิน (A-18) |
| T-07 | ราคาในออเดอร์ | เก็บทุกขั้น (flash, ชุดประกอบ, สมาชิก, คูปอง) ในออเดอร์ | ใบสรุปราคาและใบกำกับภาษีย้อนดูได้ แม้ราคาป้ายเปลี่ยนทีหลัง |

### FR / BR ที่ยังไม่อยู่ในแผนภาพใด

- FR-02 (ข้อความ "ราคารวม VAT แล้ว"), FR-33 (เวลาเปิดร้าน), FR-49 (ลิงก์เคลมประกัน) เป็นข้อความบนหน้าเว็บ ไม่มีทางแยกให้วาด · ตรวจใน TEST-PLAN ด้วยการดูหน้าจอ
- BR ครบทุกข้อ 40/40
