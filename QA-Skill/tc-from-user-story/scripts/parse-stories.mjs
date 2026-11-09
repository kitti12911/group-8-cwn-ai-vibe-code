#!/usr/bin/env node
// อ่านไฟล์ user story (markdown) → JSON: stories[], questions[], conflicts[]
// รูปแบบที่รองรับ:
//   ### US-01 · ชื่อ · `Must`
//   - **เกณฑ์ยอมรับ**
//     1. ...
//   - **Q1.** คำถาม · *กระทบ US-16, US-17*
//   | **K1** | ... |
// ใช้: node parse-stories.mjs <USER-STORIES.md> > stories.json
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node parse-stories.mjs <USER-STORIES.md>');
  process.exit(2);
}
const lines = readFileSync(file, 'utf8').split(/\r?\n/);

const US_HEAD = /^#{2,4}\s+(US-\d+)\s*[·|:-]\s*(.+?)\s*[·|:-]\s*`?(Must|Should|Could|Won't)`?\s*$/i;
const AC_HEAD = /เกณฑ์ยอมรับ|acceptance criteria/i;
const AC_ITEM = /^\s+(\d+)\.\s+(.*)$/;
const Q_ITEM = /^\s*-\s+\*\*(Q\d+)\.?\*\*\s*(.*)$/;
const K_ROW = /^\|\s*\*\*(K\d+)\*\*\s*\|(.*)$/;
const refs = (t, p) => [...new Set([...t.matchAll(new RegExp(`\\b${p}\\d+\\b`, 'g'))].map(m => m[0]))];

const stories = [];
const questions = [];
const conflicts = [];
let cur = null;
let inAC = false;

for (const line of lines) {
  const h = line.match(US_HEAD);
  if (h) {
    cur = { id: h[1], title: h[2], priority: h[3][0].toUpperCase() + h[3].slice(1).toLowerCase(), ac: [] };
    stories.push(cur);
    inAC = false;
    continue;
  }
  if (/^#{1,4}\s/.test(line)) { cur = null; inAC = false; }

  const q = line.match(Q_ITEM);
  if (q) {
    questions.push({ id: q[1], text: q[2].replace(/\s*·\s*\*กระทบ.*$/, '').trim(), affects: refs(q[2], 'US-') });
    continue;
  }
  const k = line.match(K_ROW);
  if (k) {
    conflicts.push({ id: k[1], text: k[2].split('|').map(s => s.trim()).filter(Boolean).join(' / ') });
    continue;
  }

  if (!cur) continue;
  if (AC_HEAD.test(line)) { inAC = true; continue; }
  if (inAC) {
    const a = line.match(AC_ITEM);
    if (a) {
      const text = a[2];
      cur.ac.push({
        n: Number(a[1]),
        text,
        source: /\[เว็บ/.test(text) ? (/\(ทีมเสนอ\)/.test(text) ? 'mixed' : 'web') : (/\(ทีมเสนอ\)/.test(text) ? 'team' : 'unspecified'),
        failedOnSite: /❌/.test(text),
        refs: [...refs(text, 'Q'), ...refs(text, 'K')],
      });
    } else if (/^\s*-\s+\*\*/.test(line)) {
      inAC = false; // bullet หัวข้อถัดไป เช่น - **หมายเหตุ**
    }
  }
}

// คำถามท้ายไฟล์ที่ "กระทบ US-xx" → ผูกกลับไปที่ story (เกณฑ์อาจไม่ได้อ้าง Q ตรง ๆ)
for (const s of stories) s.openQuestions = questions.filter(q => q.affects.includes(s.id)).map(q => q.id);

const out = {
  source: file,
  parsedAt: new Date().toISOString(),
  counts: {
    stories: stories.length,
    ac: stories.reduce((s, x) => s + x.ac.length, 0),
    byPriority: stories.reduce((m, x) => ((m[x.priority] = (m[x.priority] || 0) + 1), m), {}),
    questions: questions.length,
    conflicts: conflicts.length,
  },
  storiesWithoutAC: stories.filter(s => s.ac.length === 0).map(s => s.id),
  stories,
  questions,
  conflicts,
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
console.error(`stories: ${out.counts.stories} · ac: ${out.counts.ac} · Q: ${questions.length} · K: ${conflicts.length}` +
  (out.storiesWithoutAC.length ? ` · ⚠️ ไม่มีเกณฑ์ยอมรับ: ${out.storiesWithoutAC.join(', ')}` : ''));
if (stories.length === 0) process.exit(1);
