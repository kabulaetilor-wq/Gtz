// Primitives de modélisation lisses (ellipsoïdes, membres, lofts, révolutions) + personnages et armes détaillés.
// Tout est écrit dans un Geo (couleurs par sommet, normales lisses). Aucune dépendance à three hors meshbuilder.
import { Geo, rgb, shade } from './meshbuilder.js';

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const V = { sub, add, mul, dot, cross, len, norm, lerp3 };

// Émet un triangle dont l'orientation suit les normales fournies (donc toujours face extérieure vers l'avant).
function emit(g, a, b, c, na, nb, nc, col) {
  const n = cross(sub(b, a), sub(c, a));
  if (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] < 1e-14) return;
  const avg = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
  if (dot(n, avg) < 0) { g.tri(a, c, b, resolve(col, a, b, c), null, [na, nc, nb]); return; }
  g.tri(a, b, c, resolve(col, a, b, c), null, [na, nb, nc]);
}
function resolve(col, a, b, c) {
  if (typeof col !== 'function') return col;
  return col((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3);
}

/* ---------------- Ellipsoïde (calotte possible : t0..t1 = angle polaire depuis le haut) ---------------- */
export function ellipsoid(g, cx, cy, cz, rx, ry, rz, col, segs = 12, rings = 8, t0 = 0, t1 = Math.PI) {
  const P = (i, j) => {
    const t = t0 + (t1 - t0) * (j / rings), a = (i / segs) * TAU;
    const st = Math.sin(t), ct = Math.cos(t);
    const ux = st * Math.cos(a), uy = ct, uz = st * Math.sin(a);
    return { p: [cx + rx * ux, cy + ry * uy, cz + rz * uz], n: norm([ux / rx, uy / ry, uz / rz]) };
  };
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const A = P(i, j), B = P(i + 1, j), C = P(i + 1, j + 1), D = P(i, j + 1);
      emit(g, A.p, B.p, C.p, A.n, B.n, C.n, col);
      emit(g, A.p, C.p, D.p, A.n, C.n, D.n, col);
    }
  }
}

/* ---------------- Membre / tronc de cône entre deux points ---------------- */
function basis(axis) {
  const w = norm(axis);
  const h = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(h, w));
  const v = cross(w, u);
  return { u, v, w };
}
export function limb(g, p0, p1, r0, r1, col, segs = 8, caps = true, sx = 1) {
  const ax = sub(p1, p0), L = len(ax);
  if (L < 1e-6) return;
  const { u, v, w } = basis(ax);
  const slope = (r0 - r1) / L;
  const ring = (p, r, i) => {
    const a = (i / segs) * TAU, c = Math.cos(a), s = Math.sin(a);
    const d = [u[0] * c * sx + v[0] * s, u[1] * c * sx + v[1] * s, u[2] * c * sx + v[2] * s];
    return { p: add(p, mul(d, r)), n: norm(add(d, mul(w, slope))) };
  };
  for (let i = 0; i < segs; i++) {
    const A = ring(p0, r0, i), B = ring(p0, r0, i + 1), C = ring(p1, r1, i + 1), D = ring(p1, r1, i);
    emit(g, A.p, B.p, C.p, A.n, B.n, C.n, col);
    emit(g, A.p, C.p, D.p, A.n, C.n, D.n, col);
  }
  if (caps) {
    for (const [p, r, nrm] of [[p0, r0, mul(w, -1)], [p1, r1, w]]) {
      if (r < 1e-5) continue;
      for (let i = 0; i < segs; i++) {
        const A = ring(p, r, i), B = ring(p, r, i + 1);
        emit(g, p, A.p, B.p, nrm, nrm, nrm, col);
      }
    }
  }
}
export function capsule(g, p0, p1, r0, r1, col, segs = 8) {
  limb(g, p0, p1, r0, r1, col, segs, false);
  ellipsoid(g, p0[0], p0[1], p0[2], r0, r0, r0, col, segs, 4);
  ellipsoid(g, p1[0], p1[1], p1[2], r1, r1, r1, col, segs, 4);
}

