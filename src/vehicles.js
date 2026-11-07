import * as THREE from 'three';
import { groundAt, isLoadedAt, pushOut, pushTrees, WATER_WALK_LIMIT } from './world.js';


import { buildCar, wheelGeometry, CAR_TYPES } from './carmodels.js';

const TYPES = CAR_TYPES;
export const vehicleName = (t) => TYPES[t % TYPES.length].name;

const PAINTS = [
  [0xb03a2e, 0x2e6db0, 0xe8e8e0, 0x2a2d33, 0x6b7a8f, 0x2e7d4f, 0xc9a227, 0x8a8f96],
  [0x2e6db0, 0xd9d9d2, 0xb03a2e, 0xe1b12c, 0x4a5a6a, 0x7a3b8a, 0x2a2d33, 0xd35d2a],
  [0xe8e8e0, 0xd9d9d2, 0x2e6db0, 0xb03a2e, 0x5a6b7a],
  [0x56623a],
  [0xd9a21b, 0xe8e8e0, 0xb03a2e, 0x2e6db0],
];
const geoCache = new Map();
let wheelGeos = null;
const detailMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xe8eeff });
const glassMat = new THREE.MeshPhongMaterial({ vertexColors: true, color: 0xffffff, transparent: true, opacity: 0.5, shininess: 90, specular: 0x8899aa, depthWrite: false });

function templateFor(type) {
  let t = geoCache.get(type);
  if (!t) {
    const c = buildCar(type);
    t = { paint: c.paint.toGeometry(), detail: c.detail.toGeometry(), glass: c.glass.toGeometry(), lamps: c.lamps.toGeometry(), tails: c.tails.toGeometry(), wheels: c.wheels };
    geoCache.set(type, t);
  }
  return t;
}

function build(type, colorHex) {
  const t = templateFor(type);
  if (!wheelGeos) wheelGeos = [wheelGeometry(1).toGeometry(), wheelGeometry(-1).toGeometry()];
  const g = new THREE.Group();
  const paintMat = new THREE.MeshPhongMaterial({ vertexColors: true, color: colorHex, shininess: 70, specular: 0x444444 });
  const tailMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x6a0d0d });
  g.add(new THREE.Mesh(t.paint, paintMat));
  g.add(new THREE.Mesh(t.detail, detailMat));
  g.add(new THREE.Mesh(t.lamps, lampMat));
  g.add(new THREE.Mesh(t.tails, tailMat));
  const gl = new THREE.Mesh(t.glass, glassMat);
  gl.renderOrder = 2;
  g.add(gl);
  const wheels = [];
  for (const w of t.wheels) {
    const steer = new THREE.Group();
    steer.position.set(w.x, w.y, w.z);
    const spin = new THREE.Group();
    spin.scale.setScalar(w.k || w.r / 0.345);
    spin.add(new THREE.Mesh(wheelGeos[w.x > 0 ? 0 : 1], detailMat));
    steer.add(spin);
    g.add(steer);
    wheels.push({ steer, spin, front: !!w.front, r: w.r });
  }
  return { group: g, wheels, tailMat };
}

const _p = { x: 0, z: 0 };

export class Vehicle {
  constructor(spec) {
    const [x, z, h, type] = spec;
    this.type = type % TYPES.length;
    this.cfg = TYPES[this.type];
    this.x = x;
    this.z = z;
    this.heading = h;
    this.y = 0;
    this.pitch = 0;
    this.speed = 0;
    this.occupied = false;
    this.hp = 100;
    this.hitSpeed = 0; // dernière vitesse d'impact (lue par le jeu)
    const hsh = Math.abs(Math.floor(x * 7.31 + z * 3.17)) % 997;
    const pal = PAINTS[this.type % PAINTS.length];
    const b = build(this.type, pal[hsh % pal.length]);
    this.mesh = b.group;
    this.wheels = b.wheels;
    this.tailMat = b.tailMat;
    this.spinA = 0;
    this.steerVis = 0;
    this.mesh.rotation.order = 'YXZ';
    this.sync();
  }

  get r() { return Math.min(this.cfg.W / 2 + 0.1, 1.05); }

  sync() {
    const loaded = isLoadedAt(this.x, this.z);
    this.mesh.visible = loaded;
    if (loaded) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading), a = this.cfg.L / 2 - 0.3;
      const gf = groundAt(this.x + fx * a, this.z + fz * a);
      const gb = groundAt(this.x - fx * a, this.z - fz * a);
      this.y += ((gf + gb) / 2 - this.y) * 0.5;
      this.pitch = -Math.atan2(gf - gb, a * 2);
    }
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.set(this.pitch, this.heading, 0);
  }

  // input : { throttle: -1..1, steer: -1..1 } ou null (stationnement)
  update(dt, input) {
    const c = this.cfg;
    const throttle = input ? input.throttle : 0;
    const steer = input ? input.steer : 0;
    if (throttle > 0.05) this.speed += (this.speed < 0 ? c.acc * 2.2 : c.acc) * throttle * dt;
    else if (throttle < -0.05) this.speed += (this.speed > 0 ? -c.acc * 2.4 : -c.acc * 0.6) * -throttle * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (this.occupied ? 3.5 : 9) * dt);
    this.speed = Math.max(-c.vmax * 0.35, Math.min(c.vmax, this.speed));

    const k = Math.min(1, Math.abs(this.speed) / 5) * Math.sign(this.speed);
    this.steerVis += ((-steer * 0.45) - this.steerVis) * Math.min(1, dt * 10);
    this.tailMat.color.setHex(throttle < -0.05 && this.speed > 0.5 ? 0xff2a2a : 0x6a0d0d);
    this.heading += (-steer) * 1.55 * k * (1 / (1 + Math.abs(this.speed) / 22)) * dt;

    this.hitSpeed = 0;
    const step = this.speed * dt;
    this.spinA -= step;
    for (const w of this.wheels) { w.spin.rotation.x = this.spinA / w.r; if (w.front) w.steer.rotation.y = this.steerVis; }
    if (Math.abs(step) < 1e-6) { this.sync(); return; }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const nx = this.x + fx * step, nz = this.z + fz * step;
    const gOld = groundAt(this.x, this.z);
    const ahead = groundAt(nx + fx * c.L / 2 * Math.sign(step), nz + fz * c.L / 2 * Math.sign(step));
    let blocked = false;
    if (ahead < WATER_WALK_LIMIT || (ahead - gOld) / Math.abs(step) > 0.75 && ahead - gOld > 0.5) blocked = true;
    if (!blocked) {
      this.x = nx;
      this.z = nz;
      // deux cercles de collision (avant / arrière)
      const a = c.L / 2 - this.r;
      let pushed = false;
      for (const s of c.L > 5 ? [1, 0, -1] : [1, -1]) {
        _p.x = this.x + fx * a * s;
        _p.z = this.z + fz * a * s;
        const ox = _p.x, oz = _p.z;
        const hit = pushOut(_p, this.r, this.y, this.y + 1.6) | pushTrees(_p, this.r);
        if (hit) { this.x += _p.x - ox; this.z += _p.z - oz; pushed = true; }
      }
      if (pushed) blocked = true;
    }
    if (blocked) {
      this.hitSpeed = Math.abs(this.speed);
      this.speed *= -0.25;
    }
    this.sync();
  }
}
