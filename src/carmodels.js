// Modèles détaillés de véhicules (Geo : couleurs par sommet). Repère : avant = +z, haut = +y, conducteur à gauche (+x).
import { Geo, rgb, shade } from './meshbuilder.js';
import { ellipsoid, limb, capsule, loft, ringZ, lathe, bx, rbx, V } from './models.js';

const TRIM = rgb(0x121315), TRIM2 = rgb(0x24262a), CHROME = rgb(0xc4c8ce), STEEL = rgb(0x7b8088), RUBBER = rgb(0x0d0d0e);
const WHITE = [1, 1, 1];
const SEAT = rgb(0x2a2c30), SEAT2 = rgb(0x3a3d42), DASH = rgb(0x1c1d20), BEIGE = rgb(0x6e6657);

/* ---------------- Roues (axe x ; côté = +1 extérieur vers +x, -1 vers -x) ---------------- */
export function wheelGeometry(side, axis = 'x', withBrake = true) {
  const g = new Geo(false);
  const s = side;
  const T = (t, r, c) => [t * s, r, c];
  // pneu : flancs bombés, épaulements, bande de roulement rainurée
  const tire = [T(-0.1, 0.205), T(-0.112, 0.235), T(-0.108, 0.29), T(-0.092, 0.328), T(-0.07, 0.343), T(-0.035, 0.347), T(-0.028, 0.338), T(-0.018, 0.338), T(-0.01, 0.347),
    T(0.01, 0.347), T(0.018, 0.338), T(0.028, 0.338), T(0.035, 0.347), T(0.07, 0.343), T(0.092, 0.328), T(0.108, 0.29), T(0.112, 0.235), T(0.1, 0.205)];
  const prof = s > 0 ? tire : tire.slice().reverse();
  lathe(g, [0, 0, 0], axis, prof.map((p) => [p[0], p[1]]), RUBBER, 28, false);
  // jante : lèvre + fond de jante creusé
  const rim = [[0.1, 0.205], [0.098, 0.196], [0.082, 0.19], [0.05, 0.17], [0.04, 0.1], [0.045, 0.065]].map(([t, r]) => [t * s, r]);
  lathe(g, [0, 0, 0], axis, s > 0 ? rim : rim.slice().reverse(), CHROME, 24, false);
  // fond sombre derrière les branches
  lathe(g, [0, 0, 0], axis, (s > 0 ? [[0.03, 0.17], [0.03, 0.0]] : [[-0.03, 0.0], [-0.03, 0.17]]), TRIM2, 24, false);
  // branches (5) + moyeu
  const dir = (a) => axis === 'x' ? [0, Math.cos(a), Math.sin(a)] : [Math.cos(a), Math.sin(a), 0];
  const ax = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3, d = dir(a), dn = dir(a + 0.22);
    const p0 = V.add(V.mul(ax, 0.06 * s), V.mul(d, 0.06)), p1 = V.add(V.mul(ax, 0.095 * s), V.mul(dn, 0.185));
    limb(g, p0, p1, 0.022, 0.026, shade(CHROME, 0.92), 6);
  }
  lathe(g, [0, 0, 0], axis, (s > 0 ? [[0.07, 0.0], [0.1, 0.0], [0.105, 0.05], [0.098, 0.065], [0.07, 0.07]] : [[-0.07, 0.07], [-0.098, 0.065], [-0.105, 0.05], [-0.1, 0.0], [-0.07, 0.0]]), CHROME, 14, false);
  for (let i = 0; i < 5; i++) { const d = dir((i / 5) * Math.PI * 2); const p = V.add(V.mul(ax, 0.1 * s), V.mul(d, 0.04)); limb(g, p, V.add(p, V.mul(ax, 0.012 * s)), 0.007, 0.007, STEEL, 5); }
  // disque de frein + étrier (face intérieure)
  if (withBrake && axis === 'x') {
    lathe(g, [0, 0, 0], 'x', [[-0.045 * s, 0.215], [-0.06 * s, 0.215], [-0.06 * s, 0.07], [-0.045 * s, 0.07]].map((p) => [p[0], p[1]]), rgb(0x55575c), 20, false);
    bx(g, -0.052 * s, 0.17, 0.09, 0.05, 0.1, 0.07, rgb(0x8a2a22));
  }
  return g;
}

/* ---------------- Coque : anneaux interpolés avec arches de roues ---------------- */
function interp(rows, z) {
  if (z <= rows[0][0]) return rows[0].slice(1);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (z >= a[0] && z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0] || 1), k = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      return [1, 2, 3, 4].map((j) => a[j] + (b[j] - a[j]) * k);
    }
  }
  return rows[rows.length - 1].slice(1);
}

