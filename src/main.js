import * as THREE from 'three';
import {
  loadWorld, updateWorld, streamAround, areaReady, scareAnimals, heightAt, groundAt, moveActor, compounds, manifest,
  inCollider, rayBoxes, isLoadedAt, WATER_WALK_LIMIT,
} from './world.js';
import { Enemy, lerpAngle } from './enemy.js';
import { makeHuman } from './people.js';
import { MissionRunner, genDelivery, genPatrol } from './missions.js';
import { Vehicle, vehicleName } from './vehicles.js';
import * as sfx from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/* =====================================================================
   Sauvegarde
   ===================================================================== */
const SAVE_KEY = 'elite-sniper-save-v2';
let save = { money: 0, done: {}, sens: 1.5 };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (s) save = { ...save, ...s };
} catch (e) { /* ignore */ }
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

/* =====================================================================
   Rendu / scène
   ===================================================================== */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: (window.devicePixelRatio || 1) < 2,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

const FOG_COLOR = 0xb7cdd6;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.Fog(FOG_COLOR, 160, 780);

const BASE_FOV = 70;
const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.2, 1700);
camera.rotation.order = 'YXZ';
scene.add(camera);

/* =====================================================================
   Armes
   ===================================================================== */
const WEAPONS = {
  pistol: { id: 'pistol', name: 'PISTOLET', mag: 12, reserve: 72, rate: 0.28, auto: false, dmg: 34, spread: 0.014, v: 700, decel: 0, maxT: 0.45, reload: 1.2, kick: 0.02 },
  rifle: { id: 'rifle', name: "FUSIL D'ASSAUT", mag: 30, reserve: 150, rate: 0.1, auto: true, dmg: 26, spread: 0.022, v: 880, decel: 0, maxT: 0.6, reload: 1.9, kick: 0.012 },
  sniper: { id: 'sniper', name: 'SNIPER', mag: 5, reserve: 25, rate: 1.15, auto: false, dmg: 100, spread: 0, v: 800, decel: 220, maxT: 2.4, reload: 2.4, kick: 0.014, scope: true },
};
const ZOOMS = [
  { fov: 20, label: '4x' },
  { fov: 10, label: '8x' },
  { fov: 6.7, label: '12x' },
];
const G = 9.81;
const WIND_GAIN = 6;
const ZERO_ANGLE = 0.000775;

let owned = ['pistol', 'rifle', 'sniper'];
let wIdx = 0;
const ammo = {};
function refillAmmo() {
  for (const k in WEAPONS) ammo[k] = { mag: WEAPONS[k].mag, res: WEAPONS[k].reserve };
}
refillAmmo();
const weapon = () => WEAPONS[owned[wIdx]];

function setLoadout(l) {
  owned = l === 'sniper' ? ['sniper'] : ['pistol', 'rifle', 'sniper'];
  wIdx = 0;
  scoped = false;
  refillAmmo();
  reloadTimer = 0;
  updateAmmoHud();
}

/* =====================================================================
   État
   ===================================================================== */
let state = 'loading'; // loading | menu | playing | paused | ended | teleport
const player = { x: 0, y: 0, z: 0, hp: 100, dead: false, heading: 0, inVeh: null, speed: 0 };
let camYaw = 0, camPitch = -0.08;
let lookIdle = 0;
let scoped = false;
let aiming = false;
let zoomIdx = 1;
let holdBreath = false;
let stamina = 1;
let exhausted = false;
let cooldown = 0;
let reloadTimer = 0;
let boltPending = false;
let firing = false;
let gasDown = false, brakeDown = false;
let lockTarget = null;
const lockEl = $('lock');
const _lockV = new THREE.Vector3();
let fireLatch = false;
let noiseT = 0;
let lastDamageT = 99;
let shootPoseT = 0;
let dmgFlash = 0;
let hitMarkT = 0;
let tAbs = 0;
let recoil = 0;
let shake = 0;
let waypoint = null;
let startLock = null;
let handledFinish = null;
let pendingTeleport = null;

const windBase = { angle: rand(0, TAU), speed: rand(0.5, 3.5) };
const windNow = new THREE.Vector3();
let windSpeedNow = 0;

const enemies = [];
const vehicles = [];
const effects = [];
let nearVeh = null;

/* =====================================================================
   Joueur : modèle
   ===================================================================== */
const playerMesh = new THREE.Group();
const humans = { pistol: makeHuman('player', { gun: 'pistol' }), rifle: makeHuman('player', { gun: 'rifle' }), sniper: makeHuman('player', { gun: 'sniper' }) };
for (const k in humans) { playerMesh.add(humans[k].mesh); humans[k].mesh.visible = false; }
scene.add(playerMesh);
let walkPhase = 0;

/* =====================================================================
   Utilitaires monde
   ===================================================================== */
const _losB = new THREE.Vector3();
const _losDir = new THREE.Vector3();
function hasLOS(from, to) {
  _losDir.copy(to).sub(from);
  const len = _losDir.length();
  if (len < 0.01) return true;
  _losDir.divideScalar(len);
  if (rayBoxes(from, _losDir, len) < len) return false;
  for (let d = 4; d < len; d += 5) {
    _losB.copy(from).addScaledVector(_losDir, d);
    if (heightAt(_losB.x, _losB.z) > _losB.y + 0.1) return false;
  }
  return true;
}

const _enemyEye = new THREE.Vector3();
const _playerEye = new THREE.Vector3();
const env = {
  player,
  canSee(e) {
    _enemyEye.set(e.pos.x, e.pos.y + 1.5, e.pos.z);
    _playerEye.set(player.x, player.y + 1.4, player.z);
    return hasLOS(_enemyEye, _playerEye);
  },
  sightRange() { return (noiseT > 0 ? 90 : 38) * (player.inVeh ? 1.2 : 1); },
  isNoisy() { return noiseT > 0; },
  shoot(e) { enemyShoot(e); },
};

/* =====================================================================
   Effets visuels
   ===================================================================== */
const puffGeo = new THREE.SphereGeometry(0.1, 5, 4);
const PUFF_MAT = {
  dust: new THREE.MeshBasicMaterial({ color: 0x9b8b6a }),
  blood: new THREE.MeshBasicMaterial({ color: 0x8a0f0f }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffe08a }),
};

function spawnBurst(point, kind, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(puffGeo, PUFF_MAT[kind]);
    m.position.copy(point);
    scene.add(m);
    effects.push({ type: 'puff', mesh: m, vel: new THREE.Vector3(rand(-2, 2), rand(1, 4), rand(-2, 2)), life: 0.7, max: 0.7 });
  }
}

function spawnFlashAt(x, y, z, s) {
  const m = new THREE.Mesh(puffGeo, PUFF_MAT.flash);
  m.position.set(x, y, z);
  m.scale.setScalar(s);
  scene.add(m);
  effects.push({ type: 'flash', mesh: m, vel: new THREE.Vector3(), life: 0.08, max: 0.08 });
}

function spawnTracer(path) {
  if (path.length < 2) return;
  const geo = new THREE.BufferGeometry().setFromPoints(path);
  const mat = new THREE.LineBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.7, fog: false });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  effects.push({ type: 'tracer', mesh: line, life: 0.3, max: 0.3 });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const f = effects[i];
    f.life -= dt;
    if (f.life <= 0) {
      scene.remove(f.mesh);
      if (f.type === 'tracer') { f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
      effects.splice(i, 1);
      continue;
    }
    if (f.type === 'puff') {
      f.vel.y -= 9.8 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.scale.setScalar(Math.max(0.05, f.life / f.max));
    } else if (f.type === 'tracer') f.mesh.material.opacity = 0.7 * (f.life / f.max);
  }
}

