# การบ้านข้อ 1 · บิตบ้าน คอมพิวเตอร์

ร้านชิ้นส่วนคอมพิวเตอร์สมมติที่ทีมเขียนเอง · เว็บสั่งซื้อพร้อมหน้าจัดสเปกเอง กันของ 30 นาที และกันขายซ้ำ

> ⚠️ **ยังไม่มีหลักฐานในรีโปว่าผู้สอนอนุมัติ scenario ร้านนี้**
> ฉบับก่อนของไฟล์นี้เขียนว่า "scenario ทดลองที่ผู้สอนอนุญาต" — ไม่มีอีเมล ประกาศ หรือบันทึกใดในรีโปรองรับประโยคนั้น จึงถอนออก
> ตอนนี้อยู่ระหว่าง **ขอยืนยันกับผู้สอน** · รายละเอียดและความเสี่ยงต่อคะแนนอยู่ใน `REVIEW.md` ข้อ 6 ข้อ 1

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
- โหมดบั๊ก: `BUG_MODE=1` หรือ `BUG_MODE=2` (ดูข้อ "รันกับโหมดบั๊ก") · ตรวจ `curl localhost:3000/api/test/bug-mode`
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
cd backend && go test ./internal/...               # ชั้น unit · ตาราง quote 27 แถว + ความเข้ากันได้ทุกคู่ + TC-MUT-01…12
cd e2e && npm ci && npx playwright install         # ติดตั้งครั้งเดียว
cd e2e && npm test                                 # ตามแผน · api + ui 3 เบราว์เซอร์
cd e2e && npm run test:race                        # ขั้น 2 · แย่งของชั้น API
cd e2e && npm run test:race:ui                     # ขั้น 2 · แย่งของบนหน้าเว็บจริง 2 หน้าต่าง
cd e2e && npm run race:gif                         # ทำ GIF หลักฐานจากภาพนิ่งที่ test ถ่ายไว้
cd e2e && npm run test:property -- --seed 2026     # ขั้น 3 · property P1–P6 + ตาราง oracle
cd e2e && npm run test:oracle                      # ขั้น 3 · oracle อิสระ vs ตาราง quote 27 แถว
cd e2e && npm run test:thrice                      # NFR-15 · รันชุดตามแผน 3 รอบติด
cd e2e && npm run evidence                         # LAB 12 · อัดวิดีโอ chromium ทุก test ชั้น ui แล้วแปลงเป็น GIF รายตัว
node mutation/run.mjs                              # ขั้น 4 · mutation testing ของโมดูลกฎ
./tools/render-diagrams.sh                         # render แผนภาพใน DESIGN.md เป็น design/*.png
```

### ผลที่รันได้จริง (BUG_MODE=0 · วัดบนเครื่องของทีม)

| คำสั่ง | ผล | เวลา |
| --- | --- | --- |
| `go test ./internal/...` | ผ่านทั้ง `pricing` และ `compat` | ไม่กี่วินาที |
| `npm test` | **213 ผ่าน** (api 117 + ui 32 × 3 เบราว์เซอร์) | ~4 นาที |
| `npm test` 3 รอบติด (`test:thrice`) | **ผลเท่ากันทุกรอบ** · 1.3 / 1.2 / 1.2 นาที → NFR-15 ผ่าน | — |
| `npm run test:race` | **7 ผ่าน** · 50 รอบ × N = 2, 5, 10 + ตัวคุม `naive-sequential` | 1.1 นาที |
| `npm run test:race:ui` | **2 ผ่าน** · `TC-RACE-02` (2 เครื่อง) · `TC-RACE-02b` (2 แท็บ บัญชีเดียว) | ~8 วินาที |
| `npm run test:property` | **33 ผ่าน** = ตาราง oracle 27 แถว + property 6 ข้อ (**6,000 แบบ** · seed 2026) | ~1.5 นาที |
| `node mutation/run.mjs` | 197 mutant ที่ใช้ได้จริง · score **80.2%** (รอบ 7 บนทรีที่ merge แล้ว · หัก mutant ที่อยู่หลัง `BugMode == 2` ซึ่งฆ่าไม่ได้ = 82.3% · ดู `MUTATION-REPORT.md` ข้อ 2.1) | ~8 นาที |

> **แก้ตัวเลขที่เคยเขียนผิด:** README ฉบับก่อนเขียนว่า property รัน `4,000 แบบ` — ตอนนั้นของจริงคือ **3,000 แบบ** (P2/P4/P6 รัน 250/500/250 ไม่ใช่ 1,000) เลข 4,000 คิดผิดมาแต่ต้น
> ตอนนี้ทั้ง 6 property รัน `RUNS` (ค่าตั้งต้น 1,000) เท่ากันหมด จึงเป็น **6,000 แบบ** จริง ๆ · ปรับจำนวนด้วย `RUNS=200 npm run test:property`

เปิด `e2e/index.html` เพื่อดูสรุปผลทั้งหมดในหน้าเดียว · รายงาน Playwright อยู่ที่ `e2e/test-report/html/index.html` หลังรัน
หลักฐานภาพของขั้น 2 อยู่ที่ `e2e/test-report/race-ui/` (`race-ui.gif` · `race-ui-A.webm` · `race-ui-B.webm` · `race-ui-side-by-side.png` และชุด `race-tabs-*`)

### คำสั่งตามแม่แบบของผู้สอน ↔ ของร้านนี้

แม่แบบการบ้านสมมติว่าโปรเจกต์แยกเป็น `db/` + `web/` แต่ร้านนี้ใช้ `backend/` + `frontend/` ใน compose เดียว ตารางนี้คือคู่ที่ตรงกัน

| คำสั่งในแม่แบบ | คำสั่งของร้านนี้ |
| --- | --- |
| `docker compose -f db/compose.yml up -d && docker compose -f web/compose.yml up -d` | `docker compose up -d --build` (ยกทั้ง db · backend · frontend) |
| `cd e2e && npm ci && npx playwright test` | เหมือนกัน (`npm test`) |
| `cd e2e && npm run test:race` | เหมือนกัน (ชั้น API) · **เพิ่ม** `npm run test:race:ui` ที่ขับหน้าเว็บจริง 2 browser context |
| `cd e2e && npm run test:property -- --seed 2026` | เหมือนกัน · **เพิ่ม** `npm run test:oracle` ที่ตรวจ oracle กับตาราง quote 27 แถวก่อน แล้วค่อยเอา oracle ไปใช้ใน P1 |
| `cd web && npm run mutation` | `node mutation/run.mjs` — โมดูลกฎเป็น Go จึงใช้ Stryker ไม่ได้ ดูเหตุผลใน `MUTATION-REPORT.md` ข้อ 1 |
| — (แม่แบบไม่มี) | `npm run race:gif` — ทำ GIF หลักฐานจากภาพนิ่ง **โดยไม่ใช้ ffmpeg** (เหตุผลด้านล่าง) |
| — (แม่แบบไม่มี) | `npm run test:thrice` — รันชุดตามแผน 3 รอบติดเพื่อพิสูจน์ NFR-15 |

### ทำไม `race:gif` ไม่ใช้ ffmpeg

`ui-race.spec.ts` ถ่ายภาพนิ่งทั้งสองหน้าต่างทุก **120 มิลลิวินาที** (เริ่มก่อนกดสั่ง 500 ms และถ่ายต่ออีก 700 ms หลังผลขึ้นจอ)
จากนั้น `race/make-gif.mjs` อ่าน PNG ด้วย `pngjs` → ต่อภาพ A ซ้าย B ขวา → ย่อ 3 เท่า → เข้ารหัสด้วย `gifenc` โดยใช้ palette เดียวทั้งไฟล์
ได้ `race-ui.gif` · **12 เฟรม · 606×273 · 131 KB (134,201 ไบต์)**
> ตัวเลขนี้อ่านจากไบต์ของไฟล์ที่อยู่ในรีโปตอนนี้ · ฉบับก่อนเขียน `12 เฟรม · 131 KB` ซึ่งเป็นไฟล์รอบแรกก่อน re-run test
> **จำนวนเฟรมไม่คงที่ระหว่างรอบ** เพราะขึ้นกับว่าหน้าเว็บตอบเร็วแค่ไหน — ใครรันใหม่จะได้เลขต่างออกไปเล็กน้อย ถือเป็นเรื่องปกติ (`RACE-REPORT.md` ข้อ 8)

เหตุผลที่ไม่พึ่ง ffmpeg: ตัวที่มากับ Playwright ถูก build ด้วย `--disable-everything` (ไม่มี gif muxer · ไม่มี `hstack` · ไม่มี `palettegen`) และเครื่องผู้ตรวจอาจไม่มี ffmpeg เลย
วิดีโอ `.webm` ยังเก็บไว้ด้วย เพราะ project `race-ui` ตั้ง `video: 'on'` หลักฐานจึงเหลือรอดแม้ test **ผ่าน**

## รันกับโหมดบั๊ก

### `BUG_MODE=1` · บั๊กที่ Claude ฝังไว้ (ขั้นซ้อมก่อนแลกบั๊ก)

```bash
BUG_MODE=1 docker compose up -d --build backend
cd e2e && EXPECT_BUG_MODE=1 npx playwright test tests --project=api   # ควรแดง 9 ข้อ
docker compose up -d backend                                          # กลับเป็นโหมดปกติ
```

จับได้ 3 / 3 · รายละเอียดอยู่ใน `BUG-HUNT.md` ส่วนที่ 1 · เฉลยคือ `backend/BUGS.md`

### `BUG_MODE=2` · บั๊ก 5 ตัวที่ฝังโดย agent ที่ถูกห้ามอ่านชุดทดสอบ

```bash
BUG_MODE=2 docker compose up -d --build backend
cd e2e && EXPECT_BUG_MODE=2 npx playwright test tests                    # 107 ผ่าน · 20 แดง
cd e2e && EXPECT_BUG_MODE=2 npx playwright test property --project=api   # 32 ผ่าน · 1 แดง (P1)
cd e2e && EXPECT_BUG_MODE=2 npx playwright test race --project=api       # 7 ผ่าน · 0 แดง
docker compose up -d backend                                             # กลับเป็นโหมดปกติ
```

| | |
| --- | --- |
| บั๊กที่ฝัง | 5 |
| แผนจับได้ | **5 / 5** · TC แดงรวม 21 (20 จากชุดตามแผน + P1) |
| ข้อควรระวังในการอ่านตัวเลขนี้ | บั๊ก #1 ทำให้แดง **16 ข้อ** ส่วนบั๊ก #2–#5 แต่ละตัวมี TC จับได้ **ข้อเดียวเป๊ะ** — ถ้า TC ข้อนั้นหายไป บั๊กหลุดทันที |
| เฉลย | `backend/BUGS2.md` (commit ทีหลัง เพื่อให้ลำดับ commit พิสูจน์ว่าชุดทดสอบมาก่อนบั๊ก) |

รายงานเต็มและข้อจำกัดของการซ้อมแบบนี้อยู่ใน `BUG-HUNT.md` ส่วนที่ 2 (โดยเฉพาะ §2.4 และ §2.7)
**นี่ยังไม่ใช่การแลกบั๊กกับทีมคู่จริง** — ขั้น 5 ตามโจทย์ยังรอผู้สอนจับคู่

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
| `CHARTERS.md` · `exploration/` | LAB 7–8 · แผนผังหน้า · charter 7 ใบ · ผลสำรวจทีละ charter |
| `CONSISTENCY.md` | เทียบงานของเรากับหน้าออกแบบของทีม และเหตุผลที่เลือก |
| `design/*.html` | หน้าออกแบบของทีม (อ้างของ 12 รายการ ดู `CONSISTENCY.md`) |
| `frontend/` | หน้าเว็บ Vite + React + TypeScript |
| `backend/` | API Go · `internal/pricing` (คิดเงิน) · `internal/compat` (เข้ากันได้) · `internal/store` (ฐานข้อมูล) |
| `backend/internal/pricing/boundary_test.go` | ขั้น 4 · 12 unit test ที่มาจาก mutant ที่รอดโดยตรง (= `TC-MUT-01`…`TC-MUT-12`) |
| `backend/BUGS.md` | ⛔ เฉลย `BUG_MODE=1` ห้ามเปิดจนจบขั้น 5 |
| `backend/BUGS2.md` | ⛔ เฉลย `BUG_MODE=2` · 5 บั๊ก พร้อมกฎที่ขัดและวิธีทำซ้ำ |
| `prompts/` | พรอมต์ **21 ตัว** เรียงเลข 1 ไฟล์ = 1 พรอมต์ |
| `prompts/README.md` | สารบัญพรอมต์ · 16 ตัวกู้มา **verbatim** จาก transcript ของ Claude Code · ที่เหลือบันทึกด้วยมือ (รวมพรอมต์ oracle) |
| `docker-compose.yml` | 3 container ใน network `bitbaan-net` |
| `QUESTIONS-TO-OWNER.md` | ขั้น 1 · 51 คำถามแบบปิดถึงร้าน พร้อมสมมติฐานและ TC ที่กระทบ |
| `TEST-PLAN.md` | **147 TC** (unit 23 · api 68 · ui 52) ครอบ FR 59 · BR 40 · NFR 16 · ค่าขอบ E01–E141 · ตาราง 4.5 โยง mutant S1–S11 → TC |
| `EXPLORATION.md` · `PLAN-REVIEW.md` · `BUILD-PROMPT.md` | บันทึกการสำรวจ · ทบทวนแผน · ข้อกำหนดการสร้างเว็บ |
| `e2e/` | Playwright · `tests/` ตามแผน · `race/` ขั้น 2 · `property/` ขั้น 3 · `index.html` สรุปผล · `triage.json` |
| `e2e/property/oracle/price.ts` | ขั้น 3 · **oracle อิสระ** (`ORACLE_READY = true`) เขียนจากเอกสารล้วน ๆ ไม่ได้เปิด `backend/` |
| `e2e/race/ui-race.spec.ts` | ขั้น 2 · `TC-RACE-02` 2 browser context และ `TC-RACE-02b` 2 แท็บบัญชีเดียว (project `race-ui`) |
| `e2e/race/make-gif.mjs` | ขั้น 2 · ทำ `race-ui.gif` จากภาพนิ่ง ด้วย `pngjs` + `gifenc` (ไม่ใช้ ffmpeg) |
| `e2e/test-report/race-ui/` | หลักฐานขั้น 2 · GIF · วิดีโอ 2 ฝั่ง · ภาพเทียบข้างกัน |
| `mutation/` | ตัวรัน mutation testing ของโมดูลกฎ (ขั้น 4) · ผลดิบ `round1.json`–`round3.json` |
| `RACE-REPORT.md` · `PROPERTY-REPORT.md` · `MUTATION-REPORT.md` · `BUG-HUNT.md` | รายงานขั้น 2 · 3 · 4 · 5 |
| `REVIEW.md` | สรุปสถานะงานให้ทีม · ประเมินตามรูบริก · สิ่งที่ยังเหลือ และสิ่งที่ต้องเคลียร์กับผู้สอน |