function shell(g, spec) {
  const zs = new Set();
  const [zLo, zHi] = spec.shellRange || [-spec.L / 2, spec.L / 2];
  for (const r of spec.rows) zs.add(+r[0].toFixed(3));
  for (let z = zLo; z <= zHi + 1e-6; z += 0.16) zs.add(+z.toFixed(3));
  for (const w of spec.wheels) {
    if (w.x < 0) continue;
    for (let dz = -spec.arch - 0.06; dz <= spec.arch + 0.06; dz += 0.045) { const z = +(w.z + dz).toFixed(3); if (z >= zLo && z <= zHi) zs.add(z); }
  }
  const list = [...zs].sort((a, b) => a - b);
  const rings = [];
  for (const z of list) {
    let [y0, ym, y1, wm] = interp(spec.rows, z);
    for (const w of spec.wheels) {
      if (w.x < 0) continue;
      const dz = Math.abs(z - w.z);
      if (dz < spec.arch) y0 = Math.max(y0, w.y + Math.sqrt(spec.arch * spec.arch - dz * dz));
    }
    ym = Math.max(ym, y0 + 0.1);
    y1 = Math.max(y1, ym + 0.04);
    rings.push(ringZ(z, wm - spec.bevel, wm, wm - spec.tumble, y0, ym, y1));
  }
  loft(g, rings, WHITE, {});
}

// lofts 4 points : section [z, yb, yt, wb, wt]
function ring4(z, yb, yt, wb, wt) { return [[-wb, yb, z], [wb, yb, z], [wt, yt, z], [-wt, yt, z]]; }

function interior(d, o) {
  const x = 0.4, f = o.seatZ ?? 0.12, y = o.seatY ?? 0.6;
  for (const sx of [-1, 1]) {
    rbx(d, sx * x, y, f, 0.46, 0.14, 0.5, SEAT, 0.3);
    rbx(d, sx * x, y + 0.3, f - 0.26, 0.44, 0.6, 0.12, SEAT2, 0.25);
    rbx(d, sx * x, y + 0.66, f - 0.26, 0.2, 0.16, 0.09, SEAT, 0.3);
  }
  if (!o.noRear) {
    rbx(d, 0, y, f - 0.95, 1.3, 0.14, 0.5, SEAT, 0.3);
    rbx(d, 0, y + 0.28, f - 1.22, 1.28, 0.55, 0.12, SEAT2, 0.25);
  }
  // tableau de bord + volant
  const dz = o.dashZ ?? 0.62;
  rbx(d, 0, y + 0.3, dz, 1.5, 0.2, 0.34, DASH, 0.35);
  bx(d, 0, y + 0.16, dz - 0.15, 0.3, 0.28, 0.3, DASH);
  const c = [0.38, y + 0.38, dz - 0.2], nrm = V.norm([0, 0.55, -0.85]);
  const u = [1, 0, 0], v = V.cross(nrm, u);
  let prev = null;
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const p = V.add(c, V.add(V.mul(u, Math.cos(a) * 0.17), V.mul(v, Math.sin(a) * 0.17)));
    if (prev) limb(d, prev, p, 0.014, 0.014, TRIM, 5);
    prev = p;
  }
  limb(d, c, V.add(c, V.mul(u, 0.17)), 0.012, 0.012, TRIM, 5);
  limb(d, c, V.add(c, V.mul(u, -0.17)), 0.012, 0.012, TRIM, 5);
  limb(d, c, V.add(c, V.mul(nrm, 0.14)), 0.03, 0.03, TRIM, 6);
  // levier / console
  bx(d, 0, y + 0.08, f + 0.0, 0.2, 0.2, 0.5, DASH);
}

/* ---------------- Constructeur principal ---------------- */
export function buildCar(type) {
  const S = SPECS[type % SPECS.length];
  const paint = new Geo(false), detail = new Geo(false), glass = new Geo(false), lamps = new Geo(false), tails = new Geo(false);
  shell(paint, S);
  S.build({ paint, detail, glass, lamps, tails, S });
  // intérieur + dessous + chemins de roue
  interior(detail, S.interior || {});
  bx(detail, 0, 0.27, 0, S.W - 0.45, 0.12, S.L - 0.5, TRIM);
  for (const w of S.wheels) {
    if (w.x < 0) continue;
    for (const sd of [-1, 1]) bx(detail, sd * (S.W / 2 - 0.2), w.y, w.z, 0.03, w.y * 1.3, S.arch * 2 + 0.02, TRIM);
  }
  const wheels = S.wheels.map((w) => ({ ...w }));
  return { paint, detail, glass, lamps, tails, wheels, S };
}

