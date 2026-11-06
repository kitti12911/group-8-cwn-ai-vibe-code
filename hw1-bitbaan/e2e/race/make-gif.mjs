/**
 * ต่อเฟรมสองหน้าต่างของ TC-RACE-02 เป็น GIF เดียว (ซ้าย = หน้าต่าง A · ขวา = หน้าต่าง B)
 *
 *   npm run test:race:ui      # อัดเฟรมลง test-report/race-ui/frames/
 *   npm run race:gif          # ไฟล์นี้ · ได้ test-report/race-ui/race-ui.gif
 *
 * ทำไมไม่ใช้ ffmpeg: ตัวที่ Playwright แถมมาถูก build ด้วย --disable-everything
 * (มีแต่ filter pad/crop/scale · muxer webm/image2) จึงไม่มี gif muxer, hstack หรือ palettegen
 * และเครื่องที่ตรวจงานอาจไม่มี ffmpeg เต็มตัว · ไฟล์นี้จึง decode PNG และ encode GIF ด้วย JS ล้วน
 * (`pngjs` + `gifenc` เป็น devDependency ใน package.json) ผลจึงเหมือนกันทุกเครื่องที่ `npm ci` ได้
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import gifenc from 'gifenc'; // CommonJS — named import ไม่ได้

const { GIFEncoder, quantize, applyPalette } = gifenc;

const E2E = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(E2E, 'test-report', 'race-ui');
const FRAMES = path.join(OUT_DIR, 'frames');
const GIF = path.join(OUT_DIR, 'race-ui.gif');

/** ย่อกี่เท่า · หน้าต่างจริง 900x820 สองจอ = 1806 กว้าง · หาร 3 ได้ ~602 กำลังดีสำหรับ GIF */
const SCALE = Number(process.env.GIF_SCALE ?? 3);
const DELAY_MS = Number(process.env.GIF_DELAY ?? 140);
const GUTTER = 6;

function die(msg) {
  console.error(`[race:gif] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(FRAMES)) {
  die(`ไม่พบโฟลเดอร์เฟรม ${FRAMES}\n[race:gif] รัน \`npm run test:race:ui\` ก่อน แล้วค่อยรันคำสั่งนี้ (Playwright ล้างโฟลเดอร์นี้ทุกครั้งที่รัน project race-ui)`);
}

/** จับคู่ NNN-A.png กับ NNN-B.png เอาเฉพาะดัชนีที่มีครบทั้งสองฝั่ง */
const pairs = [...new Set(fs.readdirSync(FRAMES).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, 3)))]
  .sort()
  .map((idx) => ({ idx, a: path.join(FRAMES, `${idx}-A.png`), b: path.join(FRAMES, `${idx}-B.png`) }))
  .filter((p) => fs.existsSync(p.a) && fs.existsSync(p.b));

if (pairs.length < 2) die(`เฟรมไม่พอ (จับคู่ได้ ${pairs.length} คู่) · ต้องรัน \`npm run test:race:ui\` ให้จบก่อน`);

const read = (file) => PNG.sync.read(fs.readFileSync(file));

/** ย่อแบบ nearest-neighbour · ไม่ต้องพึ่ง library ภาพ และคมพอสำหรับตัวหนังสือบนหน้าเว็บ */
function shrink(png, n) {
  const w = Math.floor(png.width / n);
  const h = Math.floor(png.height / n);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y * n;
    for (let x = 0; x < w; x++) {
      const s = (sy * png.width + x * n) * 4;
      const d = (y * w + x) * 4;
      out[d] = png.data[s];
      out[d + 1] = png.data[s + 1];
      out[d + 2] = png.data[s + 2];
      out[d + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/** วางสองภาพเรียงกันโดยมีเส้นคั่นสีเทา */
function hstack(left, right) {
  const height = Math.max(left.height, right.height);
  const width = left.width + GUTTER + right.width;
  const data = Buffer.alloc(width * height * 4, 0x20);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;

  const blit = (img, dx) => {
    for (let y = 0; y < img.height; y++) {
      img.data.copy(data, ((y * width) + dx) * 4, y * img.width * 4, (y + 1) * img.width * 4);
    }
  };
  blit(left, 0);
  blit(right, left.width + GUTTER);
  return { width, height, data };
}

const frames = pairs.map((p) => hstack(shrink(read(p.a), SCALE), shrink(read(p.b), SCALE)));
const { width, height } = frames[0];
if (frames.some((f) => f.width !== width || f.height !== height)) die('เฟรมขนาดไม่เท่ากัน — หน้าต่างถูกย่อ/ขยายระหว่างอัด');

/**
 * ใช้ palette เดียวทั้งคลิป ไม่ใช่ palette ต่อเฟรม — ไฟล์เล็กกว่าและสีไม่กระพริบ
 * สุ่มตัวอย่างจากทุกเฟรมเพื่อให้สีของทั้งสองสถานะ (ปุ่มปกติ / กล่อง error แดง) อยู่ใน palette ครบ
 */
const STRIDE = Math.max(1, Math.floor(frames.length / 8));
const sample = Buffer.concat(frames.filter((_, i) => i % STRIDE === 0).map((f) => f.data));
const palette = quantize(new Uint8ClampedArray(sample.buffer, sample.byteOffset, sample.length), 256);

const gif = GIFEncoder();
for (const f of frames) {
  const rgba = new Uint8ClampedArray(f.data.buffer, f.data.byteOffset, f.data.length);
  gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay: DELAY_MS });
}
gif.finish();

fs.writeFileSync(GIF, Buffer.from(gif.bytes()));
const kb = Math.round(fs.statSync(GIF).size / 1024);
console.log(`[race:gif] เขียน ${GIF} · ${frames.length} เฟรม · ${width}x${height} · ${kb} KB · ซ้าย = หน้าต่าง A · ขวา = หน้าต่าง B`);
