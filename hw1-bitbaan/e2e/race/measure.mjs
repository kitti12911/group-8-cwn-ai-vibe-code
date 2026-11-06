/**
 * วัดสถิติการแย่งของสำหรับ `RACE-REPORT.md` — ไม่ใช่ test (ไม่ assert) จึงรันจนจบทุกรอบ
 * แม้โค้ดจะพัง ทำให้ได้ตาราง "กี่รอบจาก 50 ที่เกิดใบซ้ำ"
 *
 *   node race/measure.mjs            # 50 รอบ × N = 2, 5, 10
 *   ROUNDS=10 node race/measure.mjs
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ROUNDS = Number(process.env.ROUNDS ?? 50);
const NS = (process.env.NS ?? '2,5,10').split(',').map(Number);
const SKU = process.env.SKU ?? 'GPU-V57';

const post = (path, body, headers = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

const reset = () => post('/api/test/reset');

const buy = (k) =>
  post('/api/orders', {
    items: [{ sku: SKU, qty: 1 }],
    shipping: 'standard',
    guest: { name: `ผู้ซื้อ ${k}`, phone: `0820000${String(k).padStart(3, '0')}`, email: `buyer${k}@bitbaan.test` },
    address: { line: '99/1 ถนนบรมราชชนนี', province: 'กรุงเทพมหานคร' },
  });

const stock = async () => {
  const list = await (await fetch(`${BASE}/api/products`)).json();
  return list.find((p) => p.sku === SKU).available;
};

const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.max(0, Math.floor(arr.length * p) - 1)];

console.log(`สินค้า ${SKU} · ${ROUNDS} รอบต่อค่า N · ปลายทาง ${BASE}\n`);
const rows = [];
for (const n of NS) {
  let badRounds = 0, totalCreated = 0, negative = 0;
  const lat = [];
  for (let r = 0; r < ROUNDS; r++) {
    await reset();
    const started = Date.now();
    const res = await Promise.all(Array.from({ length: n }, (_, k) => buy(k)));
    lat.push(Date.now() - started);
    const created = res.filter((x) => x.status === 201).length;
    totalCreated += created;
    if (created !== 1) badRounds++;
    if ((await stock()) < 0) negative++;
  }
  rows.push({ n, badRounds, avgCreated: (totalCreated / ROUNDS).toFixed(2), negative, p50: pct(lat, 0.5), p95: pct(lat, 0.95) });
}

console.log('| N (คำขอพร้อมกัน) | รอบที่เกิดใบซ้ำ / ' + ROUNDS + ' | ใบยืนยันเฉลี่ยต่อรอบ | รอบที่ของติดลบ | เวลาตอบ p50 | p95 |');
console.log('| ---: | ---: | ---: | ---: | ---: | ---: |');
for (const r of rows) console.log(`| ${r.n} | ${r.badRounds} | ${r.avgCreated} | ${r.negative} | ${r.p50} ms | ${r.p95} ms |`);