/* ====================== Berline ====================== */
function sedan({ paint, detail, glass, lamps, tails }) {
  const GL = rgb(0x1b2733);
  // habitacle vitré
  loft(glass, [ring4(0.80, 0.9, 0.93, 0.8, 0.78), ring4(0.1, 0.9, 1.43, 0.8, 0.62), ring4(-0.88, 0.9, 1.45, 0.8, 0.62), ring4(-1.56, 0.9, 1.01, 0.8, 0.74), ring4(-1.7, 0.9, 0.96, 0.8, 0.78)], GL, {});
  // toit + montants peints
  loft(paint, [[[-0.636, 1.4, 0.04], [0.636, 1.4, 0.04], [0.636, 1.452, 0.04], [-0.636, 1.452, 0.04]], [[-0.636, 1.4, -0.92], [0.636, 1.4, -0.92], [0.636, 1.456, -0.92], [-0.636, 1.456, -0.92]]], WHITE, {});
  for (const s of [-1, 1]) {
    limb(paint, [s * 0.8, 0.93, 0.8], [s * 0.64, 1.43, 0.05], 0.03, 0.026, WHITE, 6);
    limb(paint, [s * 0.815, 0.93, -0.42], [s * 0.64, 1.43, -0.42], 0.028, 0.026, WHITE, 6);
    limb(paint, [s * 0.8, 0.95, -1.66], [s * 0.64, 1.44, -0.92], 0.05, 0.03, WHITE, 6);
    // rétroviseurs
    limb(paint, [s * 0.88, 0.97, 0.66], [s * 0.98, 1.0, 0.66], 0.014, 0.014, WHITE, 5);
    ellipsoid(paint, s * 1.03, 1.0, 0.66, 0.05, 0.05, 0.09, WHITE, 10, 6);
    ellipsoid(detail, s * 1.03, 1.0, 0.57, 0.04, 0.04, 0.01, rgb(0x303840), 8, 4);
    // poignées, joints de portes, bas de caisse
    for (const z of [0.3, -0.78]) bx(detail, s * 0.93, 0.88, z, 0.014, 0.028, 0.14, CHROME);
    for (const z of [0.72, -0.4, -1.3]) bx(detail, s * 0.928, 0.62, z, 0.006, 0.5, 0.008, TRIM);
    bx(detail, s * 0.928, 0.4, -0.3, 0.01, 0.012, 2.9, TRIM);
    bx(detail, s * 0.928, 0.32, -0.3, 0.05, 0.07, 3.3, TRIM2); // bas de caisse
    // phares
    ellipsoid(detail, s * 0.64, 0.66, 2.2, 0.17, 0.065, 0.09, TRIM, 12, 6);
    ellipsoid(lamps, s * 0.64, 0.665, 2.235, 0.14, 0.05, 0.05, WHITE, 12, 6);
    ellipsoid(detail, s * 0.54, 0.4, 2.28, 0.05, 0.035, 0.03, TRIM2, 8, 4);
    ellipsoid(lamps, s * 0.54, 0.4, 2.3, 0.035, 0.022, 0.015, WHITE, 8, 4);
    // feux arrière
    ellipsoid(tails, s * 0.68, 0.8, -2.26, 0.15, 0.06, 0.055, WHITE, 10, 5);
    bx(detail, s * 0.68, 0.74, -2.28, 0.3, 0.012, 0.04, TRIM2);
    // pare-chocs
    bx(detail, s * 0.62, 0.34, 2.27, 0.45, 0.14, 0.1, TRIM);
    bx(detail, s * 0.64, 0.34, -2.25, 0.4, 0.14, 0.1, TRIM);
    // échappement
    limb(detail, [s * 0.5, 0.27, -2.2], [s * 0.5, 0.26, -2.42], 0.04, 0.04, CHROME, 8);
  }
  bx(detail, 0, 0.36, 2.285, 0.55, 0.15, 0.1, TRIM); bx(detail, 0, 0.34, -2.265, 0.6, 0.14, 0.1, TRIM);
  // calandre
  bx(detail, 0, 0.55, 2.29, 0.95, 0.12, 0.03, TRIM);
  for (let i = 0; i < 3; i++) bx(detail, 0, 0.51 + i * 0.045, 2.31, 0.9, 0.012, 0.012, CHROME);
  bx(detail, 0, 0.7, 2.255, 0.12, 0.05, 0.012, CHROME); // logo
  bx(detail, 0, 0.4, 2.345, 0.52, 0.11, 0.012, rgb(0xeeeeea)); bx(detail, 0, 0.4, 2.352, 0.44, 0.06, 0.004, rgb(0x20262e));
  bx(detail, 0, 0.62, -2.305, 0.52, 0.11, 0.012, rgb(0xeeeeea)); bx(detail, 0, 0.62, -2.312, 0.44, 0.06, 0.004, rgb(0x20262e));
  // essuie-glaces + ailerons d'antenne
  for (const s of [-1, 1]) limb(detail, [s * 0.38 + 0.12, 0.945, 0.76], [s * 0.38 - 0.1, 1.07, 0.62], 0.008, 0.008, TRIM, 4);
  ellipsoid(detail, 0, 1.46, -0.78, 0.05, 0.028, 0.14, TRIM, 8, 5);
  bx(detail, 0, 0.88, -2.1, 0.5, 0.02, 0.3, TRIM2); // bouchon / coffre
  void paint;
}

