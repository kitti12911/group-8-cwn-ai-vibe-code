# บันทึกพรอมต์ · บิตบ้าน คอมพิวเตอร์

> กติกาการบ้าน: *"ใช้ Claude Code ได้เต็มที่ · ต้องเก็บพรอมต์ทุกตัว ใน `prompts/` เรียงเลข (ตัวต่อตัว ไม่สรุป)"*
> ไฟล์ในโฟลเดอร์นี้ **1 ไฟล์ = 1 พรอมต์** · เนื้อพรอมต์ใต้บรรทัด `--- PROMPT (verbatim) ---` เป็นข้อความที่พิมพ์จริง **ไม่แก้ ไม่เกลา ไม่แปล** คงคำผิดและความห้วนไว้ตามเดิม
> ส่วนที่ขึ้นต้นด้วย `#` ด้านบนของทุกไฟล์คือ metadata ที่เติมทีหลัง ไม่ใช่สิ่งที่พิมพ์

| | จำนวน |
| --- | ---: |
| พรอมต์ทั้งหมด | **21** |
| กู้จาก Claude Code transcript แบบ verbatim | 16 |
| บันทึกด้วยมือ (ไม่มี transcript) | 5 |
| ช่วงเวลา | 2026-11-06 บ่าย → 2026-11-07 เช้ามืด (+07) |

## 1. รายการพรอมต์

