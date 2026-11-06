# การบ้านข้อ 1 · บิตบ้าน คอมพิวเตอร์

ร้านชิ้นส่วนคอมพิวเตอร์สมมติ (scenario ทดลองที่ผู้สอนอนุญาต) · เว็บสั่งซื้อพร้อมหน้าจัดสเปกเอง กันของ 30 นาที และกันขายซ้ำ

## รันทุกอย่างด้วยคำสั่งเดียว

```bash
docker compose up -d --build        # http://localhost:3000
```

| container | อะไร | พอร์ต |
| --- | --- | --- |
| `bitbaan-frontend` | Vite + React (nginx) · ส่ง `/api/*` ต่อให้ backend | `3000` |
| `bitbaan-backend` | Go API (`TEST_MODE=1`) | ภายใน `8080` |
| `bitbaan-db` | PostgreSQL 16 | `5434` (ดูข้อมูลจากเครื่องเรา) |

- เปิดทุกครั้งข้อมูลกลับเป็นค่าตั้งต้นตาม `TEST-DATA.md` และเวลาเว็บล็อกที่ **ศุกร์ 13 พ.ย. 2026 10:00**
- รีเซ็ตระหว่างทดสอบ: `curl -X POST localhost:3000/api/test/reset`
- เลื่อนเวลา: `curl -X POST localhost:3000/api/test/clock -d '{"now":"2026-11-13T12:00:00+07:00"}'`
- ให้นาฬิกาเดินจริงจากค่านั้น: เพิ่ม `"running": true`
- โหมดบั๊ก: `BUG_MODE=1 docker compose up -d --build backend` · ตรวจ `curl localhost:3000/api/test/bug-mode`
- ปิด: `docker compose down` (เพิ่ม `-v` เพื่อลบข้อมูลในฐานข้อมูล)
- พอร์ต 3000 ชนกับเว็บอื่น (เช่น PawPantry ในบท 02) ให้ปิดเว็บนั้นก่อน

### บัญชีทดสอบ (รหัสผ่าน `Bit12345` ทุกบัญชี)

| รหัส | อีเมล | ระดับ ณ วันทดสอบ |
| --- | --- | --- |
| C2 | `nida@bitbaan.test` | ทั่วไป · ยังใช้ NEWBIT200 ได้ |
| C3 | `oat@bitbaan.test` | Silver |
| C4 | `ploy@bitbaan.test` | Gold |
| C5 | `joy@designco.test` | Business |
| S1 | `mint@bitbaan.test` | พนักงาน (หลังร้าน `/admin`) |

บัญชีขอบทั้งหมดอยู่ใน `TEST-DATA.md` ข้อ 2 · ใน test ใช้ header `X-Test-User: C3` แทนการล็อกอินได้

## test

```bash
cd backend && go test ./internal/...      # ตาราง quote 28 แถวจาก TEST-DATA.md + ความเข้ากันได้ทุกคู่
./tools/render-diagrams.sh                # render แผนภาพใน DESIGN.md เป็น design/*.png
```

## ไฟล์

| ไฟล์ | LAB / ขั้น |
| --- | --- |
| `INTERVIEW.md` | input (ห้ามแก้) |
| `USER-STORIES.md` | LAB 1 · 45 story พร้อมภาพใน `img/` |
| `REQUIREMENTS.md` | LAB 2 · FR 59 · BR 40 · NFR 16 · สมมติฐาน 42 |
| `DESIGN.md` + `design/*.png` | LAB 3 · 11 แผนภาพ |
| `TEST-DATA.md` | LAB 4 · quote 27 แถว · ค่าขอบ 141 แถว |
| `API-CONTRACT.md` | สัญญา API ของร้านนี้ (frontend · backend · test ใช้ร่วมกัน) |
| `CONSISTENCY.md` | เทียบงานของเรากับหน้าออกแบบของทีม และเหตุผลที่เลือก |
| `design/*.html` | หน้าออกแบบของทีม (อ้างของ 12 รายการ ดู `CONSISTENCY.md`) |
| `frontend/` | หน้าเว็บ Vite + React + TypeScript |
| `backend/` | API Go · `internal/pricing` (คิดเงิน) · `internal/compat` (เข้ากันได้) · `internal/store` (ฐานข้อมูล) |
| `backend/BUGS.md` | ⛔ เฉลย `BUG_MODE=1` ห้ามเปิดจนจบขั้น 5 |
| `prompts/` | พรอมต์ที่ใช้ เรียงตามลำดับ |
| `docker-compose.yml` | 3 container ใน network `bitbaan-net` |