/* ====================== Compacte ====================== */
function hatch({ paint, detail, glass, lamps, tails }) {
  const GL = rgb(0x1b2733);
  loft(glass, [ring4(0.62, 0.9, 0.93, 0.76, 0.74), ring4(-0.02, 0.9, 1.46, 0.76, 0.6), ring4(-1.05, 0.9, 1.48, 0.76, 0.6), ring4(-1.84, 0.9, 1.0, 0.76, 0.7)], GL, {});
  loft(paint, [[[-0.62, 1.43, -0.02], [0.62, 1.43, -0.02], [0.62, 1.49, -0.02], [-0.62, 1.49, -0.02]], [[-0.62, 1.43, -1.1], [0.62, 1.43, -1.1], [0.62, 1.495, -1.1], [-0.62, 1.495, -1.1]]], WHITE, {});
  for (const s of [-1, 1]) {
    limb(paint, [s * 0.77, 0.93, 0.66], [s * 0.6, 1.45, 0.0], 0.03, 0.026, WHITE, 6);
    limb(paint, [s * 0.78, 0.93, -0.55], [s * 0.62, 1.45, -0.55], 0.03, 0.026, WHITE, 6);
    limb(paint, [s * 0.77, 0.95, -1.84], [s * 0.62, 1.46, -1.1], 0.05, 0.034, WHITE, 6);
    limb(paint, [s * 0.84, 0.97, 0.58], [s * 0.93, 1.0, 0.58], 0.013, 0.013, WHITE, 5);
    ellipsoid(paint, s * 0.98, 1.0, 0.58, 0.046, 0.046, 0.08, WHITE, 10, 6);
    for (const z of [0.3, -0.7]) bx(detail, s * 0.88, 0.86, z, 0.014, 0.028, 0.12, CHROME);
    for (const z of [0.62, -0.5, -1.2]) bx(detail, s * 0.878, 0.62, z, 0.006, 0.5, 0.008, TRIM);
    bx(detail, s * 0.878, 0.32, -0.1, 0.05, 0.07, 2.8, TRIM2);
    ellipsoid(detail, s * 0.6, 0.64, 1.86, 0.16, 0.06, 0.08, TRIM, 12, 6);
    ellipsoid(lamps, s * 0.6, 0.645, 1.89, 0.13, 0.045, 0.045, WHITE, 12, 6);
    ellipsoid(tails, s * 0.64, 0.82, -1.92, 0.14, 0.07, 0.05, WHITE, 10, 5);
    bx(detail, s * 0.58, 0.34, 1.9, 0.42, 0.14, 0.09, TRIM);
    bx(detail, s * 0.6, 0.34, -1.9, 0.4, 0.14, 0.09, TRIM);
    limb(detail, [s * 0.45, 0.27, -1.85], [s * 0.45, 0.26, -2.05], 0.035, 0.035, CHROME, 8);
  }
  bx(detail, 0, 0.34, 1.91, 0.5, 0.14, 0.09, TRIM);
  bx(detail, 0, 0.52, 1.93, 0.85, 0.1, 0.03, TRIM);
  for (let i = 0; i < 2; i++) bx(detail, 0, 0.5 + i * 0.05, 1.95, 0.8, 0.012, 0.012, CHROME);
  bx(detail, 0, 0.4, 1.99, 0.5, 0.1, 0.012, rgb(0xeeeeea)); bx(detail, 0, 0.4, 1.996, 0.42, 0.055, 0.004, rgb(0x20262e));
  bx(detail, 0, 0.7, -1.98, 0.5, 0.1, 0.012, rgb(0xeeeeea)); bx(detail, 0, 0.7, -1.986, 0.42, 0.055, 0.004, rgb(0x20262e));
  bx(detail, 0, 0.98, -1.96, 0.78, 0.012, 0.012, TRIM); // joint de hayon
  limb(detail, [0.1, 1.49, -1.08], [0.1, 1.5, -1.5], 0.008, 0.008, TRIM, 4); // aileron
  void paint;
}