/* =====================================================================
   Balistique
   ===================================================================== */
const _ray = new THREE.Ray();
const _seg = new THREE.Vector3();
const _cur = new THREE.Vector3();
const _mid = new THREE.Vector3();

function bulletPos(out, origin, dir, t, w) {
  const s = w.v * t - 0.5 * w.decel * t * t;
  const lag = w.decel ? (0.5 * w.decel * t * t) / w.v : 0;
  out.set(
    origin.x + dir.x * s + windNow.x * lag * WIND_GAIN,
    origin.y + dir.y * s - 0.5 * G * t * t,
    origin.z + dir.z * s + windNow.z * lag * WIND_GAIN
  );
  return out;
}

function traceBullet(origin, dir, w) {
  const path = [origin.clone()];
  const prev = origin.clone();
  const STEP = w.scope ? 0.004 : 0.008;
  let n = 0;
  for (let t = STEP; t <= w.maxT; t += STEP, n++) {
    bulletPos(_cur, origin, dir, t, w);
    _seg.copy(_cur).sub(prev);
    const len = _seg.length();
    if (len < 1e-6) break;
    _seg.divideScalar(len);
    _ray.origin.copy(prev);
    _ray.direction.copy(_seg);

    let best = null;
    for (const e of enemies) {
      if (e.dead) continue;
      const h = e.hitTest(_ray, len);
      if (h && (!best || h.dist < best.dist)) best = { dist: h.dist, head: h.head, type: 'enemy', enemy: e };
    }
    const d = rayBoxes(prev, _seg, len);
    if (d <= len && (!best || d < best.dist)) best = { dist: d, type: 'obstacle' };
    if (_cur.y < heightAt(_cur.x, _cur.z)) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 8; k++) {
        const m = (lo + hi) / 2;
        _mid.copy(prev).lerp(_cur, m);
        if (_mid.y < heightAt(_mid.x, _mid.z)) hi = m; else lo = m;
      }
      const dd = hi * len;
      if (!best || dd < best.dist) best = { dist: dd, type: 'terrain' };
    }
    if (best) {
      const point = prev.clone().addScaledVector(_seg, best.dist);
      path.push(point);
      best.point = point;
      best.path = path;
      return best;
    }
    if (n % 6 === 0) path.push(_cur.clone());
    prev.copy(_cur);
    if (_cur.y < -80) break;
  }
  return { type: 'none', path };
}

/* =====================================================================
   Tir du joueur
   ===================================================================== */
const _aim = new THREE.Vector3();
const _org = new THREE.Vector3();
function fire() {
  if (state !== 'playing' || player.dead || player.inVeh) return;
  const w = weapon();
  const a = ammo[w.id];
  if (cooldown > 0 || reloadTimer > 0) return;
  if (a.mag <= 0) {
    sfx.playEmpty();
    if (a.res > 0) startReload();
    cooldown = 0.25;
    return;
  }
  a.mag--;
  cooldown = w.rate;
  if (w.scope) boltPending = true;
  sfx.playShot();

  camera.updateMatrixWorld(true);
  camera.getWorldDirection(_aim);
  const isScoped = scoped && w.scope;
  if (lockTarget && !lockTarget.dead && !isScoped) {
    // visée automatique : vers le torse de la cible
    _lockV.set(lockTarget.pos.x, lockTarget.pos.y + 1.2, lockTarget.pos.z);
    _playerEye.set(player.x, player.y + 1.4, player.z);
    _aim.copy(_lockV).sub(_playerEye).normalize();
  }
  const spr = w.spread * (aiming || isScoped ? 0.4 : 1) * (w.scope && !isScoped ? 2.5 : 1);
  if (spr) {
    _aim.x += rand(-spr, spr);
    _aim.y += rand(-spr, spr);
    _aim.z += rand(-spr, spr);
  }
  if (w.scope) _aim.y += ZERO_ANGLE;
  _aim.normalize();
  // origine : devant le joueur (la caméra est derrière lui en 3ᵉ personne)
  if (isScoped) _org.copy(camera.position);
  else {
    if (lockTarget && !lockTarget.dead) _org.set(player.x, player.y + 1.4, player.z).addScaledVector(_aim, 0.6);
    else {
      const dist = camera.position.distanceTo(_playerEye.set(player.x, player.y + 1.5, player.z));
      _org.copy(camera.position).addScaledVector(_aim, dist + 0.6);
    }
  }
  const res = traceBullet(_org, _aim, w);
  recoil += isScoped ? 0.012 : w.kick;
  shootPoseT = 1.6;
  const muzzle = new THREE.Vector3(player.x + Math.sin(player.heading) * 0.9, player.y + 1.3, player.z + Math.cos(player.heading) * 0.9);
  if (!isScoped) {
    spawnFlashAt(muzzle.x, muzzle.y, muzzle.z, 1.4);
    res.path[0] = muzzle;
  }
  spawnTracer(res.path);

  if (res.type === 'enemy') {
    spawnBurst(res.point, 'blood', 8);
    damageEnemy(res.enemy, res.head, w, res.dist);
  } else if (res.type === 'terrain' || res.type === 'obstacle') spawnBurst(res.point, 'dust', 6);

  noiseT = w.scope ? 6 : 4;
  alertAfterShot(res.point || null, w.scope ? 140 : 80);
  scareAnimals(player.x, player.z, w.scope ? 90 : 55);
  if (a.mag <= 0 && a.res > 0) setTimeout(() => { if (state === 'playing') startReload(); }, w.scope ? 900 : 250);
  updateAmmoHud();
}

function alertAfterShot(impact, radius) {
  for (const e of enemies) {
    if (e.dead) continue;
    const dp = Math.hypot(e.pos.x - player.x, e.pos.z - player.z);
    if (e.civilian) {
      if (dp < 60) e.scare();
      continue;
    }
    if (e.state === 'alert') continue;
    let chance = 0;
    if (dp < 25) chance = 0.9;
    else if (dp < radius * 0.5) chance = 0.45;
    else if (dp < radius) chance = 0.2;
    if (impact) {
      const d = Math.hypot(e.pos.x - impact.x, e.pos.z - impact.z);
      if (d < 40) chance = Math.max(chance, 0.85);
    }
    if (Math.random() < chance) e.alert();
  }
}

function startReload() {
  const w = weapon();
  const a = ammo[w.id];
  if (reloadTimer > 0 || a.mag >= w.mag || a.res <= 0 || player.inVeh) return;
  reloadTimer = w.reload;
  sfx.playReload();
  updateAmmoHud();
}

function finishReload() {
  const w = weapon();
  const a = ammo[w.id];
  const need = w.mag - a.mag;
  const take = Math.min(need, a.res);
  a.mag += take;
  a.res -= take;
  updateAmmoHud();
}

function switchWeapon() {
  if (state !== 'playing' || owned.length < 2 || player.inVeh) return;
  wIdx = (wIdx + 1) % owned.length;
  scoped = false;
  reloadTimer = 0;
  cooldown = 0.3;
  updateAmmoHud();
}