/* ---------------- Loft : suite d'anneaux fermés de même nombre de points ---------------- */
// opts.ring : lisse aussi autour de l'anneau ; capA / capB : bouche les extrémités
export function loft(g, rings, col, opts = {}) {
  const N = rings[0].length, M = rings.length;
  const ctr = (r) => { let c = [0, 0, 0]; for (const p of r) c = add(c, p); return mul(c, 1 / r.length); };
  const fn = [];
  for (let i = 0; i < M - 1; i++) {
    const row = [];
    const c = mul(add(ctr(rings[i]), ctr(rings[i + 1])), 0.5);
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      const a = rings[i][k], b = rings[i][k1], cc = rings[i + 1][k1], d = rings[i + 1][k];
      let n = cross(sub(cc, a), sub(d, b));
      if (len(n) < 1e-12) n = cross(sub(b, a), sub(d, a));
      n = norm(n);
      const qc = mul(add(add(a, b), add(cc, d)), 0.25);
      if (dot(n, sub(qc, c)) < 0) n = mul(n, -1);
      row.push(n);
    }
    fn.push(row);
  }
  const vn = (i, k) => {
    // normale au sommet (i,k) pour l'arête d'anneau k : moyenne le long de l'axe (et autour si opts.ring)
    let n = [0, 0, 0];
    for (const ii of [i - 1, i]) if (ii >= 0 && ii < M - 1) n = add(n, fn[ii][k]);
    if (opts.ring) for (const kk of [(k + N - 1) % N, (k + 1) % N]) for (const ii of [i - 1, i]) if (ii >= 0 && ii < M - 1) n = add(n, mul(fn[ii][kk], 0.7));
    return norm(n);
  };
  for (let i = 0; i < M - 1; i++) {
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      const a = rings[i][k], b = rings[i][k1], c = rings[i + 1][k1], d = rings[i + 1][k];
      const na = vn(i, k), nb = opts.ring ? vn(i, k1) : vn(i, k), nc = opts.ring ? vn(i + 1, k1) : vn(i + 1, k), nd = vn(i + 1, k);
      emit(g, a, b, c, na, nb, nc, col);
      emit(g, a, c, d, na, nc, nd, col);
    }
  }
  for (const [ri, flip, on] of [[0, -1, opts.capA !== false], [M - 1, 1, opts.capB !== false]]) {
    if (!on) continue;
    const r = rings[ri], c = ctr(r);
    const nrm0 = norm(cross(sub(r[1], r[0]), sub(r[2], r[0])));
    const towards = sub(ctr(rings[ri === 0 ? 1 : M - 2]), c);
    // la normale du chapeau pointe à l'opposé du reste du loft
    const nrm = dot(nrm0, towards) > 0 ? mul(nrm0, -1) : nrm0;
    void flip;
    for (let k = 0; k < N; k++) emit(g, c, r[k], r[(k + 1) % N], nrm, nrm, nrm, col);
  }
}

// anneau elliptique (x,z) à la hauteur y ; fz > 1 avance la poitrine, bz recule le dos
export function ringY(y, hx, hz, n = 12, cx = 0, cz = 0, front = 1, back = 1) {
  const r = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a);
    r.push([cx + hx * c, y, cz + hz * s * (s > 0 ? front : back)]);
  }
  return r;
}
// anneau « voiture » dans le plan (x,y) à la position z : 8 points
export function ringZ(z, wb, wm, wt, y0, ym, y1) {
  const lo = y0 + Math.min(0.1, (ym - y0) * 0.5);
  return [[-wb, y0, z], [wb, y0, z], [wm, lo, z], [wm, ym, z], [wt, y1, z], [-wt, y1, z], [-wm, ym, z], [-wm, lo, z]];
}

/* ---------------- Solide de révolution autour de l'axe x/y/z ---------------- */
// prof : [[t, r, couleur?], ...] ; l'axe passe par `o`
export function lathe(g, o, axis, prof, col, segs = 16, capEnds = true) {
  const A = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
  const U = axis === 'x' ? [0, 1, 0] : axis === 'y' ? [0, 0, 1] : [1, 0, 0];
  const W = cross(A, U);
  const pt = (t, r, i) => {
    const a = (i / segs) * TAU, d = add(mul(U, Math.cos(a)), mul(W, Math.sin(a)));
    return { p: add(add(o, mul(A, t)), mul(d, r)), d };
  };
  const tang = (j) => {
    const a = prof[Math.max(0, j - 1)], b = prof[Math.min(prof.length - 1, j + 1)];
    return [b[0] - a[0], b[1] - a[1]];
  };
  const nrm = (j, d) => { const [dt, dr] = tang(j); return norm(add(mul(d, dt), mul(A, -dr))); };
  for (let j = 0; j < prof.length - 1; j++) {
    const c = prof[j][2] || col;
    for (let i = 0; i < segs; i++) {
      const a = pt(prof[j][0], prof[j][1], i), b = pt(prof[j][0], prof[j][1], i + 1);
      const cc = pt(prof[j + 1][0], prof[j + 1][1], i + 1), dd = pt(prof[j + 1][0], prof[j + 1][1], i);
      const na = nrm(j, a.d), nb = nrm(j, b.d), nc = nrm(j + 1, cc.d), nd = nrm(j + 1, dd.d);
      // si le profil est une surface plane (dt=0 ou dr=0) la normale analytique reste correcte
      emit(g, a.p, b.p, cc.p, na, nb, nc, c);
      emit(g, a.p, cc.p, dd.p, na, nc, nd, c);
    }
  }
  if (capEnds) {
    for (const [j, s] of [[0, -1], [prof.length - 1, 1]]) {
      const [t, r, c0] = prof[j];
      if (r < 1e-5) continue;
      const nn = mul(A, s), cc = add(o, mul(A, t));
      for (let i = 0; i < segs; i++) emit(g, cc, pt(t, r, i).p, pt(t, r, i + 1).p, nn, nn, nn, c0 || col);
    }
  }
}

/* ---------------- Boîtes ---------------- */
// boîte centrée, dimensions complètes, normales plates
export function bx(g, cx, cy, cz, sx, sy, sz, col) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const q = (a, b, c, d, n) => { emit(g, a, b, c, n, n, n, col); emit(g, a, c, d, n, n, n, col); };
  q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
  q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
}
// boîte « chanfreinée » : octogone extrudé (coins adoucis)
export function rbx(g, cx, cy, cz, sx, sy, sz, col, bevel = 0.2) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2, b = Math.min(hx, hy) * bevel;
  const pts = [[-hx + b, -hy], [hx - b, -hy], [hx, -hy + b], [hx, hy - b], [hx - b, hy], [-hx + b, hy], [-hx, hy - b], [-hx, -hy + b]];
  loft(g, [pts.map((p) => [cx + p[0], cy + p[1], cz - hz]), pts.map((p) => [cx + p[0], cy + p[1], cz + hz])], col);
}