/* ====================== Fourgon ====================== */
function van({ paint, detail, glass, lamps, tails }) {
  const GL = rgb(0x1b2733);
  const box = (z0, z1, s) => ({ z0, z1, s });
  // caisse arrière (peinte), coins arrondis
  const ring = (z, k) => { const w = 0.99 * k, y0 = 1.04, y1 = 2.1; return [[-w, y0, z], [w, y0, z], [w, y1 - 0.18, z], [w - 0.14, y1, z], [-w + 0.14, y1, z], [-w, y1 - 0.18, z]]; };
  loft(paint, [ring(-2.58, 0.93), ring(-2.5, 0.985), ring(-2.0, 1), ring(0.2, 1), ring(0.6, 0.985), ring(0.66, 0.96)], WHITE, {});
  // cabine vitrée
  loft(glass, [ring4(2.0, 1.0, 1.04, 0.93, 0.92), ring4(1.35, 1.0, 1.5, 0.95, 0.9), ring4(0.8, 1.0, 2.04, 0.97, 0.9), ring4(0.2, 1.0, 2.06, 0.97, 0.92)], GL, {});
  // toit cabine + montants
  loft(paint, [[[-0.9, 2.02, 0.84], [0.9, 2.02, 0.84], [0.9, 2.08, 0.84], [-0.9, 2.08, 0.84]], [[-0.9, 2.02, 0.2], [0.9, 2.02, 0.2], [0.9, 2.08, 0.2], [-0.9, 2.08, 0.2]]], WHITE, {});
  for (const s of [-1, 1]) {
    limb(paint, [s * 0.95, 1.02, 1.95], [s * 0.88, 2.03, 0.82], 0.045, 0.04, WHITE, 6);
    limb(paint, [s * 0.98, 1.0, 0.42], [s * 0.92, 2.05, 0.42], 0.04, 0.04, WHITE, 6);
    limb(paint, [s * 1.0, 1.05, 1.9], [s * 1.07, 1.1, 1.92], 0.012, 0.012, WHITE, 5);
    // rétroviseurs
    limb(detail, [s * 0.98, 1.5, 1.45], [s * 1.18, 1.62, 1.42], 0.016, 0.016, TRIM, 5);
    bx(detail, s * 1.22, 1.62, 1.42, 0.07, 0.3, 0.16, TRIM);
    ellipsoid(detail, s * 1.185, 1.62, 1.42, 0.01, 0.13, 0.065, rgb(0x303840), 6, 4);
    // phares / feux
    ellipsoid(detail, s * 0.7, 0.8, 2.52, 0.2, 0.08, 0.06, TRIM, 12, 6);
    ellipsoid(lamps, s * 0.7, 0.8, 2.55, 0.17, 0.06, 0.04, WHITE, 12, 6);
    bx(tails, s * 0.9, 1.45, -2.56, 0.08, 0.6, 0.05, WHITE);
    bx(detail, s * 0.7, 0.4, 2.55, 0.5, 0.18, 0.1, TRIM);
    bx(detail, s * 0.7, 0.42, -2.58, 0.5, 0.2, 0.12, TRIM);
    bx(detail, s * 1.0, 0.6, 0.2, 0.02, 0.012, 3.9, TRIM2);
    bx(detail, s * 1.002, 0.34, -0.3, 0.06, 0.08, 4.6, TRIM2);
    for (const z of [1.55, 0.35, -1.3]) bx(detail, s * 1.0, 1.55, z, 0.01, 0.9, 0.01, TRIM);
    bx(detail, s * 1.002, 1.4, -0.52, 0.012, 0.03, 0.18, CHROME);
    limb(detail, [s * 0.5, 0.3, -2.5], [s * 0.5, 0.3, -2.7], 0.04, 0.04, CHROME, 8);
  }
  for (let i = 0; i < 5; i++) bx(detail, 0, 2.115, -2.3 + i * 0.55, 1.5, 0.025, 0.05, TRIM2); // barres de toit
  bx(detail, 0, 0.55, 2.55, 1.2, 0.14, 0.04, TRIM);
  bx(detail, 0, 0.7, 2.585, 0.7, 0.1, 0.02, CHROME);
  bx(detail, 0, 0.42, 2.62, 0.52, 0.11, 0.012, rgb(0xeeeeea)); bx(detail, 0, 0.42, 2.626, 0.44, 0.06, 0.004, rgb(0x20262e));
  bx(detail, 0, 1.55, -2.595, 0.01, 1.05, 0.01, TRIM); // jonction portes arrière
  bx(detail, 0, 0.64, -2.61, 0.52, 0.11, 0.012, rgb(0xeeeeea));
  bx(detail, 0, 0.84, -2.62, 0.3, 0.03, 0.02, TRIM);
  void box;
}

