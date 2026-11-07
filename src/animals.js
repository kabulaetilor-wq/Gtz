// Animaux : modèles low-poly fusionnés (1 draw call chacun) + comportements simples.
// spec = [type, x, z, seed]
import * as THREE from 'three';
import { Geo, rgb, shade, box, prism, pyramid } from './meshbuilder.js';

export const A = {
  COW: 0, SHEEP: 1, HORSE: 2, DEER: 3, RABBIT: 4, FOX: 5, DOG: 6, BOAR: 7, DUCK: 8, SWAN: 9, FISH: 10,
  CROW: 11, EAGLE: 12, GOAT: 13, CHICKEN: 14, PIG: 15, CAT: 16,
};

const WHITE = rgb(0xf0eee6), BLACK = rgb(0x1c1c1e), HORN = rgb(0xd8d0b8), ORANGE = rgb(0xe08a2a), RED = rgb(0xc42a2a);

// Quadrupède générique. Axe avant = +z.
function quad4(g, o) {
  const { L, Wd, Hb, leg, legW = 0.1, col, hd, neck = 0, tail = [0.08, 0.08, 0.3], tcol } = o;
  const legCol = o.legCol || shade(col, 0.72);
  const hcol = o.hcol || col;
  const y0 = leg;
  box(g, -Wd / 2, y0, -L / 2, Wd / 2, y0 + Hb, L / 2, col, shade(col, 1.08));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (Wd / 2 - legW / 2 - 0.02), z = sz * (L / 2 - legW - 0.04);
    box(g, x - legW / 2, 0, z - legW / 2, x + legW / 2, y0 + 0.05, z + legW / 2, legCol);
  }
  const [hw, hh, hl] = hd;
  if (neck > 0) {
    const nw = hw * 0.62;
    box(g, -nw / 2, y0 + Hb * 0.35, L / 2 - 0.22, nw / 2, y0 + Hb + neck, L / 2 + 0.06, hcol);
  }
  const topY = y0 + Hb + neck + hh * 0.35 - (neck > 0 ? 0 : Hb * 0.25);
  const hz0 = L / 2 - 0.04;
  box(g, -hw / 2, topY - hh, hz0, hw / 2, topY, hz0 + hl, hcol);
  box(g, -hw * 0.3, topY - hh * 0.75, hz0 + hl, hw * 0.3, topY - hh * 0.2, hz0 + hl + 0.04, o.snout || shade(hcol, 0.6));
  box(g, -hw / 2 + 0.01, topY - hh * 0.35, hz0 + hl * 0.55, -hw / 2 - 0.01, topY - hh * 0.15, hz0 + hl * 0.75, BLACK);
  box(g, hw / 2 - 0.01, topY - hh * 0.35, hz0 + hl * 0.55, hw / 2 + 0.01, topY - hh * 0.15, hz0 + hl * 0.75, BLACK);
  const [tw, th, tl] = tail;
  const tc = tcol || shade(col, 0.8);
  box(g, -tw / 2, y0 + Hb * (o.tailUp ? 0.7 : 0.45), -L / 2 - tl, tw / 2, y0 + Hb * (o.tailUp ? 0.7 : 0.45) + th + (o.tailUp ? tl * 0.9 : 0), -L / 2 + 0.05, tc);
  return { topY, hz0, hw, hl };
}

function ears(g, h, w, hgt, col, spread = 0.5) {
  for (const s of [-1, 1]) box(g, s * h.hw * spread - w / 2, h.topY, h.hz0 + 0.05, s * h.hw * spread + w / 2, h.topY + hgt, h.hz0 + 0.05 + w, col);
}

function wings(g, span, chord, col, y = 0, flap = 0.12) {
  // deux ailes plates légèrement en V, visibles des deux côtés
  for (const s of [-1, 1]) {
    const a = [0, y, -chord * 0.4], b = [s * span, y + flap * span, -chord * 0.1], c = [s * span, y + flap * span, chord * 0.2], d = [0, y, chord * 0.5];
    if (s > 0) { g.quad(a, d, c, b, col); g.quad(a, b, c, d, col); } else { g.quad(a, b, c, d, col); g.quad(a, d, c, b, col); }
  }
}

