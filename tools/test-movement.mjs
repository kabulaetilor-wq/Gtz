import fs from 'node:fs';
import { parseChunk } from '../src/mapformat.js';
import * as core from '../src/worldcore.js';
import { makeSink, buildBuilding } from '../src/buildings.js';
let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0xffffff; };
const allBoxes = [];
for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) {
  const c = -1000 + cx * 200 + 100, z = -1000 + cz * 200 + 100;
  if (Math.hypot(c, z) > 900) continue;
  const buf = fs.readFileSync(`public/map/chunk_${cx}_${cz}.bin`);
  const ch = parseChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  ch.trees = ch.objects.t; core.registerChunk(ch);
  const sink = makeSink(); for (const b of ch.objects.b) buildBuilding(b, sink);
  core.addBoxes(ch.key, sink.boxes); core.registerBridges(ch.key, ch.objects.br); allBoxes.push(...sink.boxes);
}
// 1) marcheurs aléatoires
let inside = 0, wet = 0, steps = 0, blockedN = 0, walkers = 0;
const R = 0.4;
for (let w = 0; w < 400; w++) {
  let a; for (let t = 0; t < 200; t++) { const x = (rnd() - 0.5) * 1400, z = (rnd() - 0.5) * 1400; if (core.groundAt(x, z) > 1 && !core.inCollider(x, z, 1)) { a = { x, z }; break; } }
  if (!a) continue; walkers++;
  let ang = rnd() * 6.28;
  for (let s = 0; s < 1800; s++) {
    if (s % 90 === 0) ang += (rnd() - 0.5) * 2.5;
    const sp = 6.5 / 30;
    if (core.moveActor(a, Math.cos(ang) * sp, Math.sin(ang) * sp, R)) { blockedN++; ang += (rnd() - 0.5) * 1.5; }
    steps++;
    const g = core.groundAt(a.x, a.z);
    if (g < -0.36) wet++;
    for (const b of allBoxes) { if (a.x > b.x0 + 0.05 && a.x < b.x1 - 0.05 && a.z > b.z0 + 0.05 && a.z < b.z1 - 0.05 && b.y1 > g + 0.5 && b[4] === undefined) { inside++; break; } }
  }
}
console.log('marcheurs', walkers, 'pas', steps, ': dans un bâtiment', inside, ', dans l\'eau', wet, ', collisions gérées', blockedN);
// 2) ponts
let ok = 0, tot = 0;
const man = JSON.parse(fs.readFileSync('public/map/manifest.json', 'utf8'));
for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) {
  const buf = fs.readFileSync(`public/map/chunk_${cx}_${cz}.bin`);
  const ch = parseChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (!core.isLoaded(cx, cz)) continue;
  for (const [x0, z0, x1, z1] of ch.objects.br) {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    const a = { x: x0 - ux * 4, z: z0 - uz * 4 }; tot++;
    if (core.groundAt(a.x, a.z) < -0.3) continue;
    let moved = 0, minG = 99;
    for (let s = 0; s < 2000; s++) { core.moveActor(a, ux * 0.2, uz * 0.2, R); minG = Math.min(minG, core.groundAt(a.x, a.z)); if (Math.hypot(a.x - x1, a.z - z1) < 1) break; }
    if (Math.hypot(a.x - x1, a.z - z1) < 1.5) ok++; else console.log('pont non franchi', [x0, z0, x1, z1].map((v) => v.toFixed(0)).join(','), 'arrêt à', a.x.toFixed(1), a.z.toFixed(1), 'sol', core.groundAt(a.x, a.z).toFixed(2));
  }
}
console.log('ponts franchis à pied', ok, '/', tot);
// 3) la rivière sans pont bloque
const a = { x: -700, z: 0 }; // zone fleuve : marcher vers l'est jusqu'à bloquer
let start = { x: 0, z: 0 };
let blocked = 0; const b2 = { x: 120, z: 120 };
for (let k = 0; k < 40; k++) { b2.x = 200 + k * 10; b2.z = -600 + k * 20; }
console.log('hauteur sol tour :', core.groundAt(0, 0).toFixed(2));
