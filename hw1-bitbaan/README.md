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
cd backend && go test ./internal/...               # ชั้น unit · ตาราง quote 27 แถว + ความเข้ากันได้ทุกคู่
cd e2e && npm ci && npx playwright install         # ติดตั้งครั้งเดียว
cd e2e && npm test                                 # 146 test · api + ui 3 เบราว์เซอร์ (≈ 1 นาที 10 วินาที)
cd e2e && npm run test:race                        # ขั้น 2 · 50 รอบ × N = 2, 5, 10 (≈ 50 วินาที)
cd e2e && npm run test:property -- --seed 2026     # ขั้น 3 · property 4,000 แบบ (≈ 2 นาที 40 วินาที)
node mutation/run.mjs                              # ขั้น 4 · mutation testing ของโมดูลกฎ
./tools/render-diagrams.sh                         # render แผนภาพใน DESIGN.md เป็น design/*.png
```

เปิด `e2e/index.html` เพื่อดูสรุปผลทั้งหมดในหน้าเดียว · รายงาน Playwright อยู่ที่ `e2e/test-report/html/index.html` หลังรัน

### คำสั่งตามแม่แบบของผู้สอน ↔ ของร้านนี้

แม่แบบการบ้านสมมติว่าโปรเจกต์แยกเป็น `db/` + `web/` แต่ร้านนี้ใช้ `backend/` + `frontend/` ใน compose เดียว ตารางนี้คือคู่ที่ตรงกัน

| คำสั่งในแม่แบบ | คำสั่งของร้านนี้ |
| --- | --- |
| `docker compose -f db/compose.yml up -d && docker compose -f web/compose.yml up -d` | `docker compose up -d --build` (ยกทั้ง db · backend · frontend) |
| `cd e2e && npm ci && npx playwright test` | เหมือนกัน (`npm test`) |
| `cd e2e && npm run test:race` | เหมือนกัน |
| `cd e2e && npm run test:property -- --seed 2026` | เหมือนกัน |
| `cd web && npm run mutation` | `node mutation/run.mjs` — โมดูลกฎเป็น Go จึงใช้ Stryker ไม่ได้ ดูเหตุผลใน `MUTATION-REPORT.md` |

### รันกับโหมดบั๊ก

```bash
BUG_MODE=1 docker compose up -d --build backend
cd e2e && EXPECT_BUG_MODE=1 npx playwright test tests --project=api   # ควรแดง 9 ข้อ ดู BUG-HUNT.md
docker compose up -d backend                                          # กลับเป็นโหมดปกติ
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
| `SPEC.md` · `ASSETS.md` | LAB 6 · สิ่งที่ AI อ้างว่าสร้าง [A] · รูปและไฟล์ที่เว็บใช้ (เขียนย้อนหลังจากโค้ด) |
| `CONSISTENCY.md` | เทียบงานของเรากับหน้าออกแบบของทีม และเหตุผลที่เลือก |
| `design/*.html` | หน้าออกแบบของทีม (อ้างของ 12 รายการ ดู `CONSISTENCY.md`) |
| `frontend/` | หน้าเว็บ Vite + React + TypeScript |
| `backend/` | API Go · `internal/pricing` (คิดเงิน) · `internal/compat` (เข้ากันได้) · `internal/store` (ฐานข้อมูล) |
| `backend/BUGS.md` | ⛔ เฉลย `BUG_MODE=1` ห้ามเปิดจนจบขั้น 5 |
| `prompts/` | พรอมต์ที่ใช้ เรียงตามลำดับ |
| `docker-compose.yml` | 3 container ใน network `bitbaan-net` |
| `QUESTIONS-TO-OWNER.md` | ขั้น 1 · 51 คำถามแบบปิดถึงร้าน พร้อมสมมติฐานและ TC ที่กระทบ |
| `TEST-PLAN.md` | 114 TC ครอบ FR 59 · BR 40 · NFR 16 · ค่าขอบ E01–E141 (§3.13 เพิ่ม 9 TC จากช่องว่างใน `SPEC.md`) |
| `EXPLORATION.md` · `PLAN-REVIEW.md` · `BUILD-PROMPT.md` | บันทึกการสำรวจ · ทบทวนแผน · ข้อกำหนดการสร้างเว็บ |
| `e2e/` | Playwright · `tests/` ตามแผน · `race/` ขั้น 2 · `property/` ขั้น 3 · `index.html` สรุปผล · `triage.json` |
| `mutation/` | ตัวรัน mutation testing ของโมดูลกฎ (ขั้น 4) |
| `RACE-REPORT.md` · `PROPERTY-REPORT.md` · `MUTATION-REPORT.md` · `BUG-HUNT.md` | รายงานขั้น 2 · 3 · 4 · 5 |
| `REVIEW.md` | สรุปสถานะงานให้ทีม และสิ่งที่ยังเหลือ |
