import * as THREE from 'three';
import { groundAt, moveActor } from './world.js';
import { makeHuman } from './people.js';

let alertTex = null;
function getAlertTexture() {
  if (alertTex) return alertTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff2a2a';
  g.strokeStyle = '#000';
  g.lineWidth = 6;
  g.font = 'bold 60px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeText('!', 32, 34);
  g.fillText('!', 32, 34);
  alertTex = new THREE.CanvasTexture(c);
  return alertTex;
}

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const _sph = new THREE.Sphere();
const _box = new THREE.Box3();
const _hit = new THREE.Vector3();

/* =====================================================================
   Soldat / officier / civil
   env : { player:{x,y,z,dead}, canSee(e), shoot(e), isNoisy() }
   ===================================================================== */
export class Enemy {
  constructor(x, z, kind, env) {
    this.kind = kind; // 'soldier' | 'officer' | 'civilian'
    this.env = env;
    this.civilian = kind === 'civilian';
    this.hp = kind === 'officer' ? 150 : this.civilian ? 40 : 100;
    this.home = { x, z };
    this.pos = new THREE.Vector3(x, groundAt(x, z), z);
    this.state = 'patrol';
    this.dead = false;
    this.deathT = 0;
    this.remove = false;
    this.target = null;
    this.wait = Math.random() * 3;
    this.phase = Math.random() * 6.28;
    this.speed = (this.civilian ? 1.2 : 1.1) + Math.random() * 0.5;
    this.shootTimer = 0;
    this.heading = Math.random() * Math.PI * 2;
    this.dist = 0;
    this.tag = null; // identifiant d'objectif de mission
    this.persistent = false; // les ennemis de mission ne disparaissent pas
    this.lostT = 0;
    this.buildMesh();
  }

  buildMesh() {
    const role = this.civilian ? 'civilian' : this.kind;
    this.h = makeHuman(role, { seed: this.civilian ? 1 + ((Math.random() * 12) | 0) : 1 + ((Math.random() * 6) | 0) });
    this.body = this.h.body;
    this.mesh = this.h.mesh;
    const sm = new THREE.SpriteMaterial({ map: getAlertTexture(), transparent: true, fog: false });
    this.sprite = new THREE.Sprite(sm);
    this.sprite.position.y = 2.3;
    this.sprite.visible = false;
    this.mesh.add(this.sprite);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  alert() {
    if (this.dead || this.state === 'alert' || this.civilian) return;
    this.state = 'alert';
    this.lostT = 0;
    this.shootTimer = 0.9 + Math.random() * 0.9;
    this.sprite.visible = true;
  }

  scare() {
    if (this.dead || !this.civilian) return;
    this.state = 'flee';
    this.lostT = 0;
  }

  die() {
    this.dead = true;
    this.deathT = 0;
    this.sprite.visible = false;
  }

  hitTest(ray, maxDist) {
    if (this.dead) return null;
    const p = this.pos;
    let best = null;
    _sph.center.set(p.x, p.y + 1.66, p.z);
    _sph.radius = 0.19;
    let headD = Infinity;
    if (ray.intersectSphere(_sph, _hit)) {
      const d = _hit.distanceTo(ray.origin);
      if (d <= maxDist) headD = d;
    }
    _box.min.set(p.x - 0.3, p.y, p.z - 0.25);
    _box.max.set(p.x + 0.3, p.y + 1.5, p.z + 0.25);
    let bodyD = Infinity;
    if (ray.intersectBox(_box, _hit)) {
      const d = _hit.distanceTo(ray.origin);
      if (d <= maxDist) bodyD = d;
    }
    if (headD < Infinity && headD <= bodyD + 0.4) best = { dist: headD, head: true };
    else if (bodyD < Infinity) best = { dist: bodyD, head: false };
    return best;
  }

  walkTo(tx, tz, dt, speed) {
    const p = this.pos;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const hd = Math.atan2(dx, dz);
    this.heading = lerpAngle(this.heading, hd, Math.min(1, dt * 6));
    const step = speed * dt;
    const a = { x: p.x, z: p.z };
    const blocked = moveActor(a, (dx / d) * step, (dz / d) * step, 0.35, 1.7, { maxSlope: 0.8 });
    p.x = a.x;
    p.z = a.z;
    this.phase += dt * speed * 3.6;
    this._mv = true;
    this._run = speed > 3;
    return blocked;
  }

  update(dt) {
    const p = this.pos;
    const pl = this.env.player;
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.55);
      this.h.pose(0, 0);
      this.body.rotation.x = -k * (Math.PI / 2);
      this.body.position.y = k * 0.2;
      if (this.deathT > 14 && !this.persistent) this.remove = true;
      return;
    }
    const dxp = pl.x - p.x, dzp = pl.z - p.z;
    this.dist = Math.hypot(dxp, dzp);
    let swing = 0;
    this._mv = false;