/* ---------------- Couleurs ---------------- */
const hash3 = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
export function camo(base, a, b, c, scale = 9) {
  const A = rgb(base), B = rgb(a), C = rgb(b), D = rgb(c);
  return (x, y, z) => {
    const n = Math.sin(x * scale + Math.sin(y * scale * 0.8) * 1.7) * Math.cos(z * scale * 0.9 + y * scale * 0.5) + hash3(Math.floor(x * 14), Math.floor(y * 14), Math.floor(z * 14)) * 0.5;
    return n > 0.85 ? D : n > 0.35 ? C : n < -0.45 ? B : A;
  };
}
export const jitter = (col, amt = 0.06) => (x, y, z) => shade(col, 1 + (hash3(x * 91, y * 57, z * 33) - 0.5) * amt * 2);

/* =====================================================================
   ARMES (repère : origine = poignée, avant = +z, haut = +y)
   ===================================================================== */
const GUN = rgb(0x1e2023), GUNM = rgb(0x3a3d42), STEEL = rgb(0x6b7078), WOOD = rgb(0x6b4a2c), OD = rgb(0x4a5233), RUBBER = rgb(0x111214);

export function gunGeometry(kind) {
  const g = new Geo(false);
  if (kind === 'pistol') {
    bx(g, 0, 0.055, 0.06, 0.03, 0.036, 0.19, GUNM); // glissière
    bx(g, 0, 0.032, 0.065, 0.026, 0.022, 0.17, GUN);
    limb(g, [0, 0.056, 0.16], [0, 0.056, 0.20], 0.007, 0.007, STEEL, 8); // bouche
    bx(g, 0, 0.0, 0.0, 0.028, 0.1, 0.05, GUN); // poignée
    limb(g, [0, 0.02, -0.01], [0, -0.07, -0.02], 0.016, 0.018, GUN, 8);
    bx(g, 0, 0.009, 0.045, 0.012, 0.004, 0.05, GUN);
    bx(g, 0, 0.0, 0.092, 0.012, 0.03, 0.004, GUN); // pontet
    bx(g, 0, 0.081, -0.025, 0.006, 0.01, 0.01, STEEL); // hausse
    bx(g, 0, 0.081, 0.15, 0.004, 0.01, 0.006, STEEL);
    return { geo: g, grip: [0, 0, 0], fore: [0.0, -0.01, 0.01], muzzle: 0.2, twoHand: 'wrap' };
  }
  if (kind === 'rifle') {
    bx(g, 0, 0.055, 0.1, 0.045, 0.075, 0.36, GUN); // boîtier
    bx(g, 0, 0.1, 0.1, 0.03, 0.012, 0.3, GUNM); // rail
    bx(g, 0, 0.065, 0.42, 0.05, 0.06, 0.24, OD); // garde-main
    for (let i = 0; i < 4; i++) bx(g, 0.027, 0.065, 0.34 + i * 0.05, 0.004, 0.04, 0.02, GUN);
    limb(g, [0, 0.07, 0.5], [0, 0.07, 0.73], 0.011, 0.011, STEEL, 8); // canon
    limb(g, [0, 0.07, 0.73], [0, 0.07, 0.8], 0.016, 0.016, GUN, 8); // cache-flamme
    bx(g, 0, 0.105, 0.6, 0.006, 0.05, 0.012, GUN); // guidon
    bx(g, 0, 0.105, -0.07, 0.03, 0.03, 0.05, GUN); // hausse
    // crosse
    bx(g, 0, 0.045, -0.2, 0.04, 0.085, 0.2, OD);
    bx(g, 0, 0.02, -0.34, 0.045, 0.14, 0.04, RUBBER);
    // poignée
    limb(g, [0, 0.02, 0.0], [0, -0.1, -0.035], 0.02, 0.022, GUN, 8);
    // chargeur courbe
    limb(g, [0, 0.02, 0.17], [0, -0.07, 0.185], 0.021, 0.021, GUNM, 4, true, 0.55);
    limb(g, [0, -0.07, 0.185], [0, -0.15, 0.23], 0.021, 0.021, GUNM, 4, true, 0.55);
    bx(g, 0, 0.0, 0.06, 0.012, 0.004, 0.09, GUN); // pontet
    bx(g, 0.0, 0.135, 0.12, 0.034, 0.05, 0.09, GUN); // point rouge
    ellipsoid(g, 0, 0.135, 0.165, 0.014, 0.018, 0.004, rgb(0xaa2222), 8, 4);
    bx(g, 0.026, 0.07, 0.0, 0.01, 0.012, 0.03, GUNM); // levier
    return { geo: g, grip: [0, 0, 0], fore: [0.0, 0.055, 0.44], muzzle: 0.8, twoHand: 'fore' };
  }
  // sniper
  bx(g, 0, 0.06, 0.12, 0.05, 0.08, 0.5, GUN);
  bx(g, 0, 0.06, 0.52, 0.045, 0.06, 0.34, GUNM);
  limb(g, [0, 0.07, 0.65], [0, 0.07, 1.0], 0.014, 0.011, STEEL, 8);
  limb(g, [0, 0.07, 1.0], [0, 0.07, 1.08], 0.022, 0.022, GUN, 8); // frein de bouche
  for (let i = 0; i < 3; i++) bx(g, 0, 0.07, 1.02 + i * 0.022, 0.05, 0.006, 0.01, GUNM);
  // crosse à joue
  bx(g, 0, 0.07, -0.22, 0.045, 0.1, 0.34, WOOD);
  bx(g, 0, 0.115, -0.3, 0.04, 0.03, 0.2, WOOD);
  bx(g, 0, 0.01, -0.42, 0.05, 0.16, 0.035, RUBBER);
  limb(g, [0, 0.02, 0.0], [0, -0.1, -0.04], 0.02, 0.022, WOOD, 8);
  // lunette
  lathe(g, [0, 0.15, 0.0], 'z', [[-0.12, 0.018], [-0.09, 0.024], [-0.02, 0.019], [0.12, 0.019], [0.2, 0.03], [0.34, 0.034], [0.36, 0.03]], GUN, 12);
  lathe(g, [0, 0.15, 0.0], 'z', [[0.345, 0.033], [0.348, 0.026]], rgb(0x2a4a7a), 12, false);
  bx(g, 0, 0.19, 0.12, 0.012, 0.025, 0.03, GUN);
  bx(g, 0, 0.1, -0.02, 0.026, 0.05, 0.03, GUNM);
  bx(g, 0, 0.1, 0.22, 0.026, 0.05, 0.03, GUNM);
  // levier de culasse
  limb(g, [0.025, 0.07, 0.04], [0.085, 0.045, 0.045], 0.007, 0.007, STEEL, 6);
  ellipsoid(g, 0.09, 0.043, 0.045, 0.014, 0.014, 0.014, GUN, 8, 5);
  // chargeur
  bx(g, 0, -0.04, 0.2, 0.03, 0.12, 0.06, GUNM);
  // bipied replié
  limb(g, [0.02, 0.04, 0.78], [0.03, -0.01, 0.95], 0.006, 0.005, STEEL, 6);
  limb(g, [-0.02, 0.04, 0.78], [-0.03, -0.01, 0.95], 0.006, 0.005, STEEL, 6);
  return { geo: g, grip: [0, 0, 0], fore: [0.0, 0.03, 0.52], muzzle: 1.08, twoHand: 'fore' };
}

