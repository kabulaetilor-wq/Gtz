import fs from 'node:fs';
import { parseChunk } from '../src/mapformat.js';
import { makeSink, buildBuilding, K } from '../src/buildings.js';
import { buildProp } from '../src/props.js';
import { Geo } from '../src/meshbuilder.js';

const dir = 'public/map';
const names = Object.fromEntries(Object.entries(K).map(([k, v]) => [v, k]));
let nb = 0, nan = 0, badKinds = {}, tri = 0, maxTri = 0, maxKind = '';
const perKind = {};
function check(g, cx, cy, cz, label, kind) {
  const p = g.pos, n = g.nor;
  let bad = 0, total = 0;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 9; k++) if (!Number.isFinite(p[i + k]) || !Number.isFinite(n[i + k])) { nan++; return 0; }
    const mx = (p[i] + p[i + 3] + p[i + 6]) / 3 - cx, my = (p[i + 1] + p[i + 4] + p[i + 7]) / 3 - cy, mz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3 - cz;
    const d = n[i] * mx + n[i + 1] * my + n[i + 2] * mz;
    total++;
    if (d < -0.05) bad++;
  }
  if (bad) { badKinds[kind] = badKinds[kind] || { bad: 0, total: 0, ex: label }; badKinds[kind].bad += bad; badKinds[kind].total += total; }
  return total;
}
for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) {
  const buf = fs.readFileSync(`${dir}/chunk_${cx}_${cz}.bin`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const ch = parseChunk(ab);
  if (ch.cx !== cx || ch.cz !== cz) throw new Error('index chunk');
  for (const b of ch.objects.b) {
    const sink = makeSink();
    buildBuilding(b, sink);
    nb++;
    let t = sink.s.triCount; for (const w of sink.w) t += w.triCount;
    tri += t; if (t > maxTri) { maxTri = t; maxKind = names[b[0]]; }
    const key = names[b[0]];
    perKind[key] = perKind[key] || { n: 0, tris: 0 };
    perKind[key].n++; perKind[key].tris += t;
    // centre local approximatif : centre de la bbox monde des vertices
    for (const g of [sink.s, ...sink.w]) {
      if (g.empty) continue;
      let minx=1e9,miny=1e9,minz=1e9,maxx=-1e9,maxy=-1e9,maxz=-1e9;
      for (let i = 0; i < g.pos.length; i += 3) { minx=Math.min(minx,g.pos[i]);maxx=Math.max(maxx,g.pos[i]);miny=Math.min(miny,g.pos[i+1]);maxy=Math.max(maxy,g.pos[i+1]);minz=Math.min(minz,g.pos[i+2]);maxz=Math.max(maxz,g.pos[i+2]); }
      check(g, (minx+maxx)/2, (miny+maxy)/2, (minz+maxz)/2, JSON.stringify(b).slice(0, 80), key);
    }
    if (sink.boxes.length === 0) console.log('pas de collider', key);
    for (const bx of sink.boxes) if (bx.some((v) => !Number.isFinite(v)) || bx[3] <= bx[0] || bx[4] <= bx[1] || bx[5] <= bx[2]) console.log('collider invalide', key, bx);
  }
  // accessoires
  for (const p of ch.objects.p) { const g = new Geo(false); buildProp(g, p, 5); if (g.empty && p[0] !== 99) console.log('prop vide', p[0]); for (const v of g.pos) if (!Number.isFinite(v)) { nan++; break; } }
}
console.log('bâtiments', nb, 'triangles', tri, 'moy', Math.round(tri / nb), 'max', maxTri, maxKind, 'NaN', nan);
console.log('Faces orientées vers l\'intérieur (heuristique, formes creuses = faux positifs) :');
for (const [k, v] of Object.entries(badKinds)) console.log(' ', k, v.bad + '/' + v.total, v.ex);
console.log(Object.entries(perKind).map(([k, v]) => `${k}:${v.n}x${Math.round(v.tris / v.n)}`).join('  '));
