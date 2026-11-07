// Vue du dessus de la carte entière (peinture du sol + eau + bâtiments + ponts) -> PNG
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseChunk } from '../src/mapformat.js';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');
const PX = 1600, SN = 160;
const buf = Buffer.alloc(PX * PX * 3);
const set = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= PX || y >= PX) return; const i = (y * PX + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; };
const man = JSON.parse(fs.readFileSync('public/map/manifest.json', 'utf8'));
const items = { b: [], w: [], br: [], p: 0, a: 0 };
for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) {
  const raw = fs.readFileSync(`public/map/chunk_${cx}_${cz}.bin`);
  const ch = parseChunk(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  for (let j = 0; j < SN; j++) for (let i = 0; i < SN; i++) {
    const o = (j * SN + i) * 4, a = ch.splat[o + 3];
    let r = ch.splat[o], g = ch.splat[o + 1], b = ch.splat[o + 2];
    if (a < 255) { const d = Math.min(1, a / 160); r = 70 - 30 * d; g = 135 - 40 * d; b = 190 - 40 * d; }
    set(cx * SN + i, cz * SN + j, r, g, b);
  }
  items.b.push(...ch.objects.b); items.w.push(...ch.objects.w); items.br.push(...ch.objects.br); items.p += ch.objects.p.length; items.a += ch.objects.a.length;
}
const S = PX / 2000, T = (v) => Math.round((v + 1000) * S);
for (const b of items.b) { const [k, x, z, w, d, , , wall, , , , rot] = b; const sw = rot % 2 ? d : w, sd = rot % 2 ? w : d;
  const col = k === 5 || k === 4 ? [40, 60, 110] : k === 10 ? [200, 60, 60] : k === 14 || k === 15 ? [60, 90, 40] : [60, 50, 45];
  for (let yy = T(z - sd / 2); yy <= T(z + sd / 2); yy++) for (let xx = T(x - sw / 2); xx <= T(x + sw / 2); xx++) set(xx, yy, ...col); }
for (const [x, z, w, d] of items.w) for (let yy = T(z - d / 2); yy <= T(z + d / 2); yy++) for (let xx = T(x - w / 2); xx <= T(x + w / 2); xx++) set(xx, yy, 0, 255, 255);
for (const [x0, z0, x1, z1] of items.br) { const n = 30; for (let k = 0; k <= n; k++) { const x = T(x0 + (x1 - x0) * k / n), y = T(z0 + (z1 - z0) * k / n); for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) set(x + a, y + c, 255, 40, 40); } }
// tour du tireur
for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) set(T(0) + a, T(0) + c, 255, 255, 0);
await sharp(buf, { raw: { width: PX, height: PX, channels: 3 } }).png().toFile(process.argv[2]);
console.log('bâtiments', items.b.length, 'piscines', items.w.length, 'ponts', items.br.length, 'props', items.p, 'animaux', items.a);