/* =====================================================================
   PERSONNAGES
   ===================================================================== */
// IK à deux segments : retourne la position du coude
function elbowIK(sh, target, l1, l2, pole) {
  const d = sub(target, sh);
  let dist = len(d);
  const max = l1 + l2 - 0.005;
  let tgt = target;
  if (dist > max) { tgt = add(sh, mul(norm(d), max)); dist = max; }
  const dir = norm(sub(tgt, sh));
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  p = norm(p);
  return { elbow: add(add(sh, mul(dir, a)), mul(p, h)), hand: tgt };
}

const SKIN = [0xf0c8a0, 0xd9a577, 0xc08a5a, 0x8d5a3b, 0x6b4128];
const HAIR = [0x1b1410, 0x3a2414, 0x6b4423, 0xa67c3d, 0xc9a35e, 0x8a8a8a, 0x2b1b12];

export function head(g, o, skin, hairCol, hairStyle, female) {
  const S = rgb(skin), hy = 1.69;
  ellipsoid(g, 0, hy, 0, 0.083, 0.108, 0.096, S, 20, 14);
  ellipsoid(g, 0, hy - 0.055, 0.012, 0.07, 0.06, 0.082, S, 14, 8); // mâchoire
  ellipsoid(g, 0, hy - 0.012, 0.094, 0.016, 0.024, 0.022, shade(S, 0.96), 8, 5); // nez
  for (const s of [-1, 1]) {
    ellipsoid(g, s * 0.083, hy - 0.005, -0.005, 0.01, 0.026, 0.016, shade(S, 0.94), 6, 4); // oreilles
    ellipsoid(g, s * 0.034, hy + 0.014, 0.084, 0.013, 0.008, 0.006, rgb(0xf4f1ea), 8, 4); // yeux
    ellipsoid(g, s * 0.034, hy + 0.014, 0.088, 0.006, 0.006, 0.003, rgb(0x1a1612), 6, 3);
    bx(g, s * 0.034, hy + 0.04, 0.083, 0.032, 0.006, 0.01, shade(rgb(hairCol), 0.8)); // sourcils
  }
  bx(g, 0, hy - 0.058, 0.088, 0.036, 0.006, 0.008, rgb(0x8a4a44)); // bouche
  limb(g, [0, 1.52, 0], [0, 1.6, 0], 0.052, 0.046, shade(S, 0.95), 8); // cou
  const H = rgb(hairCol);
  const cap = (cy2, rx, ry, rz, t1) => ellipsoid(g, 0, cy2, -0.014, rx, ry, rz, H, 26, 14, 0, t1);
  const nape = (cy2, ry2, rz2) => ellipsoid(g, 0, cy2, -0.042, 0.066, ry2, rz2, H, 14, 8, 0.15, 2.4);
  if (hairStyle === 'short') {
    cap(hy + 0.004, 0.091, 0.113, 0.104, 1.62);
    nape(hy - 0.03, 0.07, 0.082);
  } else if (hairStyle === 'long') {
    cap(hy + 0.004, 0.092, 0.114, 0.106, 1.62);
    ellipsoid(g, 0, hy - 0.1, -0.058, 0.082, 0.19, 0.075, H, 14, 10, 0.1, 2.7);
    for (const s of [-1, 1]) limb(g, [s * 0.086, hy + 0.02, -0.01], [s * 0.088, hy - 0.2, -0.04], 0.018, 0.016, H, 6);
  } else if (hairStyle === 'bun') {
    cap(hy + 0.004, 0.091, 0.113, 0.104, 1.62);
    nape(hy - 0.03, 0.07, 0.082);
    ellipsoid(g, 0, hy + 0.105, -0.05, 0.042, 0.036, 0.042, H, 10, 6);
  }
  void o;
}