/* ====================== Jeep ====================== */
function jeep({ paint, detail, glass, lamps, tails, S }) {
  const GL = rgb(0x1b2733);
  // pare-brise droit + cadre
  loft(glass, [ring4(0.74, 1.0, 1.55, 0.82, 0.8), ring4(0.66, 1.0, 1.5, 0.82, 0.8)], GL, {});
  const OLIVE = WHITE;
  for (const s of [-1, 1]) {
    limb(paint, [s * 0.85, 0.98, 0.78], [s * 0.82, 1.58, 0.74], 0.03, 0.03, OLIVE, 6);
    limb(detail, [s * 0.88, 0.97, -0.5], [s * 0.78, 1.78, -0.5], 0.032, 0.032, TRIM, 6); // arceau
    limb(detail, [s * 0.9, 0.97, -0.5], [s * 0.9, 0.97, -1.7], 0.02, 0.02, TRIM, 5);
    limb(detail, [s * 0.9, 0.97, -1.7], [s * 0.78, 1.58, -1.7], 0.03, 0.03, TRIM, 6); // arceau arrière
    // phares ronds
    ellipsoid(detail, s * 0.62, 0.8, 1.98, 0.14, 0.14, 0.05, TRIM, 14, 8);
    ellipsoid(lamps, s * 0.62, 0.8, 2.02, 0.105, 0.105, 0.025, WHITE, 14, 6);
    ellipsoid(tails, s * 0.7, 0.76, -1.99, 0.07, 0.1, 0.03, WHITE, 8, 5);
    // ailes / clignotants / poignées
    bx(detail, s * 0.6, 0.62, 2.0, 0.1, 0.06, 0.03, rgb(0xd88a1a));
    bx(detail, s * 0.955, 0.8, 0.2, 0.012, 0.04, 0.2, STEEL);
    bx(detail, s * 0.955, 0.32, -0.1, 0.05, 0.08, 3.4, TRIM2);
    // rétroviseurs
    limb(detail, [s * 0.88, 1.2, 0.72], [s * 1.04, 1.28, 0.7], 0.012, 0.012, TRIM, 5);
    bx(detail, s * 1.06, 1.28, 0.7, 0.05, 0.15, 0.1, TRIM);
    // marchepieds / sangles
    bx(detail, s * 0.97, 0.4, -0.2, 0.08, 0.02, 1.4, TRIM2);
    limb(detail, [s * 0.5, 0.3, -1.9], [s * 0.5, 0.3, -2.1], 0.04, 0.04, CHROME, 8);
  }
  limb(detail, [-0.9, 1.78, -0.5], [0.9, 1.78, -0.5], 0.03, 0.03, TRIM, 6);
  limb(detail, [-0.78, 1.58, -1.7], [0.78, 1.58, -1.7], 0.025, 0.025, TRIM, 6);
  limb(detail, [-0.9, 0.97, -0.5], [0.78, 1.58, -1.7], 0.012, 0.012, TRIM, 5);
  limb(detail, [0.9, 0.97, -0.5], [-0.78, 1.58, -1.7], 0.012, 0.012, TRIM, 5);
  // cadre du pare-brise (haut et bas)
  bx(paint, 0, 1.56, 0.74, 1.66, 0.06, 0.07, OLIVE);
  bx(paint, 0, 1.0, 0.76, 1.68, 0.06, 0.08, OLIVE);
  // calandre à fentes
  bx(paint, 0, 0.78, 2.0, 1.15, 0.38, 0.03, OLIVE);
  for (let i = -3; i <= 3; i++) bx(detail, i * 0.14, 0.78, 2.02, 0.07, 0.3, 0.012, TRIM);
  // pare-chocs acier
  bx(detail, 0, 0.42, 2.06, 1.95, 0.15, 0.1, rgb(0x3b3f45));
  bx(detail, 0, 0.42, -2.04, 1.95, 0.15, 0.1, rgb(0x3b3f45));
  bx(detail, 0, 0.3, 2.07, 0.12, 0.12, 0.1, rgb(0x3b3f45));
  bx(detail, 0, 1.03, 1.15, 1.2, 0.025, 0.7, TRIM2); // charnière capot
  bx(detail, 0.45, 1.01, 1.98, 0.05, 0.05, 0.12, STEEL); // loquet
  // jerrycan + antenne + roue de secours
  rbx(detail, -0.6, 1.2, -1.95, 0.4, 0.5, 0.18, rgb(0x6a6e3a), 0.2);
  bx(detail, -0.6, 1.47, -1.95, 0.12, 0.04, 0.14, rgb(0x3a3d1a));
  limb(detail, [0.75, 0.98, -1.95], [0.78, 2.9, -1.9], 0.007, 0.004, TRIM, 4);
  bx(detail, 0, 0.82, -2.0, 0.22, 0.14, 0.012, rgb(0xdddddd));
  // étoile blanche sur le capot
  const c = [0.0, 1.035, 1.4]; const pts = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.1 : 0.22; pts.push([c[0] + Math.sin(a) * r, c[1], c[2] + Math.cos(a) * r]); }
  for (let i = 0; i < 10; i++) { const a = pts[i], b = pts[(i + 1) % 10]; const up = (b[0] - c[0]) * (a[2] - c[2]) - (b[2] - c[2]) * (a[0] - c[0]); if (up > 0) detail.tri(c, b, a, rgb(0xe8e6d8), null, [[0, 1, 0], [0, 1, 0], [0, 1, 0]]); else detail.tri(c, a, b, rgb(0xe8e6d8), null, [[0, 1, 0], [0, 1, 0], [0, 1, 0]]); }
  void S;
}