| # | เวลา (+07) | ผู้พิมพ์ | พรอมต์สั่งอะไร | ได้อะไรออกมา | ที่มาของบันทึก |
| ---: | --- | --- | --- | --- | --- |
| [01](01-lab1-4-request.txt) | ไม่ทราบ | Kitti | สั่งทำ LAB 1-4 จาก INTERVIEW.md + รูปหน้าจอ | USER-STORIES.md · REQUIREMENTS.md · DESIGN.md · TEST-DATA.md (commit bef512c) | บันทึกมือ |
| [02](02-lab4-recompute-subagent.txt) | ไม่ทราบ | Kitti | ให้ agent อิสระคิดราคาใหม่จากกฎล้วน ๆ เพื่อตรวจ TEST-DATA.md | ผลตรวจทานราคา 26 quote + refund + budget ที่ใช้แก้ TEST-DATA.md ก่อน commit bef512c | บันทึกมือ |
| [03](03-pull-request.txt) | ไม่ทราบ | Kitti | ดึงงานล่าสุดของทีมลงมาก่อนทำ consistency (ย้ำว่าเอาเฉพาะ repo ของกลุ่ม ไม่เอา Teaching_CWN2026) | merge `1e5a59e` (main → develop) ก่อนเริ่มงาน consistency | บันทึกมือ |
| [04](04-consistency-and-build-request.txt) | ไม่ทราบ | Kitti | รวมงานเรากับงานเพื่อนให้ข้อมูลตรงกัน แล้วสร้างเว็บจริง (Vite + Go + docker compose) | CONSISTENCY.md · API-CONTRACT.md (`9be7260`) · backend Go (`63d18bc`) · frontend Vite + docker-compose (`0169873`) | บันทึกมือ |
| [05](05-git-checkout-develop.txt) | 2026-11-06 15:21:51 | Peerapat | ถามว่าทำไม checkout develop ไม่ได้ | ตอบในเซสชัน (ยังไม่มีไฟล์ผลลัพธ์) — เป็นพรอมต์แรกของเซสชัน 20d42315 | transcript |
| [06](06-zone-identifier.txt) | 2026-11-06 16:26:15 | Peerapat | ไฟล์ `:Zone.Identifier` ที่ติดมากับ zip ทำให้แตกไฟล์/เช็คเอาต์ไม่ได้ | commit `42c3e3d` ลบไฟล์ `:Zone.Identifier` + กฎใน `.gitignore` (เข้ามากับ `4e442d2`) | transcript |
| [07](07-review-vs-workshop-week01.txt) | 2026-11-06 16:44:13 | Peerapat | อ่านโจทย์ workshop week01 แล้วตรวจงานที่เพื่อนทำไว้ว่าตรงจุดประสงค์ไหม | ผลตรวจเทียบรูบริก → กลายเป็นเนื้อ REVIEW.md | transcript |
| [08](08-summarise.txt) | 2026-11-06 17:07:11 | Peerapat | ขอผลตรวจแบบสรุป | ตอบในเซสชัน — พิมพ์ต่อทันทีเป็นพรอมต์ 09 (ห่างกัน 11 วินาที) | transcript |
| [09](09-summarise-for-team-and-fix-plan.txt) | 2026-11-06 17:07:22 | Peerapat | ขอสรุปให้ทีม + แผนแก้ | REVIEW.md 103 บรรทัด · commit `4e442d2` | transcript |
| [10](10-summarise-and-how-to-score-more.txt) | 2026-11-06 17:09:06 | Peerapat | ขอสรุป + สิ่งที่ควรทำต่อเพื่อให้ได้คะแนนมากขึ้น | หัวข้อ "สิ่งที่ต้องทำต่อ" ใน REVIEW.md → กลายเป็นคิวงานขั้น 0-4 ทั้งหมด | transcript |
| [11](11-commit-local-then-fix.txt) | 2026-11-06 17:16:31 | Peerapat | ให้ commit ไว้ใน local ก่อน แล้วเริ่มแก้ | ตอบในเซสชัน — พิมพ์ต่อเป็นพรอมต์ 12 (ห่างกัน 25 วินาที) | transcript |
| [12](12-commit-local-then-fix-for-homework.txt) | 2026-11-06 17:16:56 | Peerapat | commit local แล้วแก้เพิ่มให้ตอบโจทย์การบ้านมากที่สุด | commit `4e442d2` · TEST-PLAN.md 105 TC (`0c1ff96`) · QUESTIONS-TO-OWNER.md 51 คำถาม (`ea15241`) · `1e3fe0f` | transcript |
| [13](13-continue-make-it-perfect.txt) | 2026-11-06 17:34:43 | Peerapat | สั่งลุยต่อให้ครบทุกขั้น | e2e Playwright + RACE-REPORT.md (`e3d63ea`) · property test P2-P6 + BUG-HUNT.md + PROPERTY-REPORT.md (`2cda283`) · EXPLORATION/PLAN-REVIEW/BUILD-PROMPT + dashboard + triage (`d755a54`) | transcript |
| [14](14-oracle-independent.txt) | ~2026-11-06 18:2x | Peerapat | ให้เขียน oracle ราคาใหม่จาก REQUIREMENTS/INTERVIEW เท่านั้น ไม่ให้ลอกตรรกะจากโค้ดเว็บ | `e2e/property/oracle/price.ts` + `oracle.spec.ts` (commit `2cda283`) · ใช้เป็นตัวเทียบของ property test P1 | บันทึกมือ |
| [15](15-continue.txt) | 2026-11-06 18:50:19 | Peerapat | สั่งทำต่อ (cwd อยู่ใน `hw1-bitbaan/backend`) | MUTATION-REPORT.md · `mutation/run.mjs` + `round1-3.json` · `backend/internal/pricing/boundary_test.go` 12 TC ใหม่ · score 56.0% → 78.8% (commit `dbda838`) | transcript |
| [16](16-grade-as-teacher.txt) | 2026-11-06 19:21:34 | Peerapat | ให้ตรวจว่างานตอบโจทย์ 00_week01 ไหม และถ้าเป็นอาจารย์จะให้กี่คะแนน | การประเมินเทียบรูบริก 25 คะแนน (ตอบในเซสชัน) → อัปเดตตารางคะแนนใน REVIEW.md | transcript |
| [17](17-commit-push-develop.txt) | 2026-11-06 20:11:31 | Peerapat | สั่ง commit แล้ว push ขึ้น develop | merge `160b6f9` (รวมงาน UI/UX ของเพื่อนจาก origin/develop) แล้ว push | transcript |
| [18](18-compare-with-commit-0169873.txt) | 2026-11-06 20:15:47 | Peerapat | ให้เทียบงานปัจจุบันกับ commit `0169873a` ของเพื่อนว่าอันไหนดีกว่า | ตอบในเซสชัน — พิมพ์ใหม่เป็นพรอมต์ 19 (ห่างกัน 44 วินาที) | transcript |
| [19](19-compare-with-version-0169873.txt) | 2026-11-06 20:16:31 | Peerapat | พิมพ์ซ้ำโดยเปลี่ยนคำว่า commit เป็น version | ผลเทียบเวอร์ชัน (ตอบในเซสชัน) | transcript |
| [20](20-bug-swap-and-better-prompts.txt) | 2026-11-07 03:46:58 | Peerapat | ขอเพิ่มงานแลกบั๊ก (ขั้น 5) และรื้อ `prompts/` ให้ดีกว่าเดิม เป้าอย่างน้อย 20 คะแนน | งานขั้น 5 (แลกบั๊ก) + การรื้อ `prompts/` ครั้งนี้ — พิมพ์ซ้ำเป็นพรอมต์ 21 (ห่างกัน 56 วินาที) | transcript |
| [21](21-bug-swap-and-better-prompts-or-more.txt) | 2026-11-07 03:47:54 | Peerapat | พิมพ์ซ้ำพรอมต์ 20 เติมท้ายว่า "หรือ มากกว่า." | พรอมต์ที่สั่งงานขั้น 5 + รื้อ `prompts/` จริง (ไฟล์ชุดนี้คือผลของพรอมต์ 20-21) | transcript |