const BUILD = {
  [A.COW](g, v) {
    const cols = [0x3b2a22, 0xe8e4dc, 0x2a2a2a, 0xb08a60];
    const col = rgb(cols[v % 4]);
    const h = quad4(g, { L: 1.9, Wd: 0.8, Hb: 0.8, leg: 0.62, legW: 0.15, col, hd: [0.32, 0.36, 0.5], neck: 0.12, tail: [0.06, 0.55, 0.12], tcol: BLACK, snout: rgb(0xd4a89a) });
    if (v % 4 === 1) for (const [x, z, s] of [[0.41, 0.3, 0.3], [-0.41, -0.3, 0.35], [0.41, -0.5, 0.25]]) box(g, x - 0.01, 0.9, z - s / 2, x + 0.01, 1.2, z + s / 2, BLACK);
    for (const s of [-1, 1]) box(g, s * 0.2 - 0.03, h.topY, h.hz0 + 0.05, s * 0.2 + 0.03, h.topY + 0.16, h.hz0 + 0.1, HORN);
  },
  [A.SHEEP](g, v) {
    const col = rgb([0xf0ede4, 0xd8d2c0, 0x4a4440][v % 3]);
    quad4(g, { L: 1.0, Wd: 0.62, Hb: 0.56, leg: 0.38, legW: 0.09, col, legCol: rgb(0x3a3430), hd: [0.2, 0.24, 0.3], hcol: rgb(0x3a3430), tail: [0.1, 0.1, 0.1] });
  },
  [A.HORSE](g, v) {
    const cols = [0x6b4426, 0x2a1e18, 0xc9a76a, 0x8a8a88];
    const col = rgb(cols[v % 4]);
    const h = quad4(g, { L: 2.0, Wd: 0.62, Hb: 0.85, leg: 0.95, legW: 0.12, col, hd: [0.24, 0.3, 0.6], neck: 0.6, tail: [0.1, 0.7, 0.18], tcol: v % 4 === 3 ? WHITE : BLACK });
    box(g, -0.04, h.topY - 1.0, h.hz0 - 0.3, 0.04, h.topY, h.hz0 - 0.1, v % 4 === 3 ? WHITE : BLACK);
    ears(g, h, 0.06, 0.14, col, 0.35);
  },
  [A.DEER](g, v) {
    const col = rgb(v % 2 ? 0x8a5a30 : 0x9a6a3a);
    const h = quad4(g, { L: 1.25, Wd: 0.42, Hb: 0.55, leg: 0.82, legW: 0.07, col, hd: [0.15, 0.18, 0.32], neck: 0.5, tail: [0.1, 0.12, 0.1], tcol: WHITE });
    ears(g, h, 0.05, 0.14, col, 0.6);
    if (v % 2 === 0) for (const s of [-1, 1]) {
      box(g, s * 0.07 - 0.015, h.topY, h.hz0 + 0.05, s * 0.07 + 0.015, h.topY + 0.4, h.hz0 + 0.08, HORN);
      box(g, s * 0.07 - 0.015, h.topY + 0.25, h.hz0 + 0.05, s * 0.2 + 0.015, h.topY + 0.28, h.hz0 + 0.08, HORN);
    }
  },
  [A.RABBIT](g, v) {
    const col = rgb([0x9a8a78, 0x6e6a64, 0xd8d2c8][v % 3]);
    const h = quad4(g, { L: 0.38, Wd: 0.2, Hb: 0.2, leg: 0.07, legW: 0.05, col, hd: [0.12, 0.12, 0.14], tail: [0.07, 0.07, 0.07], tcol: WHITE });
    for (const s of [-1, 1]) box(g, s * 0.035 - 0.015, h.topY, h.hz0 + 0.02, s * 0.035 + 0.015, h.topY + 0.17, h.hz0 + 0.05, col);
  },
  [A.FOX](g) {
    const col = rgb(0xc8642a);
    const h = quad4(g, { L: 0.8, Wd: 0.24, Hb: 0.24, leg: 0.28, legW: 0.06, col, legCol: rgb(0x2a2220), hd: [0.14, 0.14, 0.24], tail: [0.14, 0.14, 0.45], tcol: col, snout: BLACK });
    box(g, -0.07, 0.4, -0.85, 0.07, 0.54, -0.72, WHITE);
    ears(g, h, 0.05, 0.1, col, 0.5);
  },
  [A.DOG](g, v) {
    const col = rgb([0x6a4a2a, 0x1f1f22, 0xc8b48a][v % 3]);
    const h = quad4(g, { L: 0.8, Wd: 0.26, Hb: 0.3, leg: 0.34, legW: 0.07, col, hd: [0.16, 0.18, 0.26], tail: [0.06, 0.06, 0.3], tailUp: true });
    ears(g, h, 0.06, 0.1, shade(col, 0.7), 0.5);
  },
  [A.BOAR](g, v) {
    const col = rgb(v % 2 ? 0x4a3e34 : 0x3a3028);
    const h = quad4(g, { L: 1.25, Wd: 0.52, Hb: 0.56, leg: 0.32, legW: 0.1, col, hd: [0.28, 0.3, 0.5], tail: [0.04, 0.04, 0.2], snout: rgb(0x2a2220) });
    ears(g, h, 0.07, 0.12, col, 0.45);
    for (const s of [-1, 1]) box(g, s * 0.1 - 0.015, h.topY - 0.26, h.hz0 + h.hl - 0.1, s * 0.1 + 0.015, h.topY - 0.15, h.hz0 + h.hl + 0.1, HORN);
  },
  [A.DUCK](g, v) {
    const col = rgb([0x8a6a3a, 0x6a5a4a, 0x7a7a72][v % 3]);
    box(g, -0.12, 0, -0.26, 0.12, 0.2, 0.22, col, shade(col, 1.1));
    box(g, -0.05, 0.2, 0.12, 0.05, 0.34, 0.2, col);
    box(g, -0.075, 0.3, 0.14, 0.075, 0.42, 0.3, v % 3 === 0 ? rgb(0x2a6a4a) : col);
    box(g, -0.05, 0.32, 0.3, 0.05, 0.36, 0.4, ORANGE);
    box(g, -0.07, 0.04, -0.34, 0.07, 0.12, -0.24, col);
  },
  [A.SWAN](g) {
    box(g, -0.18, 0, -0.45, 0.18, 0.3, 0.4, WHITE, WHITE);
    box(g, -0.07, 0, -0.55, 0.07, 0.2, -0.43, WHITE);
    box(g, -0.05, 0.3, 0.3, 0.05, 0.85, 0.4, WHITE);
    box(g, -0.05, 0.8, 0.3, 0.05, 0.9, 0.55, WHITE);
    box(g, -0.03, 0.78, 0.55, 0.03, 0.84, 0.66, ORANGE);
  },
  [A.FISH](g, v) {
    const col = rgb([0xd8742a, 0x7a8a92, 0xe8c24a][v % 3]);
    box(g, -0.05, 0, -0.18, 0.05, 0.14, 0.18, col);
    prism(g, [[0.09, 0], [0, 0.12], [-0.09, 0]], -0.32, -0.16, 'z', 0, col, col);
  },
  [A.CROW](g) {
    box(g, -0.05, 0, -0.14, 0.05, 0.08, 0.14, BLACK);
    box(g, -0.03, 0.02, 0.14, 0.03, 0.08, 0.2, BLACK);
    wings(g, 0.42, 0.22, BLACK, 0.06, 0.1);
  },
  [A.EAGLE](g) {
    const br = rgb(0x5a4030);
    box(g, -0.09, 0, -0.28, 0.09, 0.14, 0.26, br);
    box(g, -0.05, 0.02, 0.26, 0.05, 0.14, 0.38, WHITE);
    box(g, -0.07, 0.01, -0.5, 0.07, 0.06, -0.28, rgb(0x3a2a20));
    wings(g, 1.1, 0.42, br, 0.1, 0.08);
  },
  [A.GOAT](g, v) {
    const col = rgb([0xe8e4d8, 0x6a5a4a, 0xb0a48c][v % 3]);
    const h = quad4(g, { L: 0.95, Wd: 0.4, Hb: 0.46, leg: 0.5, legW: 0.07, col, hd: [0.15, 0.2, 0.3], neck: 0.1, tail: [0.05, 0.12, 0.08], tailUp: true });
    for (const s of [-1, 1]) box(g, s * 0.05 - 0.015, h.topY, h.hz0 + 0.04, s * 0.05 + 0.015, h.topY + 0.22, h.hz0 + 0.08, HORN);
    box(g, -0.02, h.topY - 0.28, h.hz0 + h.hl - 0.04, 0.02, h.topY - 0.12, h.hz0 + h.hl, WHITE);
  },
  [A.CHICKEN](g, v) {
    const col = rgb([0xb0622a, 0xf0ece0, 0x3a3028][v % 3]);
    box(g, -0.09, 0.14, -0.14, 0.09, 0.32, 0.14, col, shade(col, 1.1));
    box(g, -0.025, 0.32, 0.1, 0.025, 0.42, 0.16, col);
    box(g, -0.045, 0.4, 0.1, 0.045, 0.48, 0.2, col);
    box(g, -0.01, 0.48, 0.11, 0.01, 0.53, 0.18, RED);
    box(g, -0.015, 0.42, 0.2, 0.015, 0.45, 0.25, ORANGE);
    box(g, -0.03, 0.2, -0.22, 0.03, 0.42, -0.12, shade(col, 0.6));
    for (const s of [-1, 1]) box(g, s * 0.04 - 0.01, 0, -0.02, s * 0.04 + 0.01, 0.15, 0.02, ORANGE);
  },
  [A.PIG](g, v) {
    const col = rgb(v % 2 ? 0xd49088 : 0xe8a8a0);
    quad4(g, { L: 0.95, Wd: 0.52, Hb: 0.5, leg: 0.2, legW: 0.1, col, hd: [0.26, 0.26, 0.3], tail: [0.03, 0.08, 0.05], snout: rgb(0xc47a72) });
  },
  [A.CAT](g, v) {
    const col = rgb([0x3a3a3a, 0xc8864a, 0xd8d4cc][v % 3]);
    const h = quad4(g, { L: 0.45, Wd: 0.15, Hb: 0.17, leg: 0.16, legW: 0.04, col, hd: [0.11, 0.11, 0.13], tail: [0.035, 0.035, 0.3], tailUp: true });
    for (const s of [-1, 1]) box(g, s * 0.035 - 0.015, h.topY, h.hz0 + 0.02, s * 0.035 + 0.015, h.topY + 0.06, h.hz0 + 0.05, col);
  },
};