/* ====================== Camion ====================== */
function truck({ paint, detail, glass, lamps, tails }) {
  const GL = rgb(0x1b2733);
  // pare-brise haut, cabine avancée
  loft(glass, [ring4(3.58, 1.45, 1.55, 1.1, 1.08), ring4(3.3, 1.45, 2.65, 1.1, 1.0), ring4(1.7, 1.45, 2.7, 1.1, 1.0)], GL, {});
  loft(paint, [[[-1.02, 2.62, 3.34], [1.02, 2.62, 3.34], [1.02, 2.74, 3.34], [-1.02, 2.74, 3.34]], [[-1.02, 2.62, 1.55], [1.02, 2.62, 1.55], [1.02, 2.74, 1.55], [-1.02, 2.74, 1.55]]], WHITE, {});
  // déflecteur de toit
  loft(paint, [[[-1.05, 2.74, 1.6], [1.05, 2.74, 1.6], [1.05, 2.78, 1.6], [-1.05, 2.78, 1.6]], [[-1.05, 2.7, 1.1], [1.05, 2.7, 1.1], [1.05, 3.2, 1.1], [-1.05, 3.2, 1.1]]], WHITE, {});
  const CARGO = rgb(0xd9d7cf), CARGO2 = rgb(0x9a9890);
  // châssis
  for (const s of [-1, 1]) {
    bx(detail, s * 0.72, 0.78, -0.3, 0.16, 0.26, 7.2, TRIM);
    // réservoirs, garde-boue, marchepieds
    limb(detail, [s * 1.15, 0.82, 1.2], [s * 1.15, 0.82, -0.5], 0.33, 0.33, CHROME, 14);
    bx(detail, s * 1.12, 0.5, 1.1, 0.16, 0.03, 0.5, TRIM2);
    // phares
    ellipsoid(detail, s * 0.85, 1.0, 3.64, 0.2, 0.12, 0.07, TRIM, 12, 6);
    ellipsoid(lamps, s * 0.85, 1.0, 3.67, 0.17, 0.09, 0.04, WHITE, 12, 6);
    ellipsoid(tails, s * 1.0, 1.15, -3.55, 0.07, 0.35, 0.04, WHITE, 8, 6);
    // rétroviseurs
    limb(detail, [s * 1.1, 2.1, 3.3], [s * 1.4, 2.3, 3.2], 0.02, 0.02, TRIM, 5);
    bx(detail, s * 1.45, 2.3, 3.2, 0.08, 0.5, 0.22, TRIM);
    // marchepieds + poignées
    bx(detail, s * 1.15, 0.62, 2.45, 0.2, 0.03, 0.7, CHROME);
    bx(detail, s * 1.13, 1.7, 2.8, 0.014, 0.03, 0.16, CHROME);
    for (const z of [3.1, 1.8]) bx(detail, s * 1.1, 1.6, z, 0.008, 1.1, 0.008, TRIM);
    // garde-boue arrière
    for (const z of [-0.4, -1.8]) { bx(detail, s * 1.1, 1.1, z, 0.28, 0.04, 1.2, TRIM2); }
  }
  for (let i = 0; i < 4; i++) bx(lamps, -0.9 + i * 0.6, 3.28, 1.12, 0.14, 0.07, 0.04, rgb(0xff9a1a));
  // calandre chromée + pare-chocs
  bx(detail, 0, 0.95, 3.66, 1.4, 0.6, 0.05, TRIM);
  for (let i = 0; i < 5; i++) bx(detail, 0, 0.74 + i * 0.1, 3.7, 1.3, 0.03, 0.02, CHROME);
  bx(detail, 0, 0.5, 3.7, 2.3, 0.3, 0.14, rgb(0x2a2c30));
  bx(detail, 0, 0.38, 3.74, 0.6, 0.12, 0.012, rgb(0xeeeeea));
  bx(detail, 0, 1.3, 3.62, 1.2, 0.05, 0.04, rgb(0xd9a21b));
  // échappement vertical
  limb(detail, [-1.28, 0.9, 1.1], [-1.28, 3.0, 1.1], 0.06, 0.06, CHROME, 10);
  limb(detail, [-1.28, 3.0, 1.1], [-1.28, 3.12, 1.14], 0.07, 0.07, TRIM, 10);
  // caisse
  rbx(detail, 0, 2.1, -1.75, 2.48, 2.1, 5.4, CARGO, 0.07);
  bx(detail, 0, 1.15, -1.75, 2.2, 0.16, 5.3, CARGO2);
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) bx(detail, s * 1.245, 2.1, -4.2 + i * 0.6, 0.02, 2.05, 0.05, CARGO2);
  bx(detail, 0, 2.1, -4.46, 2.4, 2.0, 0.04, CARGO2);
  bx(detail, 0, 2.1, -4.47, 0.02, 2.0, 0.04, TRIM);
  for (const s of [-1, 1]) { bx(detail, s * 0.5, 1.45, -4.5, 0.6, 0.35, 0.04, TRIM2); bx(detail, s * 0.5, 2.1, -4.5, 0.04, 0.9, 0.04, CHROME); }
  bx(detail, 0, 1.0, -4.58, 2.3, 0.18, 0.18, rgb(0x3b3f45)); // pare-chocs arrière
  bx(detail, 0, 1.1, -4.67, 0.5, 0.11, 0.012, rgb(0xeeeeea));
  bx(detail, 0, 2.5, -1.75, 2.5, 0.4, 5.42, rgb(0x2a5ea8)); // bande bleue
  // pare-boue / garde-corps latéraux
  for (const s of [-1, 1]) bx(detail, s * 1.0, 0.92, -2.2, 0.03, 0.14, 3.2, TRIM2);
  void paint;
}

