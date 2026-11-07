// Rendu logiciel (rasteriseur Z-buffer, normales interpolées) des personnages et véhicules -> PNG
import { createRequire } from 'node:module';
const sharp = createRequire('/home/claude/.npm-global/lib/node_modules/')('sharp');
import { buildHumanGeometry, head } from '../src/models.js';
import { buildCar, wheelGeometry } from '../src/carmodels.js';
const out = process.argv[2];
const mode = process.argv[3] || 'humans';
const W = 1800, H = 900;
const buf = new Float32Array(W * H * 3).fill(0.78), zb = new Float32Array(W * H).fill(1e9);
const enc = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
function drawGeo(g, ox, oy, scale, yaw, pitch, tr = [0, 0, 0], rotX = 0, tint = null, alpha = 0, ky = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const L = [0.45, 0.75, 0.5]; const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  const P = (x, y, z) => { x += tr[0]; y += tr[1]; z += tr[2]; const X = x * cy - z * sy, Z = x * sy + z * cy; return [ox - X * scale, oy - (y * cp + Z * sp) * scale, Z * cp - y * sp]; };
  const Nn = (x, y, z) => { const X = x * cy - z * sy, Z = x * sy + z * cy; return [X, y * cp + Z * sp, Z * cp - y * sp]; };
  const N = g.pos.length / 9;
  for (let t = 0; t < N; t++) {
    const v = [], nn = [], cc = [];
    for (let i = 0; i < 3; i++) { const k = t * 9 + i * 3; v.push(P(g.pos[k], g.pos[k + 1], g.pos[k + 2])); nn.push(Nn(g.nor[k], g.nor[k + 1], g.nor[k + 2])); cc.push([g.col[k], g.col[k + 1], g.col[k + 2]]); }
    // face arrière (normale éloignée de la caméra) -> ignorée
    const area = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]);
    if (nn[0][2] + nn[1][2] + nn[2][2] > 0) continue; // face arrière (normale éloignée de la caméra)
    if (Math.abs(area) < 1e-9) continue;
    const minx = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), maxx = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
    const miny = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), maxy = Math.min(H - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const sgn = area; const w0 = ((v[1][0] - px) * (v[2][1] - py) - (v[2][0] - px) * (v[1][1] - py)) / area;
      const w1 = ((v[2][0] - px) * (v[0][1] - py) - (v[0][0] - px) * (v[2][1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const z = w0 * v[0][2] + w1 * v[1][2] + w2 * v[2][2];
      const i = y * W + x; if (z >= zb[i]) continue; if (!alpha) zb[i] = z;
      let nx = w0 * nn[0][0] + w1 * nn[1][0] + w2 * nn[2][0], ny = w0 * nn[0][1] + w1 * nn[1][1] + w2 * nn[2][1], nz = w0 * nn[0][2] + w1 * nn[1][2] + w2 * nn[2][2];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const hemi = 0.55 + 0.45 * ny; const sh = 0.32 * hemi + 0.95 * d;
      for (let c = 0; c < 3; c++) { const base = (w0 * cc[0][c] + w1 * cc[1][c] + w2 * cc[2][c]) * (tint ? tint[c] : 1) * sh; buf[i * 3 + c] = alpha ? buf[i * 3 + c] * (1 - alpha) + base * alpha : base; }
    }
  }
}
const geoMap = {};
export { drawGeo };
if (mode === 'cars') {
  const tints = [[0.55, 0.06, 0.05], [0.08, 0.25, 0.6], [0.85, 0.85, 0.8], [0.18, 0.22, 0.1], [0.7, 0.45, 0.02]];
  const lin = (c) => c.map((v) => Math.pow(v, 2.2));
  const only = process.argv[4] ? +process.argv[4] : -1;
  const cars = [0, 1, 2, 3, 4].filter((t) => only < 0 || t === only);
  const views = only < 0 ? [[0.75, 0.28], [2.4, 0.28]] : [[1.57, 0.1], [0.5, 0.3], [3.64, 0.3], [0, 0.15]];
  cars.forEach((t, ci) => {
    const c = buildCar(t);
    const wg = [wheelGeometry(1), wheelGeometry(-1)];
    views.forEach(([yaw, pit], vi) => {
      const cols = only < 0 ? 5 : 2;
      const cx = only < 0 ? 180 + ci * 360 : 230 + (vi % 4) * 440 , cy = only < 0 ? 330 + vi * 440 : 500;
      const sc = only < 0 ? 70 : 78;
      drawGeo(c.paint, cx, cy, sc, yaw, pit, [0, -0.9, 0], 0, lin(tints[t]));
      drawGeo(c.detail, cx, cy, sc, yaw, pit, [0, -0.9, 0]);
      drawGeo(c.tails, cx, cy, sc, yaw, pit, [0, -0.9, 0], 0, [1.6, 0.05, 0.03]);
      drawGeo(c.lamps, cx, cy, sc, yaw, pit, [0, -0.9, 0], 0, [1.6, 1.5, 1.2]);
      for (const w of c.wheels) { const k = (w.k || w.r / 0.345); const g0 = wg[w.x > 0 ? 0 : 1]; const g = { pos: g0.pos.map((v) => v * k), nor: g0.nor, col: g0.col }; drawGeo(g, cx, cy, sc, yaw, pit, [w.x, w.y - 0.9, w.z]); }
      drawGeo(c.glass, cx, cy, sc, yaw, pit, [0, -0.9, 0], 0, [0.4, 0.6, 0.8], 0.45);
    });
    console.log(['sedan', 'hatch', 'van', 'jeep', 'truck'][t], 'tris', (c.paint.pos.length + c.detail.pos.length + c.glass.pos.length + c.lamps.pos.length + c.tails.pos.length) / 9);
  });
}
if (mode === 'close') {
  const [r, o] = JSON.parse(process.argv[4]);
  const h = buildHumanGeometry(r, o);
  const all = [[h.body, [0, 0, 0]]];
  for (const lg of h.legs) { all.push([lg.thigh, [lg.x, lg.hipY, 0]]); all.push([lg.shin, [lg.x, lg.kneeY, 0]]); }
  for (const a of h.arms) { all.push([a.up, [a.x, 1.42, 0]]); all.push([a.low, [a.x, 1.14, 0]]); }
  [[300, 0.0], [900, 1.57], [1500, 3.14]].forEach(([cx, yaw]) => { for (const [g, t] of all) drawGeo(g, cx, 840, 470, yaw, 0.1, t); });
}
if (mode === 'hair') {
  const { Geo } = await import('../src/meshbuilder.js');
  [[300, 0.0], [900, 1.57], [1500, 3.14]].forEach(([cx, yaw]) => { const g = new Geo(false); head(g, 0, 0xd9a577, 0xff2200, process.argv[4], false); drawGeo(g, cx, 450 + 1.66 * 1500, 1500, yaw, 0.05); });
}
if (mode === 'head') {
  const [r, o] = JSON.parse(process.argv[4]);
  const h = buildHumanGeometry(r, o);
  [[300, 0.0], [900, 0.8], [1500, 1.57]].forEach(([cx, yaw]) => drawGeo(h.body, cx, 450 + 1.66 * 1500, 1500, yaw, process.argv[5] ? +process.argv[5] : 0.05));
}
if (mode === 'humans') {
  const roles = [['soldier', {}], ['officer', {}], ['player', { gun: 'pistol' }], ['player', { gun: 'sniper' }], ['civilian', { seed: 1 }], ['civilian', { seed: 2 }], ['civilian', { seed: 3 }], ['civilian', { seed: 5 }]];
  roles.forEach(([r, o], idx) => {
    const h = buildHumanGeometry(r, o);
    const cx = 110 + (idx % 8) * 225;
    for (const [row, yaw] of [[0, 0.5], [1, 3.4]]) {
      const oy = 360 + row * 430;
      const pp = [h.body];
      // jambes + bras en pose repos (positions relatives -> hanche / épaule)
      const all = [];
      for (const lg of h.legs) { all.push([lg.thigh, [lg.x, lg.hipY, 0]]); all.push([lg.shin, [lg.x, lg.kneeY, 0]]); }
      for (const a of h.arms) { all.push([a.up, [a.x, 1.42, 0]]); all.push([a.low, [a.x, 1.14, 0]]); }
      drawGeo(h.body, cx, oy + 160, 195, yaw, 0.12);
      for (const [g, t] of all) drawGeo(g, cx, oy + 160, 195, yaw, 0.12, t);
    }
    console.log(r, JSON.stringify(o), 'tris', Math.round((h.body.pos.length + h.legs.reduce((a, l) => a + l.thigh.pos.length + l.shin.pos.length, 0)) / 9));
  });
}
const raw = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H * 3; i++) raw[i] = enc(buf[i]);
await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toFile(out);
console.log('ok', out);
