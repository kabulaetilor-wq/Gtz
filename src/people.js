import * as THREE from 'three';
import { buildHumanGeometry, posePerson } from './models.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const shadowGeo = new THREE.CircleGeometry(0.55, 14);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
const cache = new Map();

function template(role, opts) {
  const key = `${role}:${opts.gun || ''}:${opts.seed || 0}`;
  let t = cache.get(key);
  if (!t) {
    const h = buildHumanGeometry(role, opts);
    t = {
      body: h.body.toGeometry(),
      legs: h.legs.map((l) => ({ x: l.x, hipY: l.hipY, kneeY: l.kneeY, thigh: l.thigh.toGeometry(), shin: l.shin.toGeometry() })),
      arms: h.arms.map((a) => ({ x: a.x, up: a.up.toGeometry(), low: a.low.toGeometry() })),
      muzzle: h.gun ? h.gun.muzzle : 0,
    };
    cache.set(key, t);
  }
  return t;
}

// role : 'soldier' | 'officer' | 'civilian' | 'player'   opts : { seed, gun }
// Retourne { mesh, body, pose(phase, amp), muzzle } ; mesh est orienté avec l'avant sur +z.
export function makeHuman(role, opts = {}) {
  const t = template(role, opts);
  const mesh = new THREE.Group();
  const body = new THREE.Group();
  mesh.add(body);
  const bodyMesh = new THREE.Mesh(t.body, MAT);
  body.add(bodyMesh);
  const parts = { legs: [], arms: [], body };
  for (const l of t.legs) {
    const hip = new THREE.Group();
    hip.position.set(l.x, l.hipY, 0);
    hip.add(new THREE.Mesh(l.thigh, MAT));
    const knee = new THREE.Group();
    knee.position.set(0, -(l.hipY - l.kneeY), 0);
    knee.add(new THREE.Mesh(l.shin, MAT));
    hip.add(knee);
    body.add(hip);
    parts.legs.push({ hip, knee });
  }
  for (const a of t.arms) {
    const sh = new THREE.Group();
    sh.position.set(a.x, 1.42, 0);
    sh.add(new THREE.Mesh(a.up, MAT));
    const el = new THREE.Group();
    el.position.set(0, -0.28, 0);
    el.add(new THREE.Mesh(a.low, MAT));
    sh.add(el);
    body.add(sh);
    parts.arms.push({ sh, el });
  }
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  mesh.add(shadow);
  if (opts.seed) mesh.scale.setScalar(0.94 + ((opts.seed * 37) % 13) / 100);
  return { mesh, body, parts, muzzle: t.muzzle, pose: (phase, amp) => posePerson(parts, phase, amp) };
}