function damageEnemy(e, head, w, dist) {
  const pdist = Math.hypot(e.pos.x - player.x, e.pos.z - player.z);
  e.hp -= w.dmg * (head ? 3 : 1);
  if (e.civilian && e.hp > 0) e.scare();
  if (e.hp <= 0) {
    killEnemy(e, head, pdist);
  } else {
    e.alert();
    popup('Touché !', 'info');
    sfx.playHit(false);
    showHitMark(false);
  }
}

function killEnemy(e, head, dist) {
  if (e.dead) return;
  e.die();
  if (e.civilian) {
    const fine = Math.min(save.money, 150);
    save.money -= fine;
    popup(`Civil touché  -${fine} $`, 'bad');
    persist();
    for (const o of enemies) if (o.civilian && !o.dead && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 40) o.scare();
    updateMoney();
    return;
  }
  const base = e.kind === 'officer' ? 400 : 100;
  const bonus = (head ? 60 : 0) + Math.floor(dist / 20) * 5;
  const total = base + bonus;
  save.money += total;
  persist();
  popup(`+${total} $  ${head ? 'TÊTE · ' : ''}${Math.round(dist)} m`, 'good');
  sfx.playHit(true);
  showHitMark(true);
  const a = ammo[weapon().id];
  a.res += Math.ceil(weapon().mag / 2);
  updateAmmoHud();
  updateMoney();
  for (const o of enemies) {
    if (o === e || o.dead || o.state === 'alert' || o.civilian) continue;
    if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 50 && Math.random() < 0.7) o.alert();
  }
}

function enemyShoot(e) {
  const d = Math.hypot(e.pos.x - player.x, e.pos.z - player.z);
  sfx.playEnemyShot(d);
  spawnFlashAt(e.pos.x + Math.sin(e.heading) * 0.9, e.pos.y + 1.3, e.pos.z + Math.cos(e.heading) * 0.9, 1.4 + d * 0.03);
  const from = new THREE.Vector3(e.pos.x, e.pos.y + 1.3, e.pos.z);
  const to = new THREE.Vector3(player.x + rand(-0.6, 0.6), player.y + 1.2, player.z + rand(-0.6, 0.6));
  spawnTracer([from, to]);
  const p = clamp(0.7 - d / 55, 0.1, 0.55) * (player.inVeh ? 0.6 : 1) * (aiming ? 0.85 : 1);
  if (Math.random() < p) damagePlayer(rand(6, 11) * (e.kind === 'officer' ? 1.4 : 1), e);
  else sfx.playWhiz();
}

function damagePlayer(amount, e) {
  if (player.dead) return;
  player.hp = Math.max(0, player.hp - amount);
  lastDamageT = 0;
  dmgFlash = 1;
  shake = 1;
  sfx.playHurt();
  if (e) {
    const f = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
    const r = { x: Math.cos(camYaw), z: -Math.sin(camYaw) };
    const ex = e.pos.x - player.x, ez = e.pos.z - player.z;
    const ang = Math.atan2(ex * r.x + ez * r.z, ex * f.x + ez * f.z);
    const dd = $('dmgdir');
    dd.style.transform = `rotate(${ang}rad)`;
    dd.style.opacity = '1';
    setTimeout(() => { dd.style.opacity = '0'; }, 900);
  }
  if (player.hp <= 0) playerDied();
}

/* =====================================================================
   Missions
   ===================================================================== */
const runner = new MissionRunner({
  scene,
  player,
  groundAt,
  enemies: () => enemies,
  spawnEnemy: (x, z, k, tag) => addEnemy(x, z, k, tag),
  say: (t, c) => popup(t, c),
  setLoadout,
});

function addEnemy(x, z, kind, tag) {
  const e = new Enemy(x, z, kind, env);
  e.tag = tag || null;
  enemies.push(e);
  scene.add(e.mesh);
  return e;
}

function removeEnemy(i) {
  const e = enemies[i];
  scene.remove(e.mesh);
  e.mesh.traverse((m) => { if (m.material && m.material.map && m.material.map.isCanvasTexture) m.material.dispose(); });
  enemies.splice(i, 1);
}

function startMission(def) {
  if (state !== 'playing' && state !== 'paused') return;
  if (runner.def && !runner.finished) runner.abort('Mission remplacée');
  handledFinish = null;
  runner.start(def);
  if (def.start) startLock = def.id;
  showBanner(`<b>${def.name}</b>${def.brief || ''}`);
  updateBeacons();
}

function finishMission() {
  const f = runner.finished;
  handledFinish = f;
  const def = f.def;
  let reward = 0;
  if (f.win) {
    const first = typeof def.id === 'number' && !save.done[def.id];
    reward = first || typeof def.id !== 'number' ? def.reward : Math.round(def.reward * 0.3);
    if (typeof def.id === 'number') save.done[def.id] = true;
    save.money += reward;
    persist();
    updateMoney();
  }
  setLoadout('all');
  runner.clear();
  updateBeacons();
  showEnd(f.win ? 'MISSION RÉUSSIE' : 'MISSION ÉCHOUÉE', f.win ? 'win' : 'lose', f.reason, [[def.name, ''], ['Récompense', f.win ? reward + ' $' : '—'], ['Argent', save.money + ' $']]);
}

/* =====================================================================
   Balises (monde) et GPS
   ===================================================================== */
const beaconGeo = new THREE.CylinderGeometry(1.4, 1.4, 90, 14, 1, true);
const beacons = new THREE.Group();
scene.add(beacons);
const startBeacons = [];
let objBeacon = null;

function makeBeacon(color) {
  const m = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  beacons.add(m);
  return m;
}

function setupBeacons() {
  for (const m of manifest.missions) {
    const b = makeBeacon(0xffc23a);
    b.userData = { x: m.start.x, z: m.start.z, id: m.id };
    b.position.set(m.start.x, 0, m.start.z);
    startBeacons.push(b);
  }
  objBeacon = makeBeacon(0x3ad1ff);
  objBeacon.visible = false;
}

function updateBeacons() {
  for (const b of startBeacons) {
    const done = !!save.done[b.userData.id];
    b.material.color.setHex(done ? 0x57d36a : 0xffc23a);
    b.visible = !runner.active;
  }
}

function placeBeaconY(b) {
  if (isLoadedAt(b.position.x, b.position.z)) b.position.y = groundAt(b.position.x, b.position.z) + 45;
  else b.position.y = 45;
}

function guidanceTarget() {
  if (runner.active) {
    const t = runner.targets.find((q) => q.kind !== 'enemy') || runner.targets[0];
    if (t) return t;
  }
  return waypoint;
}

/* =====================================================================
   Véhicules
   ===================================================================== */
function enterVehicle(v) {
  player.inVeh = v;
  v.occupied = true;
  playerMesh.visible = false;
  scoped = false;
  aiming = false;
  firing = false;
  camPitch = -0.2;
  camYaw = v.heading + Math.PI;
  document.body.classList.add('driving');
  document.body.classList.remove('scoped');
  sfx.playBolt();
}

function exitVehicle() {
  const v = player.inVeh;
  if (!v) return;
  const c = v.cfg;
  const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const spots = [
    [rx, rz, c.W / 2 + 1.1], [-rx, -rz, c.W / 2 + 1.1], [-fx, -fz, c.L / 2 + 1.1], [fx, fz, c.L / 2 + 1.1],
  ];
  let placed = false;
  for (const [dx, dz, d] of spots) {
    const x = v.x + dx * d, z = v.z + dz * d;
    if (groundAt(x, z) > WATER_WALK_LIMIT && !inCollider(x, z, 0.5)) { player.x = x; player.z = z; placed = true; break; }
  }
  if (!placed) { player.x = v.x + rx * (c.W / 2 + 1.1); player.z = v.z + rz * (c.W / 2 + 1.1); }
  v.occupied = false;
  player.inVeh = null;
  player.y = groundAt(player.x, player.z);
  playerMesh.visible = true;
  document.body.classList.remove('driving');
}