// Construit les géométries d'un type de personnage. role : 'soldier' | 'officer' | 'civilian' | 'player'
export function buildHumanGeometry(role, opts = {}) {
  const seed = opts.seed || 0;
  const rnd = (n) => { const s = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return s - Math.floor(s); };
  const pick = (arr, n) => arr[Math.floor(rnd(n) * arr.length) % arr.length];
  const female = role === 'civilian' && rnd(1) < 0.45;
  const skin = opts.skin ?? pick(SKIN, 2);
  const hairCol = pick(HAIR, 3);
  const armed = role !== 'civilian';
  const gunKind = opts.gun || (role === 'officer' ? 'pistol' : 'rifle');

  // palette
  let top, pants, boots = 0x181410, shirt2 = null;
  if (role === 'soldier') { top = 0x56633a; pants = 0x4a5532; }
  else if (role === 'officer') { top = 0x2d2f33; pants = 0x25272b; boots = 0x0e0c0a; }
  else if (role === 'player') { top = 0x2f4f7a; pants = 0x262a36; boots = 0x3a2c20; }
  else {
    top = pick([0xc0392b, 0x2980b9, 0x27ae60, 0xe1b12c, 0x8e44ad, 0xe67e22, 0xe8e8e0, 0x34495e, 0xd35d8c], 4);
    pants = pick([0x2c3e50, 0x34495e, 0x5d4e37, 0x1b1b1b, 0x6b7a8f, 0x7d6b50], 5);
    boots = pick([0x181410, 0x3a2c20, 0xdddddd, 0x2a3a5a], 6);
  }
  const TOP = role === 'soldier' ? camo(top, 0x3b4628, 0x7a6a45, 0x252b1a) : jitter(rgb(top), 0.03);
  const PANTS = role === 'soldier' ? camo(pants, 0x3b4628, 0x7a6a45, 0x252b1a) : jitter(rgb(pants), 0.03);
  const SK = rgb(skin);
  const female0 = female;
  const skirtOrShorts = () => (role === 'civilian' && (rnd(15) < 0.18 || (female0 && rnd(10) < 0.5)) ? PANTS : PANTS);

  /* ----- corps (torse + tête + équipement + bras armés + arme) ----- */
  const body = new Geo(false);
  const sec = (y, hx, hz, n = 14, cz = 0, f = 1, b = 0.92) => ringY(y, hx, hz, n, 0, cz, f, b);
  const torso = female
    ? [sec(0.93, 0.15, 0.095), sec(1.0, 0.14, 0.09), sec(1.06, 0.125, 0.085), sec(1.2, 0.15, 0.1, 14, 0, 1.25), sec(1.34, 0.17, 0.11, 14, 0, 1.2), sec(1.44, 0.18, 0.1), sec(1.5, 0.09, 0.07), sec(1.54, 0.055, 0.055)]
    : [sec(0.93, 0.162, 0.098), sec(1.0, 0.155, 0.095), sec(1.1, 0.165, 0.1), sec(1.26, 0.195, 0.115, 14, 0, 1.12), sec(1.4, 0.205, 0.12, 14, 0, 1.1), sec(1.47, 0.19, 0.1), sec(1.51, 0.09, 0.07), sec(1.545, 0.058, 0.058)];
  loft(body, torso, TOP, { ring: true, capA: false });
  // bassin (couleur du pantalon) : ferme le bas du torse entre les cuisses
  loft(body, [sec(0.97, 0.158, 0.096), sec(0.88, 0.176, 0.106), sec(0.8, 0.17, 0.1), sec(0.76, 0.12, 0.08)], skirtOrShorts(), { ring: true, capA: false });
  // épaules rondes
  for (const s of [-1, 1]) ellipsoid(body, s * 0.205, 1.43, 0, 0.065, 0.065, 0.07, TOP, 10, 6);
  if (role === 'civilian' || role === 'player') loft(body, [ringY(1.515, 0.07, 0.066, 12), ringY(1.565, 0.062, 0.058, 12)], shade(rgb(top), 1.18), { ring: true, capA: false, capB: false });
  // ceinture
  const BELTC = rgb(role === 'civilian' ? 0x2a1c12 : 0x1a1612);
  loft(body, [sec(0.93, 0.158, 0.097), sec(0.985, 0.158, 0.097)], BELTC, { ring: true, capA: false, capB: false });
  bx(body, 0, 0.96, 0.1, 0.04, 0.04, 0.012, rgb(0xb8b08a)); // boucle
  head(body, 0, skin, hairCol, female ? (rnd(8) < 0.6 ? 'long' : 'bun') : (rnd(9) < 0.2 && role === 'civilian' ? 'none' : 'short'), female);

  // jupe / robe pour certaines civiles
  const skirt = female && rnd(10) < 0.5;
  const shortsAll = role === 'civilian' && rnd(15) < 0.18;
  if (skirt) loft(body, [sec(0.9, 0.16, 0.1), sec(0.7, 0.2, 0.13), sec(0.5, 0.24, 0.16)], jitter(rgb(pants), 0.03), { ring: true, capA: false, capB: false });

  // équipement par rôle
  if (role === 'soldier' || role === 'player') {
    const VEST = rgb(role === 'soldier' ? 0x3b3f2c : 0x23262b);
    loft(body, [sec(1.12, 0.178, 0.112, 14, 0, 1.15), sec(1.27, 0.212, 0.128, 14, 0, 1.15), sec(1.42, 0.214, 0.126, 14, 0, 1.12)], VEST, { ring: true, capA: false, capB: false });
    for (const x of [-0.12, -0.04, 0.04, 0.12]) { rbx(body, x, 1.2, 0.138, 0.062, 0.1, 0.05, shade(VEST, 1.2), 0.25); bx(body, x, 1.245, 0.164, 0.05, 0.01, 0.012, shade(VEST, 0.8)); }
    bx(body, 0, 1.33, 0.14, 0.2, 0.14, 0.02, shade(VEST, 0.9)); // plaque
    for (const s of [-1, 1]) {
      limb(body, [s * 0.14, 1.52, 0.02], [s * 0.15, 1.34, 0.12], 0.028, 0.026, VEST, 6);
      limb(body, [s * 0.14, 1.52, -0.02], [s * 0.15, 1.34, -0.115], 0.028, 0.026, VEST, 6);
      rbx(body, s * 0.2, 1.03, 0.05, 0.05, 0.1, 0.07, shade(VEST, 1.2), 0.25); // poches de ceinture
    }
    // sac à dos
    const PK = rgb(role === 'soldier' ? 0x4a4630 : 0x3a3a3a);
    rbx(body, 0, 1.25, -0.2, 0.3, 0.38, 0.17, PK, 0.18);
    rbx(body, 0, 1.14, -0.29, 0.2, 0.18, 0.06, shade(PK, 0.85), 0.2);
    limb(body, [-0.15, 1.45, -0.17], [0.15, 1.45, -0.17], 0.045, 0.045, shade(PK, 0.7), 8); // tapis roulé
    for (const s of [-1, 1]) limb(body, [s * 0.1, 1.44, -0.11], [s * 0.12, 1.2, -0.12], 0.022, 0.022, VEST, 6);
    // gourde
    limb(body, [0.17, 0.95, -0.1], [0.17, 1.07, -0.1], 0.035, 0.035, rgb(0x59603f), 8);
    // radio
    bx(body, -0.13, 1.4, 0.15, 0.03, 0.07, 0.025, GUN);
    limb(body, [-0.13, 1.44, 0.15], [-0.14, 1.58, 0.15], 0.004, 0.003, GUN, 4);
  }
  if (role === 'soldier') {
    // casque
    const HELM = camo(0x4f5a38, 0x3b4628, 0x7a6a45, 0x252b1a, 14);
    ellipsoid(body, 0, 1.72, -0.005, 0.112, 0.105, 0.128, HELM, 16, 8, 0, 1.95);
    limb(body, [0, 1.655, 0.125], [0, 1.655, 0.14], 0.0, 0.0, GUN, 3, false);
    loft(body, ringsBrim(1.665), GUN, { ring: true, capA: false, capB: false });
    bx(body, 0, 1.78, 0.125, 0.04, 0.03, 0.03, GUN); // support NVG
    for (const s of [-1, 1]) limb(body, [s * 0.1, 1.68, 0.02], [s * 0.05, 1.575, 0.06], 0.004, 0.004, GUN, 4); // jugulaire
    bx(body, 0, 1.58, 0.07, 0.03, 0.02, 0.012, GUN);
    // genouillères & manches retroussées gérées dans les jambes
    // écusson / brassard
    bx(body, 0.222, 1.3, 0, 0.012, 0.05, 0.09, rgb(0x2a3a8a));
  }
  if (role === 'officer') {
    // manteau long à épaulettes
    const COAT = rgb(0x2d2f33);
    loft(body, [sec(0.58, 0.19, 0.12), sec(0.78, 0.175, 0.112), sec(0.95, 0.165, 0.102)], COAT, { ring: true, capA: false, capB: false });
    loft(body, [sec(1.25, 0.2, 0.118, 14, 0, 1.1), sec(1.42, 0.212, 0.124, 14, 0, 1.08)], COAT, { ring: true, capA: false, capB: false });
    for (const s of [-1, 1]) {
      bx(body, s * 0.205, 1.495, 0, 0.1, 0.012, 0.075, rgb(0xc9a227));
      bx(body, s * 0.205, 1.503, 0, 0.09, 0.004, 0.012, rgb(0x8b1a1a));
    }
    bx(body, 0, 1.2, 0.128, 0.012, 0.3, 0.01, rgb(0xc9a227)); // boutons
    for (let i = 0; i < 4; i++) ellipsoid(body, 0.045, 1.35 - i * 0.07, 0.128, 0.011, 0.011, 0.006, rgb(0xd8b43a), 6, 4);
    for (let i = 0; i < 3; i++) bx(body, -0.1 - i * 0.012, 1.36, 0.13, 0.009, 0.016, 0.006, [rgb(0xd33), rgb(0x3a6fd3), rgb(0xe8c84a)][i]); // médailles
    bx(body, -0.222, 1.3, 0, 0.012, 0.08, 0.1, rgb(0x8b1a1a)); // brassard
    rbx(body, 0.17, 0.9, 0.05, 0.05, 0.14, 0.08, rgb(0x2a1c12), 0.3); // étui
    // casquette d'officier
    const CAP = rgb(0x22262b);
    ellipsoid(body, 0, 1.755, 0, 0.12, 0.05, 0.13, CAP, 16, 5, 0, 1.75);
    loft(body, ringsBand(1.725, 0.108, 0.12), rgb(0x16181b), { ring: true, capA: false, capB: false });
    ellipsoid(body, 0, 1.742, 0.12, 0.085, 0.012, 0.075, rgb(0x0e0f11), 10, 3, 0, 1.6); // visière
    ellipsoid(body, 0, 1.745, 0.131, 0.018, 0.018, 0.004, rgb(0xd8b43a), 8, 4); // insigne
  }
  if (role === 'player') {
    // bonnet + lunettes
    ellipsoid(body, 0, 1.73, -0.01, 0.092, 0.095, 0.107, rgb(0x22262b), 14, 7, 0, 1.75);
    loft(body, ringsBand(1.7, 0.09, 0.103), rgb(0x1a1d20), { ring: true, capA: false, capB: false });
    bx(body, 0, 1.705, 0.086, 0.1, 0.022, 0.01, rgb(0x14161a)); // lunettes
    // bandoulière
    limb(body, [0.15, 1.5, 0.07], [-0.15, 1.12, 0.12], 0.014, 0.014, rgb(0x111111), 6);
  }
  if (role === 'civilian') {
    const kind = rnd(11);
    if (kind < 0.25) { // sac à dos
      rbx(body, 0, 1.25, -0.16, 0.26, 0.32, 0.13, rgb(pick([0x2a3a5a, 0x7a2a2a, 0x2a5a3a, 0x333333], 12)), 0.2);
    } else if (kind < 0.4) { // casquette
      ellipsoid(body, 0, 1.745, -0.005, 0.098, 0.065, 0.11, rgb(pick([0x2a3a5a, 0xaa2a2a, 0x222222, 0xdddddd], 13)), 14, 6, 0, 1.6);
      ellipsoid(body, 0, 1.725, 0.12, 0.075, 0.01, 0.07, rgb(0x15171a), 8, 3, 0, 1.6);
    }
    if (rnd(14) < 0.3) { // lunettes
      for (const s of [-1, 1]) ellipsoid(body, s * 0.034, 1.703, 0.092, 0.019, 0.015, 0.004, rgb(0x14161a), 8, 4);
      bx(body, 0, 1.703, 0.092, 0.04, 0.004, 0.004, rgb(0x14161a));
    }
  }

  // bras armés (statiques) + arme
  let gun = null;
  const GRIP = [-0.145, 1.255, 0.2];
  if (armed) {
    gun = gunGeometry(gunKind);
    body.setXform(1, 0, GRIP[0], GRIP[1], GRIP[2], 1);
    for (let i = 0; i < gun.geo.pos.length; i += 9) {
      // recopie les triangles de l'arme dans le corps (translation uniquement)
      const p = gun.geo.pos, n = gun.geo.nor, c = gun.geo.col;
      body.tri([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], [c[i], c[i + 1], c[i + 2]], null,
        [[n[i], n[i + 1], n[i + 2]], [n[i + 3], n[i + 4], n[i + 5]], [n[i + 6], n[i + 7], n[i + 8]]]);
    }
    body.clearXform();
    const sleeve = role === 'soldier' ? TOP : role === 'officer' ? rgb(0x2d2f33) : TOP;
    const GLOVE = rgb(role === 'soldier' ? 0x2a2a26 : role === 'officer' ? 0x111111 : 0x3a2c20);
    // épaule droite -> poignée ; épaule gauche -> garde-main
    const shR = [-0.215, 1.42, 0.0], shL = [0.215, 1.42, 0.0];
    const handR = add(GRIP, [0, 0.02, 0.01]);
    const handL = gun.twoHand === 'fore' ? add(GRIP, [gun.fore[0] - 0.005, gun.fore[1] - 0.01, gun.fore[2]]) : add(GRIP, [0.04, -0.03, 0.02]);
    const aR = elbowIK(shR, handR, 0.29, 0.27, [-0.4, -1, -0.5]);
    const aL = elbowIK(shL, handL, 0.29, 0.27, [0.5, -1, -0.4]);
    for (const [sh, a] of [[shR, aR], [shL, aL]]) {
      limb(body, sh, a.elbow, 0.052, 0.043, sleeve, 8);
      ellipsoid(body, a.elbow[0], a.elbow[1], a.elbow[2], 0.044, 0.044, 0.044, sleeve, 8, 5);
      limb(body, a.elbow, a.hand, 0.043, 0.032, role === 'civilian' ? SK : sleeve, 8);
      ellipsoid(body, a.hand[0], a.hand[1], a.hand[2], 0.04, 0.036, 0.05, GLOVE, 8, 5);
    }
  }

  /* ----- jambes (pivot à la hanche, genou sur la jambe) ----- */
  const legs = [];
  const hipY = 0.9, kneeY = 0.48, ankleY = 0.1;
  for (const s of [-1, 1]) {
    const hx = s * 0.093;
    const thigh = new Geo(false), shin = new Geo(false);
    // coordonnées relatives à la hanche / au genou
    const PANT = PANTS;
    const shorts = shortsAll;
    const sk = skirt;
    if (shorts) {
      limb(thigh, [0, -0.02, 0], [0, -0.2, 0.004], 0.09, 0.08, PANT, 10, false);
      ellipsoid(thigh, 0, -0.02, 0, 0.09, 0.05, 0.09, PANT, 10, 5, 0, 1.6);
      limb(thigh, [0, -0.2, 0.004], [0, -(hipY - kneeY) + 0.02, 0.008], 0.077, 0.066, SK, 10, false);
      ellipsoid(thigh, 0, -(hipY - kneeY) + 0.02, 0.008, 0.066, 0.066, 0.066, SK, 10, 5);
    } else capsule(thigh, [0, -0.02, 0], [0, -(hipY - kneeY) + 0.02, 0.008], 0.09, 0.066, sk ? SK : PANT, 10);
    if (role === 'soldier') {
      ellipsoid(shin, 0, 0.02, 0.058, 0.052, 0.062, 0.03, rgb(0x23251c), 8, 5); // genouillère
      bx(thigh, s * 0.092, -0.23, 0, 0.02, 0.1, 0.07, shade(rgb(0x4a5532), 1.1)); // poche cargo
    }
    capsule(shin, [0, 0, 0], [0, -(kneeY - ankleY), 0], 0.064, 0.045, shorts || sk ? SK : PANT, 10);
    // chaussure / botte
    const BT = rgb(boots);
    const ay = -(kneeY - ankleY);
    if (role === 'civilian' && !(rnd(16) < 0.35)) {
      loft(shin, [ringZ(-0.07, 0.04, 0.052, 0.045, ay - 0.1, ay - 0.04, ay + 0.0), ringZ(0.02, 0.045, 0.056, 0.05, ay - 0.1, ay - 0.03, ay + 0.03), ringZ(0.13, 0.04, 0.05, 0.04, ay - 0.1, ay - 0.06, ay - 0.02), ringZ(0.22, 0.028, 0.036, 0.028, ay - 0.1, ay - 0.085, ay - 0.06)], BT, {});
      bx(shin, 0, ay - 0.098, 0.07, 0.1, 0.012, 0.3, rgb(0xeeeeee));
    } else {
      limb(shin, [0, ay + 0.06, 0], [0, ay - 0.03, 0.0], 0.055, 0.058, BT, 10); // tige
      loft(shin, [ringZ(-0.075, 0.043, 0.054, 0.048, ay - 0.1, ay - 0.04, ay + 0.0), ringZ(0.02, 0.048, 0.058, 0.052, ay - 0.1, ay - 0.03, ay + 0.03), ringZ(0.12, 0.044, 0.054, 0.046, ay - 0.1, ay - 0.05, ay - 0.0), ringZ(0.19, 0.04, 0.047, 0.038, ay - 0.1, ay - 0.065, ay - 0.035), ringZ(0.225, 0.026, 0.032, 0.024, ay - 0.1, ay - 0.085, ay - 0.065)], BT, {});
      bx(shin, 0, ay - 0.103, 0.07, 0.108, 0.012, 0.31, rgb(0x0d0c0b)); // semelle
    }
    legs.push({ x: hx, thigh, shin, hipY, kneeY });
  }

  /* ----- bras libres (civils) ----- */
  const arms = [];
  if (!armed) {
    for (const s of [-1, 1]) {
      const up = new Geo(false), low = new Geo(false);
      const short = role === 'civilian' && rnd(17) < 0.5;
      const SL = jitter(rgb(top), 0.03);
      capsule(up, [0, 0, 0], [0, -0.28, 0], 0.052, 0.043, SL, 8);
      capsule(low, [0, 0, 0], [0, -0.25, 0], 0.043, 0.034, short ? SK : SL, 8);
      ellipsoid(low, 0, -0.29, 0.005, 0.036, 0.05, 0.026, SK, 8, 5); // main
      limb(low, [s * 0.012, -0.3, 0.025], [s * 0.025, -0.34, 0.03], 0.01, 0.007, SK, 5); // pouce
      arms.push({ x: s * 0.215, up, low });
    }
  }
  return { body, legs, arms, role, gun: gun && { muzzle: gun.muzzle }, female };
}

