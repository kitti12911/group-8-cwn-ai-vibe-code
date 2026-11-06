/**
 * mutation testing สำหรับโมดูลกฎของบิตบ้าน · การบ้านขั้น 4
 *
 * ทำไมเขียนเอง: Stryker ใช้กับ Go ไม่ได้ · gremlins (build `dev`) รันกับ Go 1.27 แล้วหา mutant ไม่เจอเลย
 * ("Gathering coverage... done · No results to report") จึงเขียนตัวรันเองที่อธิบายได้ทุกบรรทัด
 *
 *   node mutation/run.mjs                 # รันทุก mutant แล้วเขียน mutation/round<N>.json รอบถัดไปที่ยังว่าง (ไม่ทับรอบเก่า)
 *   OUT=round2.json node mutation/run.mjs # ตั้งชื่อไฟล์เอง (ถ้ามีอยู่แล้วต้องใส่ OVERWRITE=1)
 *   ONLY=pricing node mutation/run.mjs    # จำกัดไฟล์
 *
 * ตัวฆ่า mutant = `go test ./internal/...` (ตาราง quote 27 แถว + ความเข้ากันได้ทุกคู่)
 * โมดูลกฎเป็น pure function ไม่ต้องขึ้นเว็บ จึงรันได้เร็วพอที่จะทดสอบ mutant หลายร้อยตัว
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
// ผลแต่ละรอบเป็นหลักฐาน ห้ามทับเงียบ ๆ: ไม่ตั้ง OUT = รอบถัดไปที่ยังว่าง · ตั้ง OUT ที่มีอยู่แล้วต้อง OVERWRITE=1
const nextRound = () => {
  let n = 1;
  while (existsSync(join(ROOT, 'mutation', `round${n}.json`))) n++;
  return `round${n}.json`;
};
const OUT = join(ROOT, 'mutation', process.env.OUT ?? nextRound());
if (process.env.OUT && existsSync(OUT) && process.env.OVERWRITE !== '1') {
  console.error(`${process.env.OUT} มีอยู่แล้ว · ใส่ OVERWRITE=1 ถ้าตั้งใจทับ หรือไม่ต้องตั้ง OUT เพื่อเขียนรอบถัดไป`);
  process.exit(1);
}

/** โมดูลกฎเท่านั้น — ไม่ mutate ชั้น API, store หรือ seed (TEST-PLAN.md §2.1) */
const TARGETS = [
  { module: 'pricing', file: 'internal/pricing/pricing.go' },
  { module: 'compat', file: 'internal/compat/compat.go' },
].filter((t) => !process.env.ONLY || t.module === process.env.ONLY);

/** operator → รายการแทนที่ · เรียงจากยาวไปสั้นเพื่อให้ `>=` ถูกจับก่อน `>` */
const OPERATORS = [
  ['>=', '>', 'ขอบเงื่อนไข'],
  ['<=', '<', 'ขอบเงื่อนไข'],
  ['==', '!=', 'กลับเงื่อนไข'],
  ['!=', '==', 'กลับเงื่อนไข'],
  ['&&', '||', 'กลับตรรกะ'],
  ['||', '&&', 'กลับตรรกะ'],
  ['>', '>=', 'ขอบเงื่อนไข'],
  ['<', '<=', 'ขอบเงื่อนไข'],
  ['+', '-', 'เลขคณิต'],
  ['-', '+', 'เลขคณิต'],
  ['*', '/', 'เลขคณิต'],
  ['/', '*', 'เลขคณิต'],
];