function useAction() {
  if (state !== 'playing' || player.dead) return;
  if (player.inVeh) { exitVehicle(); return; }
  if (nearVeh) enterVehicle(nearVeh);
}

function findNearVehicle() {
  let best = null, bd = 4.8;
  for (const v of vehicles) {
    if (v.occupied || !v.mesh.visible) continue;
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

/* =====================================================================
   Entrées
   ===================================================================== */
const touch = $('touch');
const keys = new Set();
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
let lookId = null, lastX = 0, lastY = 0;

function look(dx, dy) {
  const fov = camera.fov;
  const k = THREE.MathUtils.degToRad(fov) / window.innerHeight * save.sens * (scoped ? 1 : 1.15);
  camYaw -= dx * k;
  camPitch -= dy * k;
  camPitch = clamp(camPitch, scoped ? -0.5 : -0.9, scoped ? 0.55 : 1.0);
  lookIdle = 0;
}

touch.addEventListener('pointerdown', (e) => {
  if (state !== 'playing') return;
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement !== touch) {
      if (touch.requestPointerLock) touch.requestPointerLock();
    } else if (e.button === 0) { firing = true; fireLatch = true; }
    else if (e.button === 2) toggleAim();
    return;
  }
  const leftZone = e.clientX < window.innerWidth * 0.42;
  if (leftZone && joy.id === null) {
    joy.id = e.pointerId;
    joy.ox = e.clientX;
    joy.oy = e.clientY;
    joy.x = joy.y = 0;
    const j = $('joy');
    j.style.display = 'block';
    j.style.left = e.clientX + 'px';
    j.style.top = e.clientY + 'px';
    $('joyknob').style.transform = 'translate(0,0)';
    try { touch.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  } else if (!leftZone && lookId === null) {
    lookId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    try { touch.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
});
touch.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) {
    const R = Math.min(window.innerWidth, window.innerHeight) * 0.15;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    joy.x = dx / R;
    joy.y = -dy / R;
    $('joyknob').style.transform = `translate(${dx}px,${dy}px)`;
  } else if (e.pointerId === lookId) {
    look(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  }
});
function endPointer(e) {
  if (e.pointerId === joy.id) {
    joy.id = null;
    joy.x = joy.y = 0;
    $('joy').style.display = 'none';
  }
  if (e.pointerId === lookId) lookId = null;
  if (e.pointerType === 'mouse' && e.button === 0) firing = false;
}
touch.addEventListener('pointerup', endPointer);
touch.addEventListener('pointercancel', endPointer);
touch.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === touch && state === 'playing') look(e.movementX, e.movementY);
});
document.addEventListener('wheel', (e) => {
  if (state === 'playing' && scoped) zoomIdx = clamp(zoomIdx + (e.deltaY < 0 ? 1 : -1), 0, ZOOMS.length - 1);
}, { passive: true });

function bindBtn(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('down');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    onDown && onDown();
  });
  const up = (e) => {
    e.preventDefault();
    el.classList.remove('down');
    onUp && onUp();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function toggleAim() {
  if (state !== 'playing' || player.inVeh) return;
  aiming = !aiming;
  scoped = aiming && !!weapon().scope;
  if (!scoped) holdBreath = false;
}
function cycleZoom() { if (scoped) zoomIdx = (zoomIdx + 1) % ZOOMS.length; }

bindBtn($('bFire'), () => { firing = true; fireLatch = true; }, () => { firing = false; });
bindBtn($('bAim'), toggleAim);
bindBtn($('bGas'), () => { gasDown = true; }, () => { gasDown = false; });
bindBtn($('bBrake'), () => { brakeDown = true; }, () => { brakeDown = false; });
bindBtn($('bUse'), useAction);
bindBtn($('bWeapon'), switchWeapon);
bindBtn($('bBreath'), () => { if (scoped) holdBreath = true; }, () => { holdBreath = false; });
bindBtn($('bReload'), startReload);
bindBtn($('bPause'), () => pauseGame());
bindBtn($('bMap'), () => openMissions());
$('zoomlabel').style.pointerEvents = 'auto';
$('zoomlabel').addEventListener('pointerdown', (e) => { e.stopPropagation(); cycleZoom(); });

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (state === 'playing') {
    keys.add(k);
    if (k === ' ') { firing = true; fireLatch = true; e.preventDefault(); }
    else if (k === 'r') startReload();
    else if (k === 'e') useAction();
    else if (k === 'tab' || k === 'g') { switchWeapon(); e.preventDefault(); }
    else if (k === 'x') toggleAim();
    else if (k === 'c') cycleZoom();
    else if (k === 'm') openMissions();
    else if (k === 'escape' || k === 'p') pauseGame();
  } else if (state === 'paused' && (k === 'escape' || k === 'p')) resumeGame();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === ' ') firing = false;
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });

function inputVector() {
  let x = joy.x, y = joy.y;
  if (player.inVeh) {
    // en voiture : le joystick ne fait que braquer, les pédales accélèrent / freinent
    const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('q') || keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const ky = (gasDown || keys.has('w') || keys.has('z') || keys.has('arrowup') ? 1 : 0) - (brakeDown || keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    return { x: joy.id !== null ? clamp(x * 1.2, -1, 1) : kx, y: ky, run: false };
  }
  if (joy.id === null) {
    x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('q') || keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    y = (keys.has('w') || keys.has('z') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
  }
  return { x, y, run: keys.has('shift') };
}

/* =====================================================================
   Interface
   ===================================================================== */
const scopeCv = $('scope');
const sctx = scopeCv.getContext('2d');
const radarCv = $('radar');
const rctx = radarCv.getContext('2d');

function popup(text, cls) {
  const d = document.createElement('div');
  d.className = 'pop ' + (cls || 'info');
  d.textContent = text;
  const box = $('popups');
  box.appendChild(d);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => d.remove(), 1800);
}
function showHitMark(kill) {
  const h = $('hitmark');
  h.className = kill ? 'kill' : '';
  h.style.opacity = '1';
  hitMarkT = 0.25;
}
let bannerTimer = 0;
function showBanner(html) {
  const b = $('banner');
  b.innerHTML = html;
  b.style.opacity = '1';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.style.opacity = '0'; }, 5200);
}
function fmtTime(t) {
  t = Math.max(0, Math.ceil(t));
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
function updateMoney() { $('money').textContent = String(save.money); }
function updateAmmoHud() {
  const w = weapon();
  const a = ammo[w.id];
  $('ammo').textContent = `${w.name}  ${a.mag} / ${a.res}` + (reloadTimer > 0 ? '  ↻' : '');
  $('bWeapon').innerHTML = `${{ pistol: '🔫', rifle: '🪖', sniper: '🎯' }[w.id] || ''}<br>${w.id === 'pistol' ? 'PISTOLET' : w.id === 'rifle' ? 'FUSIL' : 'SNIPER'}`;
}

const hudLast = { obj: '', timer: '', dist: '', wind: '', zoom: '', prompt: '' };
function updateHud() {
  const objTxt = runner.active ? runner.describe() : '';
  if (objTxt !== hudLast.obj) {
    hudLast.obj = objTxt;
    $('objchip').classList.toggle('hidden', !objTxt);
    $('objv').textContent = objTxt;
  }
  const hasTimer = runner.active && runner.def.time > 0;
  const tm = hasTimer ? fmtTime(runner.timeLeft) : '';
  if (tm !== hudLast.timer) {
    hudLast.timer = tm;
    $('timerchip').classList.toggle('hidden', !hasTimer);
    $('timer').textContent = tm;
  }
  const tg = guidanceTarget();
  const ds = tg ? `${Math.round(Math.hypot(tg.x - player.x, tg.z - player.z))} m` : '';
  if (ds !== hudLast.dist) {
    hudLast.dist = ds;
    $('dist').classList.toggle('hidden', !ds);
    $('dist').textContent = ds;
  }
  const sn = weapon().scope && !player.inVeh;
  const ws = sn ? windSpeedNow.toFixed(1) : '';
  if (ws !== hudLast.wind) {
    hudLast.wind = ws;
    $('wind').classList.toggle('off', !sn);
    $('windv').textContent = ws;
  }
  if (sn) {
    const f = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
    const r = { x: Math.cos(camYaw), z: -Math.sin(camYaw) };
    const ang = Math.atan2(windNow.x * r.x + windNow.z * r.z, windNow.x * f.x + windNow.z * f.z);
    $('windarrow').style.transform = `rotate(${ang}rad)`;
  }
  $('hpfill').style.transform = `scaleX(${player.hp / 100})`;
  $('brfill').style.transform = `scaleX(${stamina})`;
  const zl = scoped ? ZOOMS[zoomIdx].label : '';
  if (zl !== hudLast.zoom) {
    hudLast.zoom = zl;
    $('zoomlabel').classList.toggle('hidden', !zl);
    $('zoomlabel').textContent = zl;
  }
  $('crosshair').style.display = scoped || player.inVeh ? 'none' : 'block';
  $('dmg').style.opacity = String(Math.min(1, dmgFlash + (player.hp < 30 ? 0.35 : 0)));
  // bouton / invite véhicule
  let prompt = '';
  if (player.inVeh) prompt = '';
  else if (nearVeh) prompt = `${vehicleName(nearVeh.type)} — ENTRER`;
  if (prompt !== hudLast.prompt) {
    hudLast.prompt = prompt;
    const p = $('prompt');
    p.textContent = prompt;
    p.style.display = prompt ? 'block' : 'none';
  }
  const bu = $('bUse');
  bu.classList.toggle('hidden', !player.inVeh && !nearVeh);
  bu.textContent = player.inVeh ? 'SORTIR' : 'ENTRER';
  document.body.classList.toggle('scoped', scoped);
}

/* ---------- Minimap ---------- */
const RADAR_RANGE = 130;
let radarT = 0;
function drawRadar() {
  const W = radarCv.width, c = W / 2, R = c - 4;
  const scale = R / RADAR_RANGE;
  rctx.clearRect(0, 0, W, W);
  rctx.save();
  rctx.beginPath();
  rctx.arc(c, c, R, 0, TAU);
  rctx.clip();
  rctx.fillStyle = '#26331c';
  rctx.fillRect(0, 0, W, W);
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  const cell = 8;
  for (let sy = -R; sy < R; sy += cell) {
    for (let sx = -R; sx < R; sx += cell) {
      const mx = sx + cell / 2, my = sy + cell / 2;
      if (mx * mx + my * my > (R + cell) * (R + cell)) continue;
      const wx = player.x + (rx * mx - fx * my) / scale;
      const wz = player.z + (rz * mx - fz * my) / scale;
      if (!isLoadedAt(wx, wz)) { rctx.fillStyle = '#10150c'; }
      else {
        const h = heightAt(wx, wz);
        if (h < 0.05) rctx.fillStyle = '#2e6f99';
        else if (inCollider(wx, wz, 0.5)) rctx.fillStyle = '#9a9a92';
        else {
          const g = clamp(70 + h * 2.2, 70, 150) | 0;
          rctx.fillStyle = `rgb(${g * 0.55 | 0},${g},${g * 0.4 | 0})`;
        }
      }
      rctx.fillRect(c + mx - cell / 2, c + my - cell / 2, cell, cell);
    }
  }
  const proj = (wx, wz, clampEdge) => {
    const dx = wx - player.x, dz = wz - player.z;
    let sx = (dx * rx + dz * rz) * scale, sy = -(dx * fx + dz * fz) * scale;
    const d = Math.hypot(sx, sy);
    let edge = false;
    if (d > R - 6) { if (!clampEdge) return null; sx = (sx / d) * (R - 6); sy = (sy / d) * (R - 6); edge = true; }
    return { x: c + sx, y: c + sy, edge };
  };
  const dot = (p, col, r) => { rctx.fillStyle = col; rctx.beginPath(); rctx.arc(p.x, p.y, r, 0, TAU); rctx.fill(); };
  for (const v of vehicles) { const p = proj(v.x, v.z, false); if (p) { rctx.fillStyle = '#6ab7ff'; rctx.fillRect(p.x - 3, p.y - 3, 6, 6); } }
  for (const e of enemies) {
    if (e.dead || e.civilian) continue;
    const p = proj(e.pos.x, e.pos.z, false);
    if (p) dot(p, e.state === 'alert' && Math.floor(tAbs * 4) % 2 ? '#fff' : '#ff3b30', e.kind === 'officer' ? 5 : 4);
  }
  if (!runner.active) {
    for (const b of startBeacons) { const p = proj(b.userData.x, b.userData.z, true); if (p) dot(p, save.done[b.userData.id] ? '#57d36a' : '#ffc23a', p.edge ? 4 : 6); }
  }
  if (runner.active) {
    for (const t of runner.targets) {
      const p = proj(t.x, t.z, t.kind !== 'enemy');
      if (p) dot(p, t.kind === 'enemy' ? '#ff6a3a' : t.kind === 'item' ? '#ffb347' : '#ffe14a', 5);
    }
  }
  if (waypoint) { const p = proj(waypoint.x, waypoint.z, true); if (p) dot(p, '#3ad1ff', 6); }
  rctx.restore();
  rctx.strokeStyle = 'rgba(255,255,255,.5)';
  rctx.lineWidth = 2;
  rctx.beginPath();
  rctx.arc(c, c, R, 0, TAU);
  rctx.stroke();
  rctx.fillStyle = '#fff';
  rctx.beginPath();
  rctx.moveTo(c, c - 8);
  rctx.lineTo(c + 6, c + 7);
  rctx.lineTo(c, c + 3);
  rctx.lineTo(c - 6, c + 7);
  rctx.closePath();
  rctx.fill();
}

/* ---------- Lunette ---------- */
function dropAngle(R) {
  const w = WEAPONS.sniper;
  const disc = w.v * w.v - 2 * w.decel * R;
  if (disc <= 0) return 0;
  const t = (w.v - Math.sqrt(disc)) / w.decel;
  return Math.atan((0.5 * G * t * t) / R) - ZERO_ANGLE;
}

function drawScope() {
  const w = scopeCv.width, h = scopeCv.height, cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.47;
  sctx.clearRect(0, 0, w, h);
  sctx.fillStyle = '#000';
  sctx.beginPath();
  sctx.rect(0, 0, w, h);
  sctx.arc(cx, cy, R, 0, TAU, true);
  sctx.fill('evenodd');
  const g = sctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.6)');
  sctx.fillStyle = g;
  sctx.beginPath();
  sctx.arc(cx, cy, R, 0, TAU);
  sctx.fill();
  sctx.strokeStyle = 'rgba(0,0,0,.92)';
  sctx.fillStyle = 'rgba(0,0,0,.92)';
  const gap = 7;
  sctx.lineWidth = 1.2;
  sctx.beginPath();
  sctx.moveTo(cx - R, cy); sctx.lineTo(cx - gap, cy);
  sctx.moveTo(cx + gap, cy); sctx.lineTo(cx + R, cy);
  sctx.moveTo(cx, cy - R); sctx.lineTo(cx, cy - gap);
  sctx.moveTo(cx, cy + gap); sctx.lineTo(cx, cy + R);
  sctx.stroke();
  sctx.lineWidth = 5;
  sctx.beginPath();
  sctx.moveTo(cx - R, cy); sctx.lineTo(cx - R * 0.45, cy);
  sctx.moveTo(cx + R * 0.45, cy); sctx.lineTo(cx + R, cy);
  sctx.moveTo(cx, cy + R * 0.45); sctx.lineTo(cx, cy + R);
  sctx.stroke();
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const pxPerRad = h / 2 / tanHalf;
  let lastPy = 0;
  sctx.lineWidth = 1.5;
  sctx.font = `${Math.max(10, Math.round(h * 0.022))}px sans-serif`;
  sctx.textBaseline = 'middle';
  for (const range of [200, 300, 400, 500]) {
    const py = Math.tan(dropAngle(range)) * pxPerRad;
    if (py - lastPy < 5 || py > R * 0.44) continue;
    lastPy = py;
    const half = 10 + (range === 300 || range === 500 ? 0 : 5);
    sctx.beginPath();
    sctx.moveTo(cx - half, cy + py); sctx.lineTo(cx + half, cy + py);
    sctx.stroke();
    if (py > 14) sctx.fillText(String(range / 100), cx + half + 4, cy + py);
  }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  scopeCv.width = w;
  scopeCv.height = h;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

/* =====================================================================
   Menus
   ===================================================================== */
const OVERLAYS = ['menu', 'pause', 'mlist', 'end', 'loading'];
function showOnly(name) {
  for (const o of OVERLAYS) $(o).classList.toggle('hidden', o !== name);
  const playing = name === null;
  $('hud').classList.toggle('hidden', !playing && !['pause', 'mlist', 'end'].includes(name));
  $('controls').classList.toggle('hidden', !playing);
}

function showEnd(title, cls, reason, rows) {
  state = 'ended';
  firing = false;
  const t = $('endtitle');
  t.textContent = title;
  t.className = cls;
  $('endreason').textContent = reason || '';
  $('endstats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  showOnly('end');
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  firing = false;
  joy.id = null; joy.x = joy.y = 0; $('joy').style.display = 'none';
  if (document.exitPointerLock) document.exitPointerLock();
  $('btnAbort').style.display = runner.active ? '' : 'none';
  showOnly('pause');
}
function resumeGame() {
  if (state !== 'paused' && state !== 'mlist') return;
  state = 'playing';
  showOnly(null);
}

function openMissions() {
  if (state !== 'playing' && state !== 'paused') return;
  state = 'paused';
  firing = false;
  joy.id = null; joy.x = joy.y = 0; $('joy').style.display = 'none';
  buildMissionList();
  showOnly('mlist');
}

function buildMissionList() {
  $('mmoney').textContent = `${save.money} $`;
  const box = $('missions');
  box.innerHTML = '';
  for (const m of manifest.missions) {
    const d = Math.round(Math.hypot(m.start.x - player.x, m.start.z - player.z));
    const el = document.createElement('div');
    el.className = 'mcard' + (save.done[m.id] ? ' done' : '');
    el.innerHTML = `<div class="mn">${save.done[m.id] ? '✓' : m.id}</div>
      <div class="mt">${m.name}<small>${m.brief}</small><small>À ${d} m · ${m.time ? 'Chrono ' + fmtTime(m.time) : 'Sans limite'}</small></div>
      <div class="mact"><div class="mb">${m.reward} $</div>
      <button class="smallbtn" data-a="gps">GPS</button><button class="smallbtn go" data-a="go">Départ</button></div>`;
    el.querySelector('[data-a=gps]').addEventListener('click', () => { waypoint = { x: m.start.x, z: m.start.z }; startBeaconFor(waypoint); resumeGame(); popup('Balise GPS posée', 'info'); });
    el.querySelector('[data-a=go]').addEventListener('click', () => { teleportTo(m.start.x, m.start.z, () => startMission(m)); });
    box.appendChild(el);
  }
  const jobs = $('jobs');
  jobs.innerHTML = '';
  const defs = [
    { label: 'Livraison express', sub: 'Livrez un colis dans une ville, contre la montre. Prenez une voiture !', gen: () => genDelivery(manifest, player, groundAt) },
    { label: 'Contrat : camp ennemi', sub: 'Éliminez la garnison d’un camp militaire.', gen: () => genPatrol(manifest, player, groundAt) },
  ];
  for (const j of defs) {
    const el = document.createElement('div');
    el.className = 'mcard';
    el.innerHTML = `<div class="mn">$</div><div class="mt">${j.label}<small>${j.sub}</small></div><div class="mact"><button class="smallbtn go">Accepter</button></div>`;
    el.querySelector('button').addEventListener('click', () => {
      const def = j.gen();
      resumeGame();
      startMission(def);
    });
    jobs.appendChild(el);
  }
}

function startBeaconFor() { /* la balise bleue est mise à jour chaque image */ }

function teleportTo(x, z, then) {
  if (player.inVeh) exitVehicle();
  player.x = x;
  player.z = z;
  player.y = 0;
  pendingTeleport = then || null;
  state = 'teleport';
  $('loadtxt').textContent = 'Chargement de la zone…';
  $('loadfill').style.transform = 'scaleX(0.5)';
  showOnly('loading');
}

function resetToSafehouse() {
  const s = manifest.spawn;
  player.x = s.x; player.z = s.z; player.hp = 100; player.dead = false;
  player.y = groundAt(player.x, player.z);
  playerMesh.visible = true;
}

function playerDied() {
  player.dead = true;
  firing = false;
  if (player.inVeh) exitVehicle();
  const lost = Math.min(save.money, 200);
  save.money -= lost;
  persist();
  updateMoney();
  if (runner.active) runner.abort('Vous êtes mort');
  const f = runner.finished;
  handledFinish = f;
  if (f) { setLoadout('all'); runner.clear(); updateBeacons(); }
  showEnd('VOUS ÊTES MORT', 'lose', 'Réveil au refuge — frais médicaux', [['Frais', `-${lost} $`], ['Argent', `${save.money} $`]]);
}

$('btnPlay').addEventListener('click', () => {
  sfx.initAudio();
  state = 'playing';
  showOnly(null);
  popup('Bienvenue ! Les balises dorées lancent les missions.', 'info');
});
$('btnResume').addEventListener('click', resumeGame);
$('btnMissions').addEventListener('click', () => { state = 'playing'; openMissions(); });
$('btnMClose').addEventListener('click', () => { state = 'playing'; showOnly(null); });
$('btnHome').addEventListener('click', () => { state = 'playing'; if (runner.active) runner.abort('Mission abandonnée'); teleportTo(manifest.spawn.x, manifest.spawn.z); });
$('btnAbort').addEventListener('click', () => { state = 'playing'; showOnly(null); runner.abort('Mission abandonnée'); });
$('btnEndOk').addEventListener('click', () => {
  if (player.dead) {
    resetToSafehouse();
    teleportTo(manifest.spawn.x, manifest.spawn.z);
    return;
  }
  state = 'playing';
  showOnly(null);
});
function bindSens(id) {
  const el = $(id);
  el.value = String(save.sens);
  el.addEventListener('input', (e) => {
    save.sens = parseFloat(e.target.value);
    $('sens').value = $('sens2').value = String(save.sens);
    persist();
  });
}
bindSens('sens');
bindSens('sens2');

/* =====================================================================
   Population dynamique : camps ennemis et civils
   ===================================================================== */
const campState = [];
let popT = 0;
function updatePopulation(dt) {
  popT -= dt;
  if (popT > 0) return;
  popT = 1.0;
  // camps : garnison présente quand le joueur est proche
  for (let i = 0; i < manifest.camps.length; i++) {
    const c = manifest.camps[i];
    const cs = (campState[i] ||= { list: null, until: 0 });
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (!cs.list && d < 260 && tAbs > cs.until && areaReady(c.x, c.z, 80)) {
      cs.list = [];
      const n = c.kind === 'military' ? 5 : 3;
      for (let k = 0; k < n; k++) {
        for (let tries = 0; tries < 20; tries++) {
          const a = Math.random() * TAU, r = 4 + Math.random() * 20;
          const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
          if (inCollider(x, z, 1) || groundAt(x, z) < 0.5) continue;
          cs.list.push(addEnemy(x, z, k === 0 && c.kind === 'military' ? 'officer' : 'soldier', null));
          break;
        }
      }
    } else if (cs.list && d > 420) {
      if (cs.list.every((e) => e.dead || e.remove)) cs.until = tAbs + 240;
      for (const e of cs.list) if (!e.persistent) { const ix = enemies.indexOf(e); if (ix >= 0) removeEnemy(ix); }
      cs.list = null;
    }
  }
  // civils : dans les villes
  let town = null;
  for (const t of manifest.towns) {
    if (t.type === 'military') continue;
    if (Math.hypot(t.x - player.x, t.z - player.z) < t.r * 0.9) { town = t; break; }
  }
  let civs = 0;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.civilian) continue;
    if (e.dist > 130 || e.remove) removeEnemy(i); else civs++;
  }
  if (town && civs < 9) {
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * TAU, r = 35 + Math.random() * 55;
      const x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
      if (!isLoadedAt(x, z) || groundAt(x, z) < 1 || inCollider(x, z, 1.2)) continue;
      addEnemy(x, z, 'civilian', null);
      break;
    }
  }
}

