import * as THREE from 'three';

const _cache = new Map();
const _tc = new THREE.Color();
// hex sRGB -> [r,g,b] linéaire (comme THREE.Color avec la gestion des couleurs activée)
export function rgb(hex) {
  let v = _cache.get(hex);
  if (!v) {
    _tc.setHex(hex);
    v = [_tc.r, _tc.g, _tc.b];
    _cache.set(hex, v);
  }
  return v;
}
export function shade(col, k) {
  return [Math.min(1, col[0] * k), Math.min(1, col[1] * k), Math.min(1, col[2] * k)];
}

// Accumulateur de triangles. Une transformation (rotation Y + translation) peut être appliquée à la volée.
export class Geo {
  constructor(textured = false) {
    this.textured = textured;
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.m = null;
  }

  get empty() { return this.pos.length === 0; }
  get triCount() { return this.pos.length / 9; }

  setXform(c, s, tx, ty, tz, k = 1) { this.m = { c, s, tx, ty, tz, k }; }
  clearXform() { this.m = null; }

  // nn (optionnel) : trois normales par sommet [[x,y,z]*3] pour un ombrage lisse
  tri(a, b, c, col, uv, nn) {
    let nx = 0, ny = 0, nz = 0;
    if (!nn) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return; // triangle dégénéré
      nx /= l; ny /= l; nz /= l;
    }
    const m = this.m;
    for (let i = 0; i < 3; i++) {
      const p = i === 0 ? a : i === 1 ? b : c;
      let qx = nx, qy = ny, qz = nz;
      if (nn) { qx = nn[i][0]; qy = nn[i][1]; qz = nn[i][2]; }
      if (m) {
        const rx = m.c * qx - m.s * qz, rz = m.s * qx + m.c * qz;
        qx = rx; qz = rz;
        this.pos.push(m.k * (m.c * p[0] - m.s * p[2]) + m.tx, m.k * p[1] + m.ty, m.k * (m.s * p[0] + m.c * p[2]) + m.tz);
      } else this.pos.push(p[0], p[1], p[2]);
      this.nor.push(qx, qy, qz);
      this.col.push(col[0], col[1], col[2]);
      if (this.textured) {
        if (uv) this.uv.push(uv[i * 2], uv[i * 2 + 1]);
        else this.uv.push(0, 0);
      }
    }
  }

  // a,b,c,d en sens trigonométrique vu de l'extérieur ; uv = [repetitionsU, repetitionsV]
  quad(a, b, c, d, col, uv) {
    if (uv && this.textured) {
      const u = uv[0], v = uv[1];
      this.tri(a, b, c, col, [0, 0, u, 0, u, v]);
      this.tri(a, c, d, col, [0, 0, u, v, 0, v]);
    } else {
      this.tri(a, b, c, col);
      this.tri(a, c, d, col);
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.textured) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* ---------------- Primitives ---------------- */

// Boîte pleine à couleur unie (dessus éventuellement d'une autre couleur)
export function box(g, x0, y0, z0, x1, y1, z1, col, topCol, noBottom = true) {
  g.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col);
  g.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col);
  g.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col);
  g.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);
  g.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], topCol || col);
  if (!noBottom) g.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);
}

// Murs texturés (4 faces, sans dessus), répétition de la texture : tuile de 3 m x 3,2 m
export function wallBox(g, x0, y0, z0, x1, y1, z1, col) {
  const rows = Math.max(1, Math.round((y1 - y0) / 3.2));
  const ux = Math.max(1, Math.round((x1 - x0) / 3));
  const uz = Math.max(1, Math.round((z1 - z0) / 3));
  g.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, [ux, rows]);
  g.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, [ux, rows]);
  g.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, [uz, rows]);
  g.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, [uz, rows]);
}

// Extrusion d'un profil de toit. pts = [[u, y], ...] avec u DÉCROISSANT, la base se referme implicitement.
// axis 'x' : extrusion le long de x, u = z ; axis 'z' : extrusion le long de z, u = x.
export function prism(g, pts, a0, a1, axis, y0, col, endCol) {
  const P = (a, i) => (axis === 'x' ? [a, y0 + pts[i][1], pts[i][0]] : [pts[i][0], y0 + pts[i][1], a]);
  for (let i = 0; i < pts.length - 1; i++) {
    if (axis === 'x') g.quad(P(a0, i), P(a1, i), P(a1, i + 1), P(a0, i + 1), col);
    else g.quad(P(a1, i), P(a0, i), P(a0, i + 1), P(a1, i + 1), col);
  }
  const ec = endCol || col;
  for (let k = 1; k < pts.length - 1; k++) {
    if (axis === 'x') {
      g.tri(P(a1, 0), P(a1, k + 1), P(a1, k), ec);
      g.tri(P(a0, 0), P(a0, k), P(a0, k + 1), ec);
    } else {
      g.tri(P(a1, 0), P(a1, k), P(a1, k + 1), ec);
      g.tri(P(a0, 0), P(a0, k + 1), P(a0, k), ec);
    }
  }
}