/* ---------------- Fiches techniques ---------------- */
// rows : [z, y0, ym, y1, demi-largeur max]
const SPECS = [
  {
    name: 'Berline', L: 4.6, W: 1.85, H: 1.45, bevel: 0.075, tumble: 0.04, arch: 0.39, vmax: 25, acc: 11,
    rows: [[-2.3, 0.42, 0.62, 0.82, 0.84], [-2.24, 0.3, 0.7, 0.95, 0.9], [-2.0, 0.27, 0.76, 0.98, 0.925], [-1.2, 0.26, 0.8, 0.97, 0.925], [-0.4, 0.26, 0.82, 0.94, 0.925], [0.7, 0.26, 0.82, 0.93, 0.925], [1.6, 0.26, 0.8, 0.88, 0.92], [2.05, 0.28, 0.72, 0.78, 0.905], [2.24, 0.32, 0.62, 0.68, 0.88], [2.3, 0.4, 0.56, 0.62, 0.84]],
    wheels: [{ x: 0.79, y: 0.33, z: 1.38, front: true, r: 0.345 }, { x: -0.79, y: 0.33, z: 1.38, front: true, r: 0.345 }, { x: 0.79, y: 0.33, z: -1.38, r: 0.345 }, { x: -0.79, y: 0.33, z: -1.38, r: 0.345 }],
    interior: { dashZ: 0.62, seatZ: 0.1 }, build: sedan,
  },
  {
    name: 'Compacte', L: 3.9, W: 1.74, H: 1.5, bevel: 0.07, tumble: 0.04, arch: 0.37, vmax: 27, acc: 13,
    rows: [[-1.95, 0.4, 0.62, 0.86, 0.8], [-1.9, 0.3, 0.7, 0.98, 0.85], [-1.5, 0.27, 0.78, 1.0, 0.87], [-0.4, 0.27, 0.8, 0.96, 0.87], [0.5, 0.27, 0.8, 0.92, 0.87], [1.3, 0.27, 0.78, 0.86, 0.865], [1.72, 0.28, 0.7, 0.76, 0.85], [1.88, 0.33, 0.6, 0.66, 0.83], [1.95, 0.4, 0.55, 0.6, 0.8]],
    wheels: [{ x: 0.74, y: 0.31, z: 1.2, front: true, r: 0.325 }, { x: -0.74, y: 0.31, z: 1.2, front: true, r: 0.325 }, { x: 0.74, y: 0.31, z: -1.15, r: 0.325 }, { x: -0.74, y: 0.31, z: -1.15, r: 0.325 }],
    interior: { dashZ: 0.58, seatZ: 0.05, noRear: false }, build: hatch,
  },
  {
    name: 'Fourgon', L: 5.2, W: 2.0, H: 2.1, bevel: 0.08, tumble: 0.03, arch: 0.42, vmax: 20, acc: 8,
    rows: [[-2.6, 0.45, 0.7, 1.0, 0.93], [-2.55, 0.32, 0.78, 1.08, 0.98], [-1.0, 0.3, 0.85, 1.1, 1.0], [1.0, 0.3, 0.85, 1.08, 1.0], [1.9, 0.3, 0.8, 0.95, 0.99], [2.45, 0.33, 0.65, 0.72, 0.97], [2.6, 0.42, 0.58, 0.64, 0.92]],
    wheels: [{ x: 0.86, y: 0.36, z: 1.7, front: true, r: 0.375, k: 1.1 }, { x: -0.86, y: 0.36, z: 1.7, front: true, r: 0.375, k: 1.1 }, { x: 0.86, y: 0.36, z: -1.5, r: 0.375, k: 1.1 }, { x: -0.86, y: 0.36, z: -1.5, r: 0.375, k: 1.1 }],
    interior: { dashZ: 1.75, seatZ: 1.2, seatY: 0.75, noRear: true }, build: van,
  },
  {
    name: 'Jeep', L: 4.0, W: 1.9, H: 1.9, bevel: 0.06, tumble: 0.02, arch: 0.46, vmax: 22, acc: 12,
    rows: [[-2.0, 0.42, 0.7, 0.95, 0.9], [-1.95, 0.35, 0.76, 1.0, 0.94], [-1.0, 0.35, 0.78, 1.0, 0.95], [0.2, 0.35, 0.8, 1.0, 0.95], [0.5, 0.35, 0.82, 0.98, 0.94], [1.5, 0.35, 0.82, 0.96, 0.94], [1.9, 0.36, 0.7, 0.85, 0.93], [2.0, 0.4, 0.6, 0.8, 0.9]],
    wheels: [{ x: 0.82, y: 0.38, z: 1.28, front: true, r: 0.38, k: 1.1 }, { x: -0.82, y: 0.38, z: 1.28, front: true, r: 0.38, k: 1.1 }, { x: 0.82, y: 0.38, z: -1.15, r: 0.38, k: 1.1 }, { x: -0.82, y: 0.38, z: -1.15, r: 0.38, k: 1.1 }],
    interior: { dashZ: 0.5, seatZ: 0.0, seatY: 0.62 }, build: jeep,
  },
  {
    name: 'Camion', L: 7.6, W: 2.5, H: 3.2, bevel: 0.1, tumble: 0.05, arch: 0.62, vmax: 17, acc: 6,
    rows: [[1.3, 0.6, 1.1, 1.5, 1.1], [3.55, 0.6, 1.1, 1.55, 1.1], [3.65, 0.55, 1.0, 1.45, 1.05], [3.7, 0.55, 0.95, 1.4, 1.0]],
    wheels: [{ x: 1.0, y: 0.52, z: 2.7, front: true, r: 0.52, k: 1.55 }, { x: -1.0, y: 0.52, z: 2.7, front: true, r: 0.52, k: 1.55 }, { x: 1.0, y: 0.52, z: -0.5, r: 0.52, k: 1.55 }, { x: -1.0, y: 0.52, z: -0.5, r: 0.52, k: 1.55 }, { x: 1.0, y: 0.52, z: -1.9, r: 0.52, k: 1.55 }, { x: -1.0, y: 0.52, z: -1.9, r: 0.52, k: 1.55 }],
    interior: { dashZ: 3.1, seatZ: 2.5, seatY: 1.2, noRear: true }, build: truck, shellRange: [1.3, 3.7],
  },
];
export const CAR_TYPES = SPECS.map((s) => ({ name: s.name, L: s.L, W: s.W, H: s.H, vmax: s.vmax, acc: s.acc }));