/* =====================================================================
   Boucle de jeu
   ===================================================================== */
let last = performance.now();
let radarDraw = 0;
let streamT = 0;
const camTarget = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _back = new THREE.Vector3();

function updateLock() {
  lockTarget = null;
  lockEl.style.display = 'none';
  if (player.inVeh || player.dead || (scoped && weapon().scope)) return;
  const range = weapon().id === 'pistol' ? 28 : weapon().id === 'rifle' ? 45 : 60;
  let best = null, bd = range;
  _playerEye.set(player.x, player.y + 1.4, player.z);
  for (const e of enemies) {
    if (e.dead || e.civilian) continue;
    const d = Math.hypot(e.pos.x - player.x, e.pos.z - player.z);
    if (d >= bd) continue;
    _lockV.set(e.pos.x, e.pos.y + 1.3, e.pos.z);
    if (!hasLOS(_playerEye, _lockV)) continue;
    best = e; bd = d;
  }
  lockTarget = best;
  if (best) {
    _lockV.set(best.pos.x, best.pos.y + 1.2, best.pos.z).project(camera);
    if (_lockV.z < 1 && Math.abs(_lockV.x) < 1.1 && Math.abs(_lockV.y) < 1.1) {
      lockEl.style.display = 'block';
      lockEl.style.left = ((_lockV.x + 1) / 2 * window.innerWidth) + 'px';
      lockEl.style.top = ((1 - _lockV.y) / 2 * window.innerHeight) + 'px';
    }
  }
}

