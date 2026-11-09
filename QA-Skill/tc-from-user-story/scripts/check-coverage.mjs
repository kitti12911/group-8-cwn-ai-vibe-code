#!/usr/bin/env node
// ตรวจว่า TEST-CASES.md ครอบคลุมเกณฑ์ยอมรับทุกข้อใน stories.json
// ใช้: node check-coverage.mjs stories.json TEST-CASES.md [--priority Must,Should] [--us US-15,US-16]
//   --priority / --us = จำกัดขอบเขตเมื่อผู้ใช้สั่งทำแค่บางส่วน (story นอกขอบเขตไม่นับ coverage)
// exit 0 = ผ่าน (อาจมีคำเตือน) · exit 1 = เกณฑ์ Must ไม่มี TC / TC อ้าง US-AC ที่ไม่มี / รหัส TC ซ้ำ · exit 2 = ใช้งานผิด
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1]?.split(',').map(s => s.trim()) : null; };
const onlyPrio = opt('--priority');
const onlyUS = opt('--us');
const [storiesPath, tcPath] = args;
if (!storiesPath || !tcPath) {
  console.error('usage: node check-coverage.mjs stories.json TEST-CASES.md [--priority Must,Should] [--us US-15,US-16]');
  process.exit(2);
}
const data = JSON.parse(readFileSync(storiesPath, 'utf8'));
const allStories = data.stories;
data.stories = allStories.filter(s => (!onlyPrio || onlyPrio.includes(s.priority)) && (!onlyUS || onlyUS.includes(s.id)));
if (onlyPrio || onlyUS) console.error(`ขอบเขต: ${data.stories.length}/${allStories.length} US` + (onlyPrio ? ` · priority=${onlyPrio}` : '') + (onlyUS ? ` · us=${onlyUS}` : ''));
const md = readFileSync(tcPath, 'utf8').split(/\r?\n/);