> พรอมต์ 08/09, 11/12, 18/19, 20/21 คือการ**พิมพ์ซ้ำ/พิมพ์แก้ภายในไม่กี่สิบวินาที** — เก็บไว้ทั้งคู่ตามกติกา "ตัวต่อตัว ไม่สรุป" ไม่ได้ยุบรวม
>
> เลขไฟล์ในโฟลเดอร์นี้กับเลขลำดับใน transcript **ไม่ตรงกัน** เพราะแทรกพรอมต์ที่บันทึกมือไว้ด้วย · ตัวที่กู้มา 16 ตัวคือไฟล์ 05-13 และ 15-21 ตามลำดับเวลา — พรอมต์ที่ 15 และ 16 ของ transcript (ตัวสุดท้ายสองตัว) คือไฟล์ **20** กับ **21** ซึ่งเป็นพรอมต์ที่สั่งงานขั้น 5 (แลกบั๊ก) และสั่งรื้อโฟลเดอร์ `prompts/` นี้

## 2. ที่มาและข้อจำกัดของบันทึกนี้

บันทึกนี้ **ไม่ใช่พรอมต์ทั้งหมดที่ทีมพิมพ์** และไม่ได้แกล้งทำเป็นอย่างนั้น · ข้อจำกัดตามจริง:

| ข้อ | เรื่อง | รายละเอียด |
| --- | --- | --- |
| **ก** | พรอมต์ 01-04 มาจากเครื่องของสมาชิกอีกคน | ไฟล์ 4 ตัวนี้ **บันทึกด้วยมือ** ลง `prompts/` โดย Kitti Srijantanakul (commit `bef512c` · `9be7260` · 2026-11-06 16:06 +07) ตอนทำ LAB 1-4 และตอนสร้างเว็บ — path ในพรอมต์ยังเป็น `@playground/` ซึ่งเป็นโฟลเดอร์บนเครื่องของเขา · **ไม่ทราบเวลาที่พิมพ์จริง** รู้แค่เวลาที่ไฟล์เข้า git · ไม่มี transcript มายืนยัน |
| **ข** | พรอมต์ 05-13 · 15-21 กู้มาแบบ verbatim | ดึงจาก Claude Code transcript ของ Peerapat (เซสชัน `20d42315` และ `c576396a`) · ได้ ts/branch/cwd/session ตรงจาก log · **ตรวจซ้ำได้เองด้วยคำสั่งในข้อ 3** ว่าตรงกันทุกตัวอักษร |
| **ค** | พรอมต์ 14 (oracle) เขียนไว้ให้ agent แยก | ไม่ได้พิมพ์สดในเซสชันหลัก แต่เขียนเป็นไฟล์แล้วเอาไปรันใน agent ที่ **สั่งห้ามอ่าน** `backend/` `frontend/` `e2e/` `design/` `TEST-DATA.md` `CONSISTENCY.md` เพื่อไม่ให้ oracle ลอกตรรกะจากโค้ดเว็บ (ถ้าลอก property test จะเขียวทั้งที่ผิด) · รู้แค่ว่าไฟล์เข้า git ตอน `2cda283` 18:23 +07 |
| **ง** | พรอมต์ที่เพื่อนพิมพ์บนเครื่องตัวเอง **ไม่อยู่ในนี้** | งาน design/UI (`Phummarin.R`) และพรอมต์อื่น ๆ ของ Kitti พิมพ์ในเครื่องของเขาเอง · transcript ของ Claude Code เก็บอยู่ใน `~/.claude/projects/` **เฉพาะเครื่องที่พิมพ์** ไม่ได้ sync เข้า git จึงกู้จากเครื่องนี้ไม่ได้ · ที่มีอยู่คือ 4 ตัวที่เขาบันทึกมือไว้เอง |
| **จ** | ไม่มีการเขียนพรอมต์ย้อนหลังเพิ่มเอง | ทุกไฟล์ในโฟลเดอร์นี้คือข้อความที่คนพิมพ์จริง · ไม่มีการแต่งเติม/เรียบเรียง/แปลพรอมต์ขึ้นใหม่ให้ดูดี เพราะปลอมบันทึกแย่กว่ามีบันทึกบาง |