function ringsBrim(y) {
  // rebord de casque : anneau épais, légèrement évasé
  const mk = (r, rz, yy) => ringY(yy, r, rz, 20, 0, 0.0);
  return [mk(0.108, 0.125, y), mk(0.12, 0.137, y - 0.012)];
}
function ringsBand(y, rx, rz) {
  return [ringY(y, rx, rz, 18, 0, -0.005), ringY(y + 0.03, rx * 1.03, rz * 1.03, 18, 0, -0.005)];
}

/* Poses : phase ∈ rad, amp 0..1.2, armed : bras figés */
export function posePerson(parts, phase, amp) {
  const s = Math.sin(phase) * 0.62 * amp;
  const kneeA = Math.max(0, -Math.cos(phase)) * 0.95 * amp;
  const kneeB = Math.max(0, Math.cos(phase)) * 0.95 * amp;
  parts.legs[0].hip.rotation.x = s;
  parts.legs[1].hip.rotation.x = -s;
  parts.legs[0].knee.rotation.x = kneeA;
  parts.legs[1].knee.rotation.x = kneeB;
  for (let i = 0; i < parts.arms.length; i++) {
    const sw = (i === 0 ? -s : s) * 0.9;
    parts.arms[i].sh.rotation.x = sw;
    parts.arms[i].el.rotation.x = -0.15 - Math.max(0, i === 0 ? s : -s) * 0.9;
  }
  parts.body.position.y = Math.abs(Math.sin(phase)) * 0.03 * amp;
}
