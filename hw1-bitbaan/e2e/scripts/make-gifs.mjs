// LAB 12 หลักฐาน: แปลงวิดีโอจาก project `evidence` เป็น GIF 1 ไฟล์ต่อ 1 TC
// ใช้: node scripts/make-gifs.mjs (ต้องมี ffmpeg) · ผลลัพธ์ test-report/gifs/<TC-ID>.gif + index.json
// ความยาวรวม 8–10 วินาที: เล่นเร่งให้จบใน ≤ 6.5 วินาที แล้วค้างภาพสุดท้าย 3 วินาที
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'test-results', 'evidence');
const OUT = path.join(ROOT, 'test-report', 'gifs');
const PLAY = 6.5;
const HOLD = 3;
const FPS = 8;

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const duration = (f) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim()) || PLAY;
const webms = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => path.join(dir, f)) : []);
const palette = `split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;

/** ยืดหรือเร่งให้เล่นจบใน PLAY วินาทีพอดี (ช้าลงได้ไม่เกิน ~3 เท่า) แล้วค้างภาพท้าย HOLD วินาที → รวม 8–10 วินาที */
const timing = (f) => {
  const speed = Math.max(0.35, duration(f) / PLAY);
  return `setpts=PTS/${speed.toFixed(3)},fps=${FPS},tpad=stop_mode=clone:stop_duration=${HOLD}`;
};

if (!fs.existsSync(SRC)) {
  console.error(`ไม่พบ ${path.relative(ROOT, SRC)} — รัน EVIDENCE=1 playwright test ก่อน (npm run evidence)`);
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const index = [];
for (const dir of fs.readdirSync(SRC).sort()) {
  const id = dir.match(/TC-[A-Z]+-\d+[a-z]?/)?.[0];
  if (!id) continue;
  const full = path.join(SRC, dir);
  const gif = path.join(OUT, `${id}.gif`);
  const pair = [webms(path.join(full, 'video-a'))[0], webms(path.join(full, 'video-b'))[0]];
  try {
    if (pair[0] && pair[1]) {
      // สองหน้าต่างคู่กัน (TC-RACE-02) · ใช้ความยาวของตัวที่ยาวกว่าเป็นเกณฑ์เร่ง
      const t = timing(duration(pair[0]) > duration(pair[1]) ? pair[0] : pair[1]);
      ff(['-i', pair[0], '-i', pair[1], '-filter_complex',
        `[0:v]scale=480:-2,${t}[l];[1:v]scale=480:-2,${t}[r];[l][r]hstack=inputs=2:shortest=0,${palette}`, '-loop', '0', gif]);
    } else {
      const v = webms(full)[0];
      if (!v) continue;
      ff(['-i', v, '-vf', `scale=800:-2:flags=lanczos,${timing(v)},${palette}`, '-loop', '0', gif]);
    }
    const kb = Math.round(fs.statSync(gif).size / 1024);
    index.push({ id, gif: `gifs/${id}.gif`, seconds: Number((Math.min(duration(gif), PLAY + HOLD) || PLAY + HOLD).toFixed(1)), kb });
    console.log(`✓ ${id}.gif · ${kb} KB`);
  } catch (e) {
    console.error(`✗ ${id}: ${e.stderr?.toString() || e.message}`);
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));

// เขียนรายการ GIF ลง e2e/index.html ระหว่าง <!-- gifs:start --> กับ <!-- gifs:end --> (กดเปิดทีละข้อ)
const titles = {};
for (const f of ['tests/web.ui.spec.ts', 'tests/gaps.ui.spec.ts', 'race/ui-race.ui.spec.ts']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/test\('(TC-[A-Z]+-\d+[a-z]?) · ([^']+)'/g)) titles[m[1]] = m[2];
}
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = index
  .map((g) => `<details><summary><code>${g.id}</code> · ${esc(titles[g.id] ?? '')} <span class="sub">(${g.seconds} วินาที)</span></summary><img loading="lazy" src="test-report/${g.gif}" alt="GIF ${g.id}"></details>`)
  .join('\n');
const page = path.join(ROOT, 'index.html');
const cur = fs.readFileSync(page, 'utf8');
fs.writeFileSync(page, cur.replace(/<!-- gifs:start -->[\s\S]*<!-- gifs:end -->/, `<!-- gifs:start -->\n${html}\n<!-- gifs:end -->`));
console.log(`${index.length} GIF → ${path.relative(ROOT, OUT)}`);