function updatePlayer(dt) {
  const inp = inputVector();
  const w = weapon();

  if (player.inVeh) {
    const v = player.inVeh;
    v.update(dt, { throttle: inp.y, steer: inp.x });
    player.x = v.x; player.z = v.z; player.y = v.y;
    player.speed = v.speed;
    if (v.hitSpeed > 9) {
      damagePlayer((v.hitSpeed - 8) * 1.6, null);
      sfx.playHurt();
    }
    // écrase les piétons / ennemis
    if (Math.abs(v.speed) > 6) {
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.pos.x - v.x, e.pos.z - v.z) < 1.9) {
          e.hp -= 200;
          killEnemy(e, false, 0);
          spawnBurst(new THREE.Vector3(e.pos.x, e.pos.y + 1, e.pos.z), 'blood', 8);
        }
      }
    }
    return;
  }

  // marche / course
  const l = Math.hypot(inp.x, inp.y);
  let speed = 0;
  if (l > 0.08) {
    const wantRun = (l > 0.88 || inp.run) && !aiming && !exhausted;
    speed = (wantRun ? 7.4 : 4.2) * Math.min(1, l * 1.15);
    if (aiming) speed = 2.2 * Math.min(1, l * 1.2);
    if (wantRun) {
      stamina = Math.max(0, stamina - dt * 0.18);
      if (stamina <= 0) exhausted = true;
    }
    const f = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
    const r = { x: Math.cos(camYaw), z: -Math.sin(camYaw) };
    const mx = (f.x * inp.y + r.x * inp.x) / l, mz = (f.z * inp.y + r.z * inp.x) / l;
    const a = { x: player.x, z: player.z };
    moveActor(a, mx * speed * dt, mz * speed * dt, 0.4, 1.75);
    player.x = a.x; player.z = a.z;
    if (!(aiming || shootPoseT > 0 || lockTarget)) player.heading = lerpAngle(player.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
    walkPhase += dt * speed * 2.4;
  }
  player.speed = speed;
  if (lockTarget && !aiming) player.heading = lerpAngle(player.heading, Math.atan2(lockTarget.pos.x - player.x, lockTarget.pos.z - player.z), Math.min(1, dt * 14));
  else if (aiming || shootPoseT > 0) player.heading = lerpAngle(player.heading, camYaw + Math.PI, Math.min(1, dt * 14));
  if (speed < 6.5) stamina = Math.min(1, stamina + dt * (holdBreath ? 0 : 0.2));
  if (exhausted && stamina > 0.35) exhausted = false;
  player.y += (groundAt(player.x, player.z) - player.y) * Math.min(1, dt * 14);
  if (Math.abs(player.y - groundAt(player.x, player.z)) > 2) player.y = groundAt(player.x, player.z);
  void w;
}