// Comportement par type : vitesse de marche, rayon de balade, milieu
const CFG = {
  [A.COW]: { sp: 0.5, roam: 10, flee: 3.5 }, [A.SHEEP]: { sp: 0.5, roam: 9, flee: 4 }, [A.HORSE]: { sp: 0.9, roam: 14, flee: 7 },
  [A.DEER]: { sp: 0.9, roam: 18, flee: 9 }, [A.RABBIT]: { sp: 1.0, roam: 8, flee: 6 }, [A.FOX]: { sp: 1.1, roam: 20, flee: 8 },
  [A.DOG]: { sp: 1.2, roam: 14, flee: 6 }, [A.BOAR]: { sp: 0.9, roam: 14, flee: 7 }, [A.DUCK]: { sp: 0.5, roam: 8, water: true, flee: 3 },
  [A.SWAN]: { sp: 0.4, roam: 8, water: true, flee: 2.5 }, [A.FISH]: { sp: 0.7, roam: 5, water: true, fish: true, flee: 3 },
  [A.CROW]: { fly: true, alt: 14, rad: 18, sp: 7 }, [A.EAGLE]: { fly: true, alt: 55, rad: 70, sp: 11 },
  [A.GOAT]: { sp: 0.6, roam: 9, flee: 6 }, [A.CHICKEN]: { sp: 0.5, roam: 5, flee: 3 }, [A.PIG]: { sp: 0.45, roam: 6, flee: 3 },
  [A.CAT]: { sp: 0.8, roam: 9, flee: 5 },
};

