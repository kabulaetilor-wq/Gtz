import fs from 'node:fs';
import { parseChunk } from '../src/mapformat.js';
import * as core from '../src/worldcore.js';
import { makeSink, buildBuilding } from '../src/buildings.js';

const man = JSON.parse(fs.readFileSync('public/map/manifest.json', 'utf8'));
let loaded = 0, t0 = Date.now();
const allB = [];
for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) {
  const c = -1000 + cx * 200 + 100, z = -1000 + cz * 200 + 100;
  if (Math.hypot(c, z) > 800) continue;
  const buf = fs.readFileSync(`public/map/chunk_${cx}_${cz}.bin`);
  const ch = parseChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  ch.trees = ch.objects.t;
  core.registerChunk(ch);
  const sink = makeSink();
  for (const b of ch.objects.b) { buildBuilding(b, sink); allB.push(b); }
  core.addBoxes(ch.key, sink.boxes);
  loaded++;
}
console.log('chunks chargés', loaded, 'en', Date.now() - t0, 'ms ; boîtes de collision', core.boxCount(), 'bâtiments', allB.length);
console.log('hauteur à la tour (0,0) =', core.heightAt(0, 0).toFixed(2), '(attendu', man.player.towerY + ')');
// cohérence bâtiments / terrain
let off = 0, worst = 0;
for (const b of allB) { const h = core.heightAt(b[1], b[2]); const e = Math.abs(h - b[12]); worst = Math.max(worst, e); if (e > 2.5) off++; }
console.log('écart sol/bâtiment max', worst.toFixed(2), 'm ; bâtiments à plus de 2,5 m du sol :', off, '/', allB.length);
// continuité entre chunks
let maxJump = 0;
for (let z = -700; z <= 700; z += 37) for (const x of [-600, -400, -200, 0, 200, 400, 600]) {
  const a = core.heightAt(x - 0.01, z), b = core.heightAt(x + 0.01, z); maxJump = Math.max(maxJump, Math.abs(a - b));
}
console.log('saut de hauteur max aux bords de chunk', maxJump.toFixed(3), 'm');
// eau
let w = 0, n = 0; for (let x = -700; x <= 700; x += 7) for (let z = -700; z <= 700; z += 7) { n++; if (core.isWater(x, z)) w++; }
console.log('part du sol sous l\'eau (rayon 700 m) :', (100 * w / n).toFixed(1), '%');
// rayon : visée vers chaque camp depuis la tour
const eye = { x: 0, y: man.player.towerY + man.player.eyeHeight, z: 0 };
for (const c of man.camps) {
  const gy = core.heightAt(c.x, c.z) + 1.5;
  const L = Math.hypot(c.x, c.z, gy - eye.y);
  const dir = { x: c.x / L, y: (gy - eye.y) / L, z: c.z / L };
  const d = core.rayBoxes(eye, dir, L);
  console.log('camp', c.kind.padEnd(8), Math.round(Math.hypot(c.x, c.z)) + ' m', d === Infinity ? 'dégagé' : 'masqué à ' + d.toFixed(0) + ' m');
}
// performance des requêtes
let t1 = Date.now(), acc = 0;
for (let i = 0; i < 200000; i++) { const a = i * 0.0314; const d = core.rayBoxes(eye, { x: Math.cos(a), y: -0.02, z: Math.sin(a) }, 400); if (d < Infinity) acc++; }
console.log('200k rayons de 400 m :', Date.now() - t1, 'ms (', acc, 'impacts )');
t1 = Date.now(); let s = 0; for (let i = 0; i < 2e6; i++) s += core.heightAt((i % 1400) - 700, ((i * 7) % 1400) - 700); console.log('2M heightAt :', Date.now() - t1, 'ms');
// test de précision de la collision : un bâtiment connu
const b = allB.find((q) => q[0] === 0); const cy = b[12] + 2;
const o = { x: b[1] - 30, y: cy, z: b[2] }; const dd = core.rayBoxes(o, { x: 1, y: 0, z: 0 }, 60);
console.log('tir horizontal sur une maison à 30 m :', dd.toFixed(1), 'm (attendu ≈', (30 - b[3] / 2).toFixed(1), ' ou', (30 - b[4] / 2).toFixed(1), ')');
{
  let mj = 0, cnt = 0, worstAt = null;
  for (let z = -700; z <= 700; z += 13) for (const x of [-600, -400, -200, 0, 200, 400, 600]) {
    const loadedA = core.isLoaded(Math.floor((x - 0.5 + 1000) / 200), Math.floor((z + 1000) / 200));
    const loadedB = core.isLoaded(Math.floor((x + 0.5 + 1000) / 200), Math.floor((z + 1000) / 200));
    if (!loadedA || !loadedB) continue;
    const a = core.heightAt(x - 0.01, z), b = core.heightAt(x + 0.01, z); cnt++;
    if (Math.abs(a - b) > mj) { mj = Math.abs(a - b); worstAt = [x, z]; }
  }
  for (let x = -700; x <= 700; x += 13) for (const z of [-600, -400, -200, 0, 200, 400, 600]) {
    const loadedA = core.isLoaded(Math.floor((x + 1000) / 200), Math.floor((z - 0.5 + 1000) / 200));
    const loadedB = core.isLoaded(Math.floor((x + 1000) / 200), Math.floor((z + 0.5 + 1000) / 200));
    if (!loadedA || !loadedB) continue;
    const a = core.heightAt(x, z - 0.01), b = core.heightAt(x, z + 0.01); cnt++;
    if (Math.abs(a - b) > mj) { mj = Math.abs(a - b); worstAt = [x, z]; }
  }
  console.log('continuité (chunks voisins chargés) : %d tests, saut max %s m', cnt, mj.toFixed(4), worstAt || '');
}