## 3. ตรวจซ้ำเองได้ (re-extraction)

พรอมต์ที่ติดป้าย `transcript` ในตารางข้อ 1 ดึงกลับมาใหม่ได้ด้วย **PowerShell บรรทัดเดียว** นี้ — กรองบรรทัด JSON ที่ `type = 'user'` **และ** `origin.kind = 'human'` แล้วเอา `message.content`:

```powershell
Get-ChildItem "$env:USERPROFILE\.claude\projects\C--Users-PeerapatSattapornnar-Documents-workshop-ai-vibe-code\*.jsonl" | ForEach-Object { Get-Content $_.FullName -Encoding UTF8 } | ForEach-Object { try { $o = $_ | ConvertFrom-Json } catch { return }; if ($o.type -eq 'user' -and $o.origin.kind -eq 'human') { "$($o.timestamp)`t$($o.sessionId.Substring(0,8))`t$($o.message.content)" } } | Sort-Object
```

| เรื่อง | ค่า |
| --- | --- |
| ที่อยู่ transcript | `C:\Users\<user>\.claude\projects\C--Users-PeerapatSattapornnar-Documents-workshop-ai-vibe-code\*.jsonl` |
| ตัวกรอง | `type === 'user'` **และ** `origin.kind === 'human'` (ตัด tool result · สรุปอัตโนมัติ · ข้อความของ assistant ออกหมด) |
| ค่าที่เอา | `message.content` (เป็น string ล้วน ทุกพรอมต์ในชุดนี้เป็นบรรทัดเดียว) |
| ผลที่ควรได้ | **16 บรรทัด** ตรงกับพรอมต์ 05-13 และ 15-21 ในโฟลเดอร์นี้ทุกตัวอักษร |
| เซสชันที่เกี่ยว | `20d42315-a6e9-4fc6-8f81-70557847eb40` (พรอมต์ 05-13 · 15) · `c576396a-bf2b-40a2-9675-1c5dcaf1e784` (พรอมต์ 16-21) |

> transcript อยู่นอก repo (อยู่ใน home ของผู้ใช้) จึงไม่ได้ commit มาด้วย · ถ้ารันคำสั่งบนเครื่องอื่นจะได้ 0 บรรทัด ซึ่งเป็นเรื่องปกติ

## 4. เส้นทางงานตามพรอมต์

| ช่วง | พรอมต์ | ผลที่ลง git |
| --- | --- | --- |
| LAB 1-4 + สร้างเว็บ | 01-04 | `bef512c` `9be7260` `63d18bc` `0169873` |
| ตรวจงานทีมเทียบโจทย์ week01 | 05-10 | `42c3e3d` `4e442d2` (REVIEW.md) |
| แผนทดสอบ + คำถามถึงร้าน | 11-12 | `0c1ff96` (105 TC) `ea15241` (51 คำถาม) `1e3fe0f` |
| e2e · race · property · oracle | 13-14 | `e3d63ea` `2cda283` `d755a54` |
| mutation testing 3 รอบ | 15 | `dbda838` (56.0% → 78.8%) |
| ประเมินคะแนน + รวมงานเพื่อน | 16-19 | `160b6f9` |
| ขั้น 5 แลกบั๊ก + รื้อ `prompts/` | 20-21 | งานชุดนี้ |
