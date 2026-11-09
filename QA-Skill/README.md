# QA Skill · `tc-from-user-story`

Skill สำหรับ QA: แปลง user story และเกณฑ์ยอมรับให้เป็น test scenario และ test case แบบ black-box **ก่อนมีโค้ด** พร้อมตาราง traceability (US → AC → TC) และตรวจ coverage ด้วยสคริปต์

ทดลองกับ [examples/USER-STORIES-IHAVECPU.md](examples/USER-STORIES-IHAVECPU.md) (45 US · 90 เกณฑ์ยอมรับ · 25 คำถามค้าง · 14 เรื่องขัดกัน)

## โครงสร้าง

```text
QA-Skill/
├─ README.md                     ← ไฟล์นี้
├─ examples/
│  ├─ USER-STORIES-IHAVECPU.md   ← input ที่ใช้ทดลอง
│  └─ TEST-CASES-category-C-v0.1.md ← ผลรันจริงหมวด C ด้วย v0.1 (43 TC · coverage 100%)
└─ tc-from-user-story/           ← ตัว skill (คัดทั้งโฟลเดอร์นี้ไปติดตั้ง)
   ├─ SKILL.md                      ← กติกา 6 ข้อ + ขั้นตอน 5 ขั้น (AI อ่านทุกครั้งที่ใช้)
   ├─ references/
   │  ├─ tc-template.md             ← แม่แบบ TEST-CASES.md (สคริปต์อ่านตาราง traceability ตามแม่แบบนี้)
   │  ├─ test-design.md             ← เลือกเทคนิค BVA / EP / Decision / State + ตัวอย่างจาก iHAVECPU
   │  └─ decisions.md               ← บทเรียนที่จดไว้ (เพิ่มทุกครั้งที่ skill พลาด)
   └─ scripts/
      ├─ parse-stories.mjs          ← user story .md → stories.json (US, AC, Q, K, ที่มาของค่า)
      └─ check-coverage.mjs         ← นับ coverage ต่อเกณฑ์ · exit 1 ถ้าเกณฑ์ Must ไม่มี TC
```

แบ่งงานตามหลัก "งานซ้ำให้โค้ด งานคิดให้ AI"

| งาน | ใครทำ |
|---|---|
| แยก US, เกณฑ์ยอมรับ, Q/K ออกจากเอกสาร | 🔧 `parse-stories.mjs` |
| เลือกเทคนิค ออกแบบ TC ขั้นตอน และข้อมูลทดสอบ | 🧠 AI |
| นับ coverage, ตรวจรหัสซ้ำ, ตรวจว่า TC อ้าง US/AC ที่มีจริง, หาว่า Q ไหนกระทบ TC มากสุด | 🔧 `check-coverage.mjs` |
| ตอบคำถามค้าง (Q) และตัดสินเรื่องที่ขัดกัน (K) | 🧑 คน (เจ้าของ requirement) |

## ติดตั้ง

รันจากรากของ repo

skill ส่วนตัว (ใช้ได้ทุกโปรเจกต์):

```bash
cp -r QA-Skill/tc-from-user-story ~/.claude/skills/
```

หรือ skill ของโปรเจกต์ (ทั้งทีมได้ผ่าน Git):

```bash
mkdir -p .claude/skills && cp -r QA-Skill/tc-from-user-story .claude/skills/
```

> ถ้าติดตั้งแบบโปรเจกต์ path สคริปต์ใน SKILL.md จะเป็น `.claude/skills/tc-from-user-story/scripts/` แทน `~/.claude/...` (SKILL.md บอกไว้แล้ว)

ตรวจสคริปต์โดยไม่ต้องใช้ AI (Node ≥ 18):

```bash
node QA-Skill/tc-from-user-story/scripts/parse-stories.mjs QA-Skill/examples/USER-STORIES-IHAVECPU.md > /tmp/stories.json
```

```bash
node QA-Skill/tc-from-user-story/scripts/check-coverage.mjs /tmp/stories.json QA-Skill/examples/TEST-CASES-category-C-v0.1.md --us US-15,US-16,US-17,US-18,US-19,US-20,US-21,US-22,US-23
```

ผลที่ควรเห็น: coverage 100% (18/18 เกณฑ์ · 43 TC) และคำเตือนเรื่อง Q26–Q34 กับ K7 ซึ่งเป็นปัญหาของ v0.1 ที่ v0.2 แก้แล้ว (ดู CHANGELOG)

## ลองใช้ (แชตใหม่)