// --- อ่านตาราง traceability: หาแถวหัวตารางที่มีคอลัมน์ TC และ US
let header = null;
const rows = [];
for (const line of md) {
  if (!line.trim().startsWith('|')) continue;
  const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
  if (!header) {
    if (cells[0] === 'TC' && cells.includes('US') && cells.includes('AC')) header = cells;
    continue;
  }
  if (/^:?-+:?$/.test(cells[0])) continue;
  if (!/^TC-/.test(cells[0])) continue;
  rows.push(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
}
if (!header) {
  console.error('❌ ไม่พบตาราง traceability (ต้องมีหัวตาราง | TC | US | AC | ...) ดู references/tc-template.md');
  process.exit(1);
}

const prio = { Must: 'P1', Should: 'P2', Could: 'P3' };
const storyById = Object.fromEntries(allStories.map(s => [s.id, s]));
const inScope = new Set(data.stories.map(s => s.id));
const covered = new Map(); // "US-16#1" -> [TC]
const errors = [];
const warnings = [];
const seen = new Set();

// คอลัมน์ "ขึ้นกับ": Q1, K1 (จากเอกสาร) · QA1 (คำถามใหม่จาก QA) · ไม่เกี่ยว:K7 (เกณฑ์อ้าง K7 แต่ TC นี้ไม่ได้ขึ้นกับมัน)
const ID = /\b(?:QA|Q|K)\d+\b/g;
const NOT_REL = /ไม่เกี่ยว\s*:\s*((?:(?:QA|Q|K)\d+\s*[,/]?\s*)+)/g;
const parseDep = (cell = '') => {
  const notRel = [...cell.matchAll(NOT_REL)].flatMap(m => m[1].match(ID) || []);
  const deps = (cell.replace(NOT_REL, '').match(ID) || []);
  return { deps: [...new Set(deps)], notRel };
};
const knownIds = new Set([...(data.questions || []), ...(data.conflicts || [])].map(x => x.id));
// คำถามใหม่จาก QA ต้องประกาศในหัวข้อ "คำถามใหม่จาก QA" (แถวตารางที่ขึ้นต้นด้วย | QA<n> |)
const qaDeclared = new Set(md.map(l => l.match(/^\|\s*(QA\d+)\s*\|/)?.[1]).filter(Boolean));
let notRelCount = 0;

for (const r of rows) {
  const tc = r.TC;
  if (seen.has(tc)) errors.push(`${tc}: รหัส TC ซ้ำ`);
  seen.add(tc);
  const s = storyById[r.US];
  if (!s) { errors.push(`${tc}: อ้าง ${r.US} ซึ่งไม่มีในไฟล์ story`); continue; }
  if (!inScope.has(r.US)) warnings.push(`${tc}: ${r.US} อยู่นอกขอบเขตที่สั่ง`);
  const { deps, notRel } = parseDep(r['ขึ้นกับ']);
  notRelCount += notRel.length;
  for (const d of deps) {
    if (d.startsWith('QA')) { if (!qaDeclared.has(d)) warnings.push(`${tc}: ${d} ยังไม่ได้ประกาศในตาราง "คำถามใหม่จาก QA"`); }
    else if (knownIds.size && !knownIds.has(d)) warnings.push(`${tc}: ${d} ไม่มีในเอกสาร user story (คำถามใหม่ให้ใช้รหัส QA<n>)`);
  }
  const acs = r.AC.split(/[,\s]+/).filter(Boolean).map(Number);
  if (!acs.length) errors.push(`${tc}: ไม่ระบุ AC`);
  for (const n of acs) {
    const ac = s.ac.find(a => a.n === n);
    if (!ac) { errors.push(`${tc}: ${r.US} ไม่มีเกณฑ์ยอมรับข้อ ${n}`); continue; }
    const key = `${r.US}#${n}`;
    covered.set(key, [...(covered.get(key) || []), tc]);
    const missing = ac.refs.filter(x => !deps.includes(x) && !notRel.includes(x));
    if (missing.length) warnings.push(`${tc}: เกณฑ์ ${key} อ้าง ${missing.join(', ')} แต่คอลัมน์ "ขึ้นกับ" ไม่มี (ถ้าไม่เกี่ยวจริง ใส่ ไม่เกี่ยว:${missing[0]})`);
  }
  if (r['ระดับ'] && prio[s.priority] && r['ระดับ'] !== prio[s.priority])
    warnings.push(`${tc}: ระดับ ${r['ระดับ']} ไม่ตรงกับ ${r.US} (${s.priority} → ${prio[s.priority]})`);
}

// --- coverage ต่อเกณฑ์
const uncovered = [];
const byPrio = {};
for (const s of data.stories) {
  const p = (byPrio[s.priority] ||= { stories: 0, ac: 0, covered: 0, tc: 0 });
  p.stories++;
  for (const a of s.ac) {
    p.ac++;
    if (covered.has(`${s.id}#${a.n}`)) p.covered++;
    else uncovered.push({ key: `${s.id}#${a.n}`, priority: s.priority, text: a.text.slice(0, 70) });
  }
}
for (const r of rows) { const s = storyById[r.US]; if (s && inScope.has(s.id)) byPrio[s.priority].tc++; }
for (const u of uncovered) (u.priority === 'Must' ? errors : warnings).push(`ไม่มี TC: ${u.key} (${u.priority}) ${u.text}`);

const count = k => rows.reduce((m, r) => ((m[r[k] || '-'] = (m[r[k] || '-'] || 0) + 1), m), {});
const qImpact = {};
for (const r of rows) for (const d of parseDep(r['ขึ้นกับ']).deps) qImpact[d] = (qImpact[d] || 0) + 1;
const dependent = rows.filter(r => parseDep(r['ขึ้นกับ']).deps.length).length;

// --- พิมพ์ markdown สำหรับคัดไปใส่หัวข้อ 6
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0') + '%';
const out = [];
out.push('| ความสำคัญ | US | เกณฑ์ยอมรับ | มี TC | coverage | จำนวน TC |', '|---|---|---|---|---|---|');
let T = { stories: 0, ac: 0, covered: 0, tc: 0 };
for (const k of ['Must', 'Should', 'Could', ...Object.keys(byPrio).filter(k => !prio[k])]) {
  const p = byPrio[k]; if (!p) continue;
  out.push(`| ${k} | ${p.stories} | ${p.ac} | ${p.covered} | ${pct(p.covered, p.ac)} | ${p.tc} |`);
  for (const f in T) T[f] += p[f];
}
out.push(`| **รวม** | **${T.stories}** | **${T.ac}** | **${T.covered}** | **${pct(T.covered, T.ac)}** | **${T.tc}** |`, '');
out.push(`ประเภท: ${Object.entries(count('ประเภท')).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
out.push(`เทคนิค: ${Object.entries(count('เทคนิค')).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
out.push(`TC ที่ผลที่คาดหวังยังขึ้นกับคำถามค้าง: ${dependent}/${rows.length}` +
  (Object.keys(qImpact).length ? ` · กระทบมากสุด: ${Object.entries(qImpact).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v} TC)`).join(', ')}` : ''));
if (notRelCount) out.push(`ระบุ "ไม่เกี่ยว" ไว้: ${notRelCount} จุด (ตรวจเหตุผลในหมายเหตุของ TC)`);
console.log(out.join('\n'));

if (warnings.length) console.error(`\n⚠️ คำเตือน ${warnings.length} ข้อ\n- ` + warnings.join('\n- '));
if (errors.length) { console.error(`\n❌ ต้องแก้ ${errors.length} ข้อ\n- ` + errors.join('\n- ')); process.exit(1); }
console.error('\n✅ เกณฑ์ Must มี TC ครบ และทุก TC อ้าง US/AC ที่มีจริง');