// Toit en croupe (4 pans)
export function hip(g, x0, y, z0, x1, z1, rise, col, over = 0.4) {
  x0 -= over; x1 += over; z0 -= over; z1 += over;
  const w = x1 - x0, d = z1 - z0;
  const ym = y + rise;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (w >= d) {
    const ax = x0 + d / 2, bx = x1 - d / 2;
    g.quad([x0, y, z1], [x1, y, z1], [bx, ym, cz], [ax, ym, cz], col);
    g.quad([x1, y, z0], [x0, y, z0], [ax, ym, cz], [bx, ym, cz], col);
    g.tri([x1, y, z1], [x1, y, z0], [bx, ym, cz], col);
    g.tri([x0, y, z0], [x0, y, z1], [ax, ym, cz], col);
  } else {
    const az = z0 + w / 2, bz = z1 - w / 2;
    g.quad([x1, y, z1], [x1, y, z0], [cx, ym, az], [cx, ym, bz], col);
    g.quad([x0, y, z0], [x0, y, z1], [cx, ym, bz], [cx, ym, az], col);
    g.tri([x0, y, z1], [x1, y, z1], [cx, ym, bz], col);
    g.tri([x1, y, z0], [x0, y, z0], [cx, ym, az], col);
  }
}

export function pyramid(g, cx, y, cz, w, d, h, col) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const t = [cx, y + h, cz];
  g.tri([x0, y, z1], [x1, y, z1], t, col);
  g.tri([x1, y, z1], [x1, y, z0], t, col);
  g.tri([x1, y, z0], [x0, y, z0], t, col);
  g.tri([x0, y, z0], [x0, y, z1], t, col);
}

// Cylindre / cône vertical. topCol === null : pas de couvercle.
export function cylinder(g, cx, y0, cz, rBot, rTop, h, segs, col, topCol) {
  const ring = (r, y) => {
    const pts = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
    }
    return pts;
  };
  const b = ring(rBot, y0), t = ring(rTop, y0 + h);
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    g.quad(b[j], b[i], t[i], t[j], col);
  }
  if (topCol !== null && rTop > 0.001) {
    const c = [cx, y0 + h, cz];
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      g.tri(t[j], t[i], c, topCol || col);
    }
  }
}

// Calotte sphérique
export function dome(g, cx, y, cz, r, hgt, segs, col) {
  const rings = 4;
  let prev = null;
  for (let k = 0; k <= rings; k++) {
    const a = (k / rings) * (Math.PI / 2);
    const rr = Math.max(0.0001, Math.cos(a) * r), yy = y + Math.sin(a) * hgt;
    const ring = [];
    for (let i = 0; i < segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      ring.push([cx + Math.cos(t) * rr, yy, cz + Math.sin(t) * rr]);
    }
    if (prev) {
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % segs;
        g.quad(prev[j], prev[i], ring[i], ring[j], col);
      }
    }
    prev = ring;
  }
}

// Toit en dents de scie le long de x (face vitrée côté +z)
export function sawtooth(g, x0, y, z0, x1, z1, rise, col, glassCol, teeth) {
  const dz = (z1 - z0) / teeth;
  for (let i = 0; i < teeth; i++) {
    const za = z0 + i * dz, zb = za + dz;
    g.quad([x0, y + rise, zb], [x1, y + rise, zb], [x1, y, za], [x0, y, za], col);
    g.quad([x0, y, zb], [x1, y, zb], [x1, y + rise, zb], [x0, y + rise, zb], glassCol);
    g.tri([x1, y, zb], [x1, y, za], [x1, y + rise, zb], col);
    g.tri([x0, y, za], [x0, y, zb], [x0, y + rise, zb], col);
  }
}

// Octaèdre déformé pour les rochers
export function rock(g, cx, y, cz, rx, ry, rz, col, seed) {
  let s = seed | 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 8) & 0xffff) / 65535; };
  const ring = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.75 + rnd() * 0.5;
    ring.push([cx + Math.cos(a) * rx * k, y + ry * 0.35 * (0.6 + rnd() * 0.8), cz + Math.sin(a) * rz * k]);
  }
  const top = [cx + (rnd() - 0.5) * rx * 0.3, y + ry, cz + (rnd() - 0.5) * rz * 0.3];
  const bot = [cx, y - ry * 0.25, cz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    g.tri(ring[j], ring[i], top, col);
    g.tri(ring[i], ring[j], bot, shade(col, 0.7));
  }
}