```text
เขียน test case จาก user story ใน QA-Skill/examples/USER-STORIES-IHAVECPU.md เฉพาะหมวด C ตะกร้าและการจ่ายเงิน
```

หรือเรียกตรง ๆ:

```text
/tc-from-user-story QA-Skill/examples/USER-STORIES-IHAVECPU.md เฉพาะ Must
```

## Eval: ทดสอบว่าเลือกใช้ skill ถูกจังหวะไหม

ให้รันแต่ละข้อในแชตใหม่ แล้วดูแค่ว่าขั้นแรกของ Claude เรียก `Skill: tc-from-user-story` หรือไม่

| # | พรอมต์ | ควรเลือกใช้ไหม |
|---|---|---|
| 1 | `เขียน test case จาก user story ในไฟล์นี้ให้หน่อย` | ✅ ควร |
| 2 | `ออกแบบเทสจากเกณฑ์ยอมรับของ US-16 ถึง US-18` | ✅ ควร |
| 3 | `รัน e2e ตาม TEST-PLAN.md แล้วสรุปผล` | ❌ ไม่ควร (งานของ `test-from-plan`) |
| 4 | `เขียนรายงานบั๊กจาก test ที่ล้มเมื่อกี้` | ❌ ไม่ควร (งานของ `bug-report`) |
| 5 | `ช่วยดูว่า user story พวกนี้ครบไหม` | ⚠️ กำกวม: เป็นการรีวิว requirement ไม่ใช่การเขียน TC ถ้าเลือกใช้ ควรถามผู้ใช้ก่อน |

> ⚠️ ในเครื่องนี้มี skill `tc-ts-generator` อยู่แล้ว ซึ่งสร้าง TC เป็น xlsx **จากโค้ด** ส่วน skill นี้สร้างจาก **user story** ก่อนมีโค้ด ถ้าข้อ 1–2 ไปหยิบ `tc-ts-generator` แปลว่า `description` ยังแยกสองตัวนี้ได้ไม่ชัด ต้องแก้

## CHANGELOG

### v0.2.0 · 2026-11-06 (บทเรียนจากรันจริงหมวด C: 43 TC, coverage 100%)
| เจออะไร | แก้ที่ | ประเภท |
|---|---|---|
| `$SKILL_DIR` / `S=...` ถูกระบบตรวจสิทธิ์บล็อก 2 ครั้ง | `SKILL.md`: เรียกสคริปต์ด้วย path เต็ม ห้ามตั้งตัวแปร | กติกา |
| TC-16-03 ข้อมูลทดสอบ "ยอดรวม 5,001 บาท" ไม่บอกสินค้า | `SKILL.md` ขั้น 3 + แม่แบบ: ระบุ สินค้า × จำนวน = ยอด | กติกา |
| คำถามใหม่ต่อเลขเป็น Q26–Q34 ชนกับเอกสารได้ | `SKILL.md` กติกา 2 + `check-coverage.mjs`: รหัส `QA<n>` ต้องประกาศในหัวข้อ 5, Q/K ที่ไม่มีในเอกสารถูกเตือน | กติกา + สคริปต์ |
| คำเตือน K7 ที่ไม่เกี่ยวจริง 5 ข้อค้างอยู่ | `check-coverage.mjs`: รองรับ `ไม่เกี่ยว:K7` ในคอลัมน์ "ขึ้นกับ" | สคริปต์ |
| (เจอระหว่างแก้) `"Q10".includes("Q1")` ทำให้นับ Q1 ผิด | `check-coverage.mjs`: แยก token แทนการค้นข้อความ | บั๊กสคริปต์ |

### v0.1.0 · 2026-11-06
ร่างแรก · eval เลือกใช้ skill ถูก 5/5

## ขั้นต่อไปตามวงจร 6 ขั้น

- [x] ขั้น 3: ร่าง skill (ฉบับนี้ v0.1.0)
- [ ] ขั้น 4–5: **คนอ่าน `SKILL.md` แล้วสั่งแก้** โดยดูโดยเฉพาะว่ามีจุดไหนที่ AI ตัดสินแทนเราแล้วทำให้ TC ผ่านง่ายขึ้นไหม
- [ ] ขั้น 6: รันพรอมต์ในหัวข้อ "ลองใช้" ในแชตใหม่ แล้วรัน eval 5 ข้อ
- [ ] 🔁 พลาดตรงไหน สั่ง "จดบทเรียนนี้ลง skill" (คำตอบของร้านต่อ Q ให้จดในส่วน "เฉพาะโปรเจกต์" ของ `decisions.md`)