function updateCamera(dt) {
  const sniperScope = scoped && weapon().scope;
  const targetFov = sniperScope ? ZOOMS[zoomIdx].fov : aiming ? 52 : player.inVeh ? 75 : BASE_FOV;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();

  if (player.inVeh && lookIdle > 1.2 && Math.abs(player.speed) > 2) {
    camYaw = lerpAngle(camYaw, player.inVeh.heading + Math.PI, Math.min(1, dt * 1.6));
    camPitch += (-0.18 - camPitch) * Math.min(1, dt * 1.2);
  }

  const sway = (holdBreath ? 0.15 : 1) * (sniperScope ? 0.0011 * (camera.fov / 10) * 8 : 0);
  const sy = Math.sin(tAbs * 1.3) * sway, sp = Math.cos(tAbs * 1.7) * sway;
  const shk = shake * 0.01;
  camera.rotation.set(camPitch + sp + recoil + (Math.random() - 0.5) * shk, camYaw + sy + (Math.random() - 0.5) * shk, 0);

  if (sniperScope) {
    camera.position.set(player.x, player.y + 1.62, player.z);
    playerMesh.visible = false;
    return;
  }
  playerMesh.visible = !player.inVeh;
  const D = player.inVeh ? 8.5 : aiming ? 2.3 : 3.7;
  const lift = player.inVeh ? 2.0 : 1.65;
  const side = player.inVeh ? 0 : aiming ? 0.7 : 0.45;
  const f = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
  const r = { x: Math.cos(camYaw), z: -Math.sin(camYaw) };
  _pivot.set(player.x + r.x * side, player.y + lift, player.z + r.z * side);
  const cp = Math.cos(camPitch + recoil), spn = Math.sin(camPitch + recoil);
  _back.set(-f.x * cp, -spn, -f.z * cp); // direction pivot → caméra
  let dist = D;
  const d = rayBoxes(_pivot, _back, D);
  if (d < dist) dist = Math.max(0.6, d - 0.35);
  camTarget.copy(_pivot).addScaledVector(_back, dist);
  const gy = groundAt(camTarget.x, camTarget.z) + 0.45;
  if (camTarget.y < gy) camTarget.y = gy;
  camera.position.copy(camTarget);
}

function animatePlayerMesh() {
  playerMesh.position.set(player.x, player.y, player.z);
  playerMesh.rotation.y = player.heading;
  const cur = humans[weapon().id];
  for (const k in humans) humans[k].mesh.visible = humans[k] === cur;
  cur.pose(walkPhase, player.speed > 0.2 ? Math.min(1.2, player.speed / 6) : 0);
}

function update(real) {
  const dt = Math.min(real, 0.05);
  tAbs += dt;
  noiseT = Math.max(0, noiseT - dt);
  cooldown = Math.max(0, cooldown - dt);
  shootPoseT = Math.max(0, shootPoseT - dt);
  lookIdle += dt;
  recoil *= Math.pow(0.02, dt);
  shake = Math.max(0, shake - dt * 2.5);
  dmgFlash = Math.max(0, dmgFlash - dt * 1.6);
  if (hitMarkT > 0) { hitMarkT -= dt; if (hitMarkT <= 0) $('hitmark').style.opacity = '0'; }
  lastDamageT += dt;
  if (lastDamageT > 8 && player.hp < 100) player.hp = Math.min(100, player.hp + dt * 2.5);

  // vent
  windBase.angle += dt * 0.02;
  windBase.speed = clamp(windBase.speed + (Math.random() - 0.5) * dt * 0.3, 0.3, 5);
  windSpeedNow = windBase.speed;
  windNow.set(Math.sin(windBase.angle) * windSpeedNow, 0, Math.cos(windBase.angle) * windSpeedNow);

  if (reloadTimer > 0) { reloadTimer -= dt; if (reloadTimer <= 0) finishReload(); }
  if (boltPending && cooldown < 0.75) { boltPending = false; sfx.playBolt(); }

  // tir continu
  const w = weapon();
  if (firing && !player.inVeh) {
    if (w.auto || fireLatch) fire();
    fireLatch = false;
  }
  if (!firing) fireLatch = false;

  updatePlayer(dt);

  // véhicules libres (inertie)
  for (const v of vehicles) {
    if (v === player.inVeh) continue;
    if (Math.abs(v.speed) > 0.05) v.update(dt, null); else if (v.mesh.visible) v.sync();
  }
  nearVeh = player.inVeh ? null : findNearVehicle();

  // ennemis
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const far = Math.hypot(e.pos.x - player.x, e.pos.z - player.z) > 320;
    e.mesh.visible = !far;
    if (far && !e.dead) { e.dist = 999; continue; }
    e.update(dt);
    if (e.remove) removeEnemy(i);
  }
  updatePopulation(dt);

  // missions
  runner.update(dt);
  if (runner.finished && handledFinish !== runner.finished) finishMission();
  if (!runner.active) {
    // départ de mission : marcher dans une balise dorée
    for (const b of startBeacons) {
      const d = Math.hypot(b.userData.x - player.x, b.userData.z - player.z);
      if (startLock === b.userData.id) { if (d > 9) startLock = null; continue; }
      if (d < 4.5) {
        const m = manifest.missions.find((q) => q.id === b.userData.id);
        startMission(m);
        break;
      }
    }
  }
  // balise d'objectif
  const tg = guidanceTarget();
  if (waypoint && Math.hypot(waypoint.x - player.x, waypoint.z - player.z) < 12) { waypoint = null; popup('Destination atteinte', 'good'); }
  if (tg && tg.kind !== 'enemy') {
    objBeacon.visible = true;
    objBeacon.position.x = tg.x; objBeacon.position.z = tg.z;
  } else objBeacon.visible = false;
  streamT -= dt;
  if (streamT <= 0) {
    streamT = 0.25;
    streamAround(player.x, player.z);
    for (const b of startBeacons) placeBeaconY(b);
    if (objBeacon.visible) placeBeaconY(objBeacon);
  }

  updateWorld(dt, { x: player.x, y: player.y, z: player.z });
  animatePlayerMesh();
  updateCamera(dt);
  updateEffects(dt);
  updateLock();
  updateHud();
  radarDraw -= dt;
  if (radarDraw <= 0) { radarDraw = 0.2; drawRadar(); }
  if (scoped) { scopeCv.style.display = 'block'; drawScope(); } else scopeCv.style.display = 'none';
}

function frame(now) {
  requestAnimationFrame(frame);
  const real = (now - last) / 1000;
  last = now;
  if (state === 'playing') update(real);
  else if (state === 'teleport') {
    streamAround(player.x, player.z);
    if (areaReady(player.x, player.z, 230)) {
      player.y = groundAt(player.x, player.z);
      state = 'playing';
      showOnly(null);
      const cb = pendingTeleport;
      pendingTeleport = null;
      if (cb) cb();
    }
  } else if (state === 'menu') {
    camYaw += real * 0.1;
    camera.position.set(player.x, player.y + 5, player.z);
    camera.rotation.set(-0.15, camYaw, 0);
  }
  if (state !== 'loading') renderer.render(scene, camera);
}

/* =====================================================================
   Démarrage
   ===================================================================== */
async function boot() {
  try {
    const info = await loadWorld(scene, (p, txt) => {
      $('loadfill').style.transform = `scaleX(${p})`;
      $('loadtxt').textContent = txt;
    });
    const s = manifest.spawn;
    player.x = s.x; player.z = s.z;
    player.y = groundAt(s.x, s.z);
    camYaw = s.yaw || 0;
    for (const spec of manifest.vehicles) {
      const v = new Vehicle(spec);
      v.y = groundAt(v.x, v.z);
      v.sync();
      vehicles.push(v);
      scene.add(v.mesh);
    }
    setupBeacons();
    updateBeacons();
    updateMoney();
    updateAmmoHud();
    console.log('Monde chargé', info);
    state = 'menu';
    showOnly('menu');
  } catch (err) {
    console.error(err);
    $('loadtxt').textContent = 'Erreur : ' + err.message;
    return;
  }
}
requestAnimationFrame(frame);
boot();