const TAU = Math.PI * 2;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}

export class Animals {
  constructor(scene, groundFn) {
    this.scene = scene;
    this.ground = groundFn;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.geos = new Map();
    this.byChunk = new Map();
    this.t = 0;
  }

  geo(type, v) {
    const key = type * 8 + v;
    let g = this.geos.get(key);
    if (!g) {
      const b = new Geo(false);
      (BUILD[type] || BUILD[A.DOG])(b, v);
      g = b.toGeometry();
      this.geos.set(key, g);
    }
    return g;
  }

  addChunk(key, specs) {
    const list = [];
    for (const [type, x, z, seed] of specs) {
      const cfg = CFG[type];
      if (!cfg) continue;
      const mesh = new THREE.Mesh(this.geo(type, seed % 4), this.mat);
      const a = {
        mesh, type, cfg, hx: x, hz: z, x, z, y: 0, heading: (seed % 628) / 100, tx: x, tz: z, wait: (seed % 50) / 10,
        speed: cfg.sp * (0.8 + (seed % 7) / 17), state: 'idle', fleeT: 0, phase: (seed % 100) / 10,
        ang: (seed % 628) / 100, rad: cfg.rad ? cfg.rad * (0.7 + (seed % 10) / 20) : 0, seed,
      };
      if (cfg.fly) a.y = this.ground(x, z) + cfg.alt + (seed % 9);
      else if (cfg.water) a.y = cfg.fish ? -0.45 - (seed % 5) * 0.12 : 0;
      else a.y = this.ground(x, z);
      mesh.position.set(x, a.y, z);
      mesh.rotation.y = a.heading;
      mesh.visible = false;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      list.push(a);
    }
    this.byChunk.set(key, list);
  }