/** คืนช่วงที่เป็นคอมเมนต์หรือ string literal เพื่อไม่ให้ mutate เข้าไปในนั้น */
function maskedRanges(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      out.push([i, end === -1 ? src.length : end]);
      i = end === -1 ? src.length : end;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      out.push([i, end === -1 ? src.length : end + 2]);
      i = end === -1 ? src.length : end + 2;
    } else if (c === '"' || c === '`' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' && c !== '`' ? 2 : 1;
      out.push([i, j + 1]);
      i = j + 1;
    } else i++;
  }
  return out;
}

const inMask = (ranges, pos) => ranges.some(([a, b]) => pos >= a && pos < b);
const lineOf = (src, pos) => src.slice(0, pos).split('\n').length;
const lineText = (src, pos) => src.split('\n')[lineOf(src, pos) - 1].trim();

function buildMutants(src, file) {
  const mask = maskedRanges(src);
  const mutants = [];
  const used = new Set();

  for (const [from, to, kind] of OPERATORS) {
    for (let pos = src.indexOf(from); pos !== -1; pos = src.indexOf(from, pos + 1)) {
      if (inMask(mask, pos)) continue;
      if (used.has(pos)) continue;                                  // ตำแหน่งนี้ถูกจับโดย operator ที่ยาวกว่าแล้ว
      const prev = src[pos - 1], next = src[pos + from.length];
      if (from.length === 1) {
        if ('=<>&|+-*/!'.includes(prev) || '=&|+-'.includes(next)) continue;   // เลี่ยง `+=` `++` `<=` `&&`
        if (from === '/' && (next === '/' || next === '*')) continue;
      }
      used.add(pos);
      for (let k = 0; k < from.length; k++) used.add(pos + k);
      mutants.push({ file, kind, op: `${from} → ${to}`, pos, len: from.length, repl: to, line: lineOf(src, pos), code: lineText(src, pos) });
    }
  }

  // เลขคงที่: n → n+1 (จับกฎที่ผูกกับตัวเลข เช่น 100, 10, 500, 3000, 7)
  for (const m of src.matchAll(/\b\d+\b/g)) {
    const pos = m.index;
    if (inMask(mask, pos) || used.has(pos)) continue;
    const prev = src[pos - 1];
    if (prev && /[A-Za-z_.\d]/.test(prev)) continue;                // ไม่ใช่เลขเดี่ยว ๆ
    used.add(pos);
    mutants.push({ file, kind: 'เลขคงที่', op: `${m[0]} → ${Number(m[0]) + 1}`, pos, len: m[0].length, repl: String(Number(m[0]) + 1), line: lineOf(src, pos), code: lineText(src, pos) });
  }

  return mutants.sort((a, b) => a.line - b.line);
}

function runTests() {
  try {
    execSync('go test ./internal/...', { cwd: BACKEND, stdio: 'pipe', timeout: 120_000 });
    return 'survived';
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (/build failed|cannot use|undefined:|syntax error|mismatched types|invalid operation|declared and not used/i.test(out)) return 'invalid';
    if (e.signal === 'SIGTERM' || /test timed out/.test(out)) return 'timeout';
    return 'killed';
  }
}

const results = [];
for (const t of TARGETS) {
  const path = join(BACKEND, t.file);
  // กันโค้ดกลายพันธุ์ค้างใน repo: เก็บสำเนาไว้ก่อน · ถ้ารอบก่อนถูก kill จนสำเนายังอยู่ ให้คืนจากสำเนาก่อนเริ่ม
  const backup = `${path}.mutation-backup`;
  if (existsSync(backup)) {
    writeFileSync(path, readFileSync(backup, 'utf8'));
    console.log(`คืน ${t.file} จากสำเนาของรอบที่ถูกหยุดกลางคัน`);
  }
  const original = readFileSync(path, 'utf8');
  writeFileSync(backup, original);
  const restore = () => {
    writeFileSync(path, original);
    rmSync(backup, { force: true });
    process.exit(130);
  };
  process.once('SIGINT', restore);
  process.once('SIGTERM', restore);
  const mutants = buildMutants(original, t.file);
  console.log(`${t.file}: ${mutants.length} mutants`);

  let n = 0;
  for (const m of mutants) {
    const mutated = original.slice(0, m.pos) + m.repl + original.slice(m.pos + m.len);
    writeFileSync(path, mutated);
    const status = runTests();
    await new Promise((r) => setImmediate(r)); // ให้ Ctrl+C / kill ทำงานได้ระหว่างรอบ
    results.push({ id: `M${String(results.length + 1).padStart(3, '0')}`, module: t.module, ...m, status });
    n++;
    process.stdout.write(`\r  ${n}/${mutants.length} · ${status.padEnd(9)}`);
  }
  writeFileSync(path, original);                                     // คืนไฟล์เดิมเสมอ
  rmSync(backup, { force: true });
  process.removeListener('SIGINT', restore);
  process.removeListener('SIGTERM', restore);
  console.log('');
}

const by = (s) => results.filter((r) => r.status === s).length;
const killed = by('killed'), survived = by('survived'), invalid = by('invalid'), timeout = by('timeout');
const score = killed + survived === 0 ? 0 : (killed / (killed + survived)) * 100;

const summary = {
  killed, survived, invalid, timeout,
  valid: killed + survived,
  score: Number(score.toFixed(1)),
  byModule: Object.fromEntries(
    TARGETS.map((t) => {
      const rs = results.filter((r) => r.module === t.module);
      const k = rs.filter((r) => r.status === 'killed').length;
      const s = rs.filter((r) => r.status === 'survived').length;
      return [t.module, { killed: k, survived: s, invalid: rs.filter((r) => r.status === 'invalid').length, score: k + s ? Number(((k / (k + s)) * 100).toFixed(1)) : 0 }];
    }),
  ),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ summary, results }, null, 2));

console.log('\n| โมดูล | killed | survived | invalid | score |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const [mod, s] of Object.entries(summary.byModule)) console.log(`| ${mod} | ${s.killed} | ${s.survived} | ${s.invalid} | ${s.score}% |`);
console.log(`| **รวม** | **${killed}** | **${survived}** | ${invalid} | **${summary.score}%** |`);
console.log(`\nmutant ที่รอด ${survived} ตัว:`);
for (const r of results.filter((r) => r.status === 'survived')) console.log(`  ${r.id} ${r.file}:${r.line} [${r.kind}] ${r.op}   ${r.code}`);
console.log(`\nเขียนผลลง ${OUT}`);
