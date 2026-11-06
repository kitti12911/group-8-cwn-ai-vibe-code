# ASSETS · บิตบ้าน คอมพิวเตอร์

> เขียนย้อนหลังจากโค้ด 7 พ.ย. 2026 · ไล่จาก `frontend/index.html` · `frontend/src/**` · `frontend/src/styles.css` · โฟลเดอร์ `img/` และ `design/`

**สรุป:** หน้าเว็บไม่ใช้ไฟล์รูปเลย · ไม่มี `frontend/public/` · ไม่มี `<img>` `<svg>` หรือ `url()` ในโค้ด · ไม่มีรูปถ่ายสินค้า ไม่มีรูปจริงของคน · ไม่มีรูปจากเน็ต · สิ่งที่โหลดจากภายนอกมีแค่ฟอนต์จาก Google Fonts

## 1. สิ่งที่หน้าเว็บใช้จริง

| ของ | ใช้ที่ไหน | ที่มา · สัญญาอนุญาต |
| --- | --- | --- |
| ฟอนต์ IBM Plex Sans Thai (400–700) | ตัวหนังสือทุกหน้า (`--font`) | Google Fonts โหลดใน `frontend/index.html` · SIL Open Font License 1.1 · ถ้าโหลดไม่ได้ใช้ system-ui แทน |
| ฟอนต์ IBM Plex Mono (400–600) | ราคา SKU เลขออเดอร์ นับถอยหลัง (`--mono`, class `mono`) | Google Fonts · SIL OFL 1.1 · สำรอง ui-monospace / Menlo |
| ช่องรูปลายทาง `.ph` | การ์ดหน้าแรก · การ์ดสินค้า · หน้าสินค้า (ข้อความ "[ภาพสินค้า SKU]") · ตะกร้า | CSS `repeating-linear-gradient` ใน `styles.css` · ใช้ผ่าน component `Ph` ใน `components/common.tsx` (คอมเมนต์ในโค้ด: "the shop has no photos yet") และ class `ph` ตรง ๆ ใน `Home.tsx` `Products.tsx` |
| ป้าย "ป้ายแดง" "คนละ 1" "Flash sale −10%" | การ์ดสินค้า หน้าสินค้า หลังร้าน | ข้อความ + CSS (`badge-red`, `badge-dark`, `tag-outline-dark`) ไม่ใช่รูป |
| โลโก้ | หัวเว็บ | ข้อความ "บิตบ้าน" + "BITBAAN.PC" ด้วยฟอนต์ ไม่มีไฟล์โลโก้ |
| สัญลักษณ์ `⚠` `✓` | หน้าจัดสเปก (เตือนพาวเวอร์ · เข้ากันได้) · ลิงก์สเปก · ตะกร้า (ได้ส่วนลดชุดประกอบ) | อักขระ Unicode ในข้อความ ไม่ใช่ไฟล์ไอคอน |
| `−` `฿` `·` `→` | ราคาและข้อความทั่วไป | อักขระ Unicode |
| แถบเวลา แถบงบ แถบระดับสมาชิก | หน้าจ่ายเงิน · จัดสเปก · บัญชี | `<div>` + CSS width ไม่ใช่รูป |
| favicon | – | ไม่มี · เบราว์เซอร์ขอ `/favicon.ico` แล้ว nginx ตอบเป็น `index.html` |

สีทั้งหมดเป็นตัวแปรใน `:root` ของ `styles.css` (พื้น `#f4f3ef` · ตัวอักษร `#141518` · แดง `#b3101f`) ตามหน้าออกแบบใน `design/*.html`

## 2. `img/` · ภาพประกอบ user story (หน้าเว็บไม่ใช้)

| ไฟล์ | ใช้ใน | ที่มา |
| --- | --- | --- |
| `personas.svg` · `story-map.svg` | `USER-STORIES.md` (คน 5 คน · เส้นทางลูกค้า 7 ช่วง) | SVG เขียนเป็นโค้ด (rect + text) ตอน LAB 1 · ไม่มีรูปฝัง (`<image>` / base64) |
| `us-builder.svg` · `us-psu-swap.svg` | `USER-STORIES.md` · `API-CONTRACT.md` ข้อ 5 อ้างเป็นแบบของ `/builder` และ `/b/:code` | เหมือนกัน · ภาพร่างหน้าจอ ไม่ใช่ภาพหน้าจอจริง |
| `us-price-ladder.svg` · `us-hold.svg` · `us-race.svg` · `us-quote.svg` | `USER-STORIES.md` · `us-hold` `us-quote` อ้างใน `API-CONTRACT.md` ข้อ 5 | เหมือนกัน · ตัวเลขในภาพเป็นตัวอย่างจากสัมภาษณ์ |

ฟอนต์ในภาพเรียกจากเครื่อง (Sukhumvit Set, Tahoma, Noto Sans Thai) ไม่ได้ฝังมา หน้าตาจึงต่างกันเล็กน้อยตามเครื่องที่เปิด

## 3. `design/` · หน้าออกแบบและแผนภาพ (หน้าเว็บไม่ใช้)

| ไฟล์ | คืออะไร | ที่มา |
| --- | --- | --- |
| `index.html` `Category.html` `Product.html` `Cart.html` `Checkout.html` `Order.html` `Login.html` `Account.html` `Quote.html` `Admin.html` | หน้าออกแบบ 10 หน้า เปิดในเบราว์เซอร์ได้ · ใช้ฟอนต์ IBM Plex ชุดเดียวกับเว็บ · ช่องรูปเป็นลายทาง `.ph` เหมือนเว็บ | ทีม (branch `develop`) ดู `CONSISTENCY.md` · หน้าเว็บจริงเลียนสีและเลย์เอาต์ แต่ไม่ได้ import ไฟล์เหล่านี้ |
| `dc-lite.js` | ตัววาด template ขนาดเล็กที่หน้าออกแบบใช้ | มากับหน้าออกแบบ |
| `canvas-source/*.dc.html` · `canvas.json` | ต้นฉบับหน้าออกแบบสำหรับเครื่องมือ canvas (10 board รวมหน้า Main) | มากับหน้าออกแบบ |
| `architecture.png` `erd.png` `use-case.png` `flow-*.png` (4) `seq-*.png` (4) | แผนภาพ 11 รูปของ `DESIGN.md` | render จากบล็อก mermaid ใน `DESIGN.md` ด้วย `tools/render-diagrams.sh` (`@mermaid-js/mermaid-cli@11.4.2` + Chrome ในเครื่อง) · สร้างใหม่ได้ทุกเมื่อ |

## 4. สรุปจำนวน

| กลุ่ม | จำนวนไฟล์ | หน้าเว็บใช้ |
| --- | ---: | --- |
| ฟอนต์ภายนอก | 2 ตระกูล | ใช้ |
| รูปใน `frontend/` | 0 | – |
| `img/*.svg` | 8 | ไม่ใช้ |
| `design/*.html` + `dc-lite.js` + `canvas-source/` | 10 + 1 + 11 | ไม่ใช้ |
| `design/*.png` | 11 | ไม่ใช้ |

ถ้าร้านส่งรูปสินค้ามาภายหลัง จุดที่ต้องเปลี่ยนคือ component `Ph` ใน `frontend/src/components/common.tsx` และ class `ph` ใน `Home.tsx` `Products.tsx`