  removeChunk(key) {
    const list = this.byChunk.get(key);
    if (!list) return;
    for (const a of list) this.scene.remove(a.mesh);
    this.byChunk.delete(key);
  }

  count() {
    let n = 0;
    for (const l of this.byChunk.values()) n += l.length;
    return n;
  }

  scare(x, z, r) {
    const r2 = r * r;
    for (const list of this.byChunk.values()) {
      for (const a of list) {
        if (a.cfg.fly) continue;
        const dx = a.x - x, dz = a.z - z, d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) || 1;
        a.state = 'flee';
        a.fleeT = 3 + (a.seed % 30) / 10;
        a.tx = a.x + (dx / d) * 40;
        a.tz = a.z + (dz / d) * 40;
        a.wait = 0;
      }
    }
  }

  okSpot(a, x, z) {
    const h = this.ground(x, z);
    return a.cfg.water ? h < (a.cfg.fish ? -0.9 : -0.7) : h > 0.8;
  }

  update(dt, eye) {
    this.t += dt;
    const t = this.t;
    for (const list of this.byChunk.values()) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const m = a.mesh;
        const ex = a.x - eye.x, ez = a.z - eye.z;
        const far = ex * ex + ez * ez > 520 * 520;
        if (far) { m.visible = false; continue; }
        m.visible = true;
        const cfg = a.cfg;
        if (cfg.fly) {
          a.ang += (cfg.sp / a.rad) * dt;
          a.x = a.hx + Math.cos(a.ang) * a.rad;
          a.z = a.hz + Math.sin(a.ang) * a.rad;
          const hy = this.ground(a.hx, a.hz) + cfg.alt + (a.seed % 9) + Math.sin(t * 0.4 + a.seed) * 2.5;
          a.y = hy;
          a.heading = Math.atan2(-Math.sin(a.ang), Math.cos(a.ang));
          m.position.set(a.x, a.y, a.z);
          m.rotation.set(0, a.heading, 0.3 + Math.sin(t * 6 + a.seed) * 0.12, 'YXZ');
          continue;
        }
        let moving = false;
        let sp = a.speed;
        if (a.state === 'flee') {
          a.fleeT -= dt;
          sp = cfg.flee;
          if (a.fleeT <= 0) { a.state = 'idle'; a.wait = 1 + (a.seed % 30) / 10; a.hx = a.x; a.hz = a.z; }
        }
        if (a.state === 'idle') {
          a.wait -= dt;
          if (a.wait <= 0) {
            // choisir une destination dans la zone de vie
            let ok = false;
            for (let k = 0; k < 6 && !ok; k++) {
              const ang = Math.random() * TAU, r = 2 + Math.random() * cfg.roam;
              const tx = a.hx + Math.cos(ang) * r, tz = a.hz + Math.sin(ang) * r;
              if (this.okSpot(a, tx, tz)) { a.tx = tx; a.tz = tz; ok = true; }
            }
            if (ok) a.state = 'walk'; else a.wait = 2 + Math.random() * 3;
          }
        }
        if (a.state === 'walk' || a.state === 'flee') {
          const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
          if (d < 0.5) {
            if (a.state === 'walk') { a.state = 'idle'; a.wait = 2 + Math.random() * 6; } else a.state = 'idle';
          } else {
            a.heading = lerpAngle(a.heading, Math.atan2(dx, dz), Math.min(1, dt * (a.state === 'flee' ? 10 : 4)));
            const nx = a.x + Math.sin(a.heading) * sp * dt, nz = a.z + Math.cos(a.heading) * sp * dt;
            if (this.okSpot(a, nx, nz)) { a.x = nx; a.z = nz; moving = true; }
            else { a.state = 'idle'; a.wait = 1 + Math.random() * 2; a.hx = a.x; a.hz = a.z; }
          }
        }
        if (moving) a.phase += dt * sp * 5;
        let y;
        if (cfg.fish) y = -0.45 - (a.seed % 5) * 0.12 + Math.sin(t * 2 + a.seed) * 0.05;
        else if (cfg.water) y = -0.02 + Math.sin(t * 1.6 + a.seed) * 0.025;
        else y = this.ground(a.x, a.z) + (moving ? Math.abs(Math.sin(a.phase)) * (a.state === 'flee' ? 0.12 : 0.035) : 0);
        a.y = y;
        m.position.set(a.x, y, a.z);
        m.rotation.set(moving ? Math.sin(a.phase) * 0.05 : 0, a.heading, cfg.fish ? Math.sin(t * 9 + a.seed) * 0.12 : 0, 'YXZ');
      }
    }
  }
}
