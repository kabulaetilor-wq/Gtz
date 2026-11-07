import * as THREE from 'three';

/* Moteur de missions : étapes goto / kill / collect, chrono, récompense.
   host : { scene, player:{x,z}, spawnEnemy(x,z,kind,tag), enemies(), say(text,cls), setLoadout(l), isInVehicle() } */

const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const crateMat = new THREE.MeshLambertMaterial({ color: 0xb5813a });

export class MissionRunner {
  constructor(host) {
    this.host = host;
    this.def = null;
    this.step = -1;
    this.timeLeft = 0;
    this.crates = [];
    this.collected = 0;
    this.kills = 0;
    this.enemiesLeft = 0;
    this.targets = [];
    this.finished = null; // null | { win, reason }
  }

  get active() { return !!this.def && !this.finished; }
  get current() { return this.def && this.def.steps[this.step]; }

  start(def) {
    this.clear();
    this.def = def;
    this.finished = null;
    this.timeLeft = def.time || 0;
    this.step = -1;
    this.host.setLoadout(def.loadout || 'all');
    this.host.say(def.name, 'good');
    this.next();
  }

  clear() {
    for (const c of this.crates) this.host.scene.remove(c.mesh);
    this.crates = [];
    for (const e of this.host.enemies()) if (e.tag && e.tag.startsWith('m')) e.persistent = false;
    this.def = null;
    this.targets = [];
    this.finished = null;
  }

  abort(reason = 'Mission abandonnée') {
    if (!this.def || this.finished) return;
    this.finish(false, reason);
  }

  finish(win, reason) {
    this.finished = { win, reason, def: this.def };
    this.targets = [];
    for (const c of this.crates) this.host.scene.remove(c.mesh);
    this.crates = [];
    for (const e of this.host.enemies()) if (e.tag && e.tag.startsWith('m')) { e.persistent = false; if (!win) e.tag = null; }
  }

  next() {
    this.step++;
    const s = this.current;
    if (!s) { this.finish(true, 'Mission accomplie'); return; }
    this.host.say(s.text, 'info');
    if (s.type === 'kill') {
      this.enemiesLeft = s.spawns.length;
      this.stepEnemies = s.spawns.map((sp) => {
        const e = this.host.spawnEnemy(sp.x, sp.z, sp.k, 'm' + this.def.id);
        e.persistent = true;
        return e;
      });
    } else if (s.type === 'collect') {
      this.collected = 0;
      for (const p of s.points) {
        const mesh = new THREE.Mesh(crateGeo, crateMat);
        mesh.position.set(p.x, this.host.groundAt(p.x, p.z) + 0.45, p.z);
        this.host.scene.add(mesh);
        this.crates.push({ x: p.x, z: p.z, mesh });
      }
    }
  }

  update(dt) {
    if (!this.active) return;
    const h = this.host, p = h.player;
    if (this.timeLeft > 0 || this.def.time > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.finish(false, 'Temps écoulé'); return; }
    }
    const s = this.current;
    this.targets = [];
    if (s.type === 'goto') {
      this.targets.push({ x: s.x, z: s.z, kind: 'goto' });
      if (Math.hypot(p.x - s.x, p.z - s.z) < s.r) { h.say('Objectif atteint', 'good'); this.next(); }
    } else if (s.type === 'kill') {
      let left = 0;
      for (const e of this.stepEnemies) {
        if (!e.dead) { left++; this.targets.push({ x: e.pos.x, z: e.pos.z, kind: 'enemy' }); }
      }
      this.enemiesLeft = left;
      if (left === 0) { this.stepEnemies = null; this.next(); }
    } else if (s.type === 'collect') {
      for (let i = this.crates.length - 1; i >= 0; i--) {
        const c = this.crates[i];
        c.mesh.rotation.y += dt;
        if (Math.hypot(p.x - c.x, p.z - c.z) < 2.6) {
          h.scene.remove(c.mesh);
          this.crates.splice(i, 1);
          this.collected++;
          h.say(`${s.item || 'objet'} récupéré (${this.collected}/${s.points.length})`, 'good');
        } else this.targets.push({ x: c.x, z: c.z, kind: 'item' });
      }
      if (this.crates.length === 0) this.next();
    }
  }

  // Texte d'objectif pour le HUD
  describe() {
    if (!this.def) return '';
    const s = this.current;
    if (!s) return this.def.name;
    let extra = '';
    if (s.type === 'kill') extra = ` (${this.enemiesLeft} restant${this.enemiesLeft > 1 ? 's' : ''})`;
    if (s.type === 'collect') extra = ` (${this.collected}/${s.points.length})`;
    return s.text + extra;
  }
}

/* ---------- Missions annexes générées à la volée ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
export function spotInTown(t, ground) {
  for (let i = 0; i < 200; i++) {
    const a = rnd(0, 6.283), r = rnd(0, t.r * 0.6);
    const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
    if (ground(x, z) > 1) return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  }
  return { x: t.x, z: t.z };
}

export function genDelivery(manifest, player, ground) {
  const towns = manifest.towns.filter((t) => Math.hypot(t.x - player.x, t.z - player.z) > 250);
  const t = towns[(Math.random() * towns.length) | 0] || manifest.towns[0];
  const spot = spotInTown(t, ground);
  const d = Math.hypot(spot.x - player.x, spot.z - player.z);
  return {
    id: 'job-liv', name: `Livraison à ${t.name}`, reward: Math.round(d * 0.9 / 10) * 10 + 150, time: Math.round(d / 9 + 40), start: null, loadout: 'all',
    brief: 'Livrez le colis avant la fin du chrono. Prenez un véhicule !',
    steps: [{ type: 'goto', x: spot.x, z: spot.z, r: 9, text: `Livrez le colis à ${t.name}` }],
  };
}

export function genPatrol(manifest, player, ground) {
  const camps = manifest.camps;
  const c = camps[(Math.random() * camps.length) | 0];
  const n = 4 + ((Math.random() * 4) | 0);
  const spawns = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, r = 6 + Math.random() * 16;
    spawns.push({ x: Math.round((c.x + Math.cos(a) * r) * 10) / 10, z: Math.round((c.z + Math.sin(a) * r) * 10) / 10, k: i === 0 ? 'officer' : 'soldier' });
  }
  return {
    id: 'job-pat', name: 'Contrat : camp ennemi', reward: 700 + n * 120, time: 0, start: null, loadout: 'all',
    brief: 'Rendez-vous au camp et éliminez la garnison.',
    steps: [
      { type: 'goto', x: c.x, z: c.z - 60, r: 50, text: 'Approchez du camp ennemi' },
      { type: 'kill', spawns, text: 'Éliminez la garnison' },
    ],
  };
}