    if (this.civilian) {
      if (this.state === 'flee') {
        // fuir à l'opposé du joueur
        const d = this.dist || 1;
        this.walkTo(p.x - (dxp / d) * 10, p.z - (dzp / d) * 10, dt, 4.2);
        swing = Math.sin(this.phase) * 0.9;
        this.lostT += dt;
        if (this.lostT > 9 || this.dist > 80) this.state = 'patrol';
      } else this.wander(dt);
      if (this.state === 'patrol') swing = this._swing || 0;
    } else if (this.state === 'patrol') {
      this.wander(dt);
      swing = this._swing || 0;
      // détection : proche + ligne de vue, ou bruit des tirs
      if (!pl.dead) {
        const sight = this.env.sightRange();
        if (this.dist < sight && this.env.canSee(this)) this.alert();
        else if (this.dist < 28 && this.env.isNoisy()) this.alert();
      }
    } else if (this.state === 'alert') {
      if (pl.dead) {
        this.state = 'patrol';
        this.sprite.visible = false;
      } else {
        const sees = this.dist < 150 && this.env.canSee(this);
        this.heading = lerpAngle(this.heading, Math.atan2(dxp, dzp), Math.min(1, dt * 6));
        if (sees) {
          this.lostT = 0;
          // se rapproche jusqu'à ~16 m puis tire
          if (this.dist > 18) {
            this.walkTo(pl.x, pl.z, dt, 3.6);
            swing = Math.sin(this.phase) * 0.8;
          }
          this.shootTimer -= dt;
          if (this.shootTimer <= 0) {
            this.env.shoot(this);
            this.shootTimer = 0.9 + Math.random() * 1.1;
          }
        } else {
          this.lostT += dt;
          this.walkTo(pl.x, pl.z, dt, 3.8);
          swing = Math.sin(this.phase) * 0.8;
          if (this.lostT > 14 || this.dist > 160) {
            this.state = 'patrol';
            this.sprite.visible = false;
          }
        }
        this.sprite.scale.setScalar(0.8 + Math.min(this.dist, 150) * 0.012);
      }
    }

    this.h.pose(this.phase * 1.0, this._mv ? (this._run ? 1.15 : 0.75) : 0);
    void swing;
    p.y = groundAt(p.x, p.z);
    this.mesh.position.copy(p);
    this.mesh.rotation.y = this.heading;
  }

  wander(dt) {
    const p = this.pos;
    this._swing = 0;
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    if (!this.target) {
      const a = Math.random() * 6.28, r = 2 + Math.random() * (this.civilian ? 18 : 10);
      this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
    }
    const d = Math.hypot(this.target.x - p.x, this.target.z - p.z);
    if (d < 0.5) {
      this.target = null;
      this.wait = 1 + Math.random() * 4;
      return;
    }
    const blocked = this.walkTo(this.target.x, this.target.z, dt, this.speed);
    if (blocked) { this.target = null; this.wait = 0.5; }
    this._swing = Math.sin(this.phase) * 0.6;
  }
}
