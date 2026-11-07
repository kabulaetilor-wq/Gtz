import fs from 'node:fs';
import { parseChunk } from '../src/mapformat.js';
import * as core from '../src/worldcore.js';
import { makeSink, buildBuilding } from '../src/buildings.js';
import { Vehicle } from '../src/vehicles.js';
import { MissionRunner } from '../src/missions.js';
const boxes = [];
for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) {
  const c = -1000 + cx * 200 + 100, z = -1000 + cz * 200 + 100;
  if (Math.hypot(c, z) > 800) continue;
  const buf = fs.readFileSync(`public/map/chunk_${cx}_${cz}.bin`);
  const ch = parseChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  ch.trees = ch.objects.t; core.registerChunk(ch);
  const sink = makeSink(); for (const b of ch.objects.b) buildBuilding(b, sink);
  core.addBoxes(ch.key, sink.boxes); core.registerBridges(ch.key, ch.objects.br); boxes.push(...sink.boxes);
}
const man = JSON.parse(fs.readFileSync('public/map/manifest.json'));
let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0xffffff; };
let inside = 0, wet = 0, frames = 0, tested = 0, vmax = 0, moved = 0;
for (const spec of man.vehicles) {
  if (Math.hypot(spec[0], spec[1]) > 780) continue;
  const v = new Vehicle(spec); v.occupied = true; tested++;
  const x0 = v.x, z0 = v.z; let steer = 0;
  for (let i = 0; i < 30 * 40; i++) {
    if (i % 45 === 0) steer = (rnd() - 0.5) * 1.6;
    v.update(1 / 30, { throttle: 1, steer });
    frames++; vmax = Math.max(vmax, v.speed);
    const g = core.groundAt(v.x, v.z); if (g < -0.45) wet++;
    for (const b of boxes) if (v.x > b.x0 + 0.3 && v.x < b.x1 - 0.3 && v.z > b.z0 + 0.3 && v.z < b.z1 - 0.3 && b.y1 > g + 0.6) { inside++; break; }
  }
  moved += Math.hypot(v.x - x0, v.z - z0);
}
console.log(`véhicules testés ${tested}, images ${frames}, vitesse max ${vmax.toFixed(1)} m/s, dans bâtiment ${inside}, dans l'eau ${wet}, distance moyenne ${(moved / tested).toFixed(0)} m`);

// moteur de missions (hôte factice)
const log = []; const player = { x: 0, z: 0 };
const enemies = [];
const host = { scene: { add() {}, remove() {} }, player, groundAt: () => 0, enemies: () => enemies,
  spawnEnemy: (x, z, k, tag) => { const e = { pos: { x, z }, dead: false, tag }; enemies.push(e); return e; }, say: (t) => log.push(t), setLoadout: (l) => log.push('loadout ' + l) };
const r = new MissionRunner(host);
for (const m of man.missions) {
  enemies.length = 0; log.length = 0; r.start(m);
  let guard = 0;
  while (r.active && guard++ < 50) {
    const s = r.current;
    if (s.type === 'goto') { player.x = s.x; player.z = s.z; }
    else if (s.type === 'kill') { r.update(0.1); enemies.forEach((e) => (e.dead = true)); }
    else if (s.type === 'collect') { for (const p of [...r.crates]) { player.x = p.x; player.z = p.z; r.update(0.1); } }
    r.update(0.1);
  }
  console.log(`mission ${m.id} ${r.finished && r.finished.win ? 'OK' : 'ÉCHEC ' + (r.finished && r.finished.reason)}`);
}
// mission chronométrée qui échoue
log.length = 0; r.start({ id: 99, name: 't', time: 2, steps: [{ type: 'goto', x: 9999, z: 0, r: 5, text: 'loin' }] }); for (let i = 0; i < 30; i++) r.update(0.1);
console.log('chrono →', r.finished && r.finished.reason);
