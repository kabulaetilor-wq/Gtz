// Construit un bâtiment à partir de sa spécification (issue des fichiers de la carte).
// spec = [kind, x, z, w, d, floors, roofType, wallHex, roofHex, featureFlags, seed, rot, y, texture]
import { Geo, rgb, shade, box, wallBox, prism, hip, pyramid, cylinder, dome, sawtooth } from './meshbuilder.js';

export const K = {
  HOUSE: 0, VILLA: 1, APT: 2, SHOP: 3, OFFICE: 4, SKYSCRAPER: 5, WAREHOUSE: 6, FACTORY: 7, BARN: 8,
  FARMHOUSE: 9, CHURCH: 10, SCHOOL: 11, HOSPITAL: 12, TOWNHALL: 13, BARRACKS: 14, BUNKER: 15,
  WATCHTOWER: 16, HANGAR: 17, CABIN: 18, BOATHOUSE: 19, LIGHTHOUSE: 20, SILO: 21, WINDMILL: 22,
  HUT: 23, RUIN: 24, GAS: 25, HOTEL: 26, MARKET: 27, MAST: 28, FIRE: 29, TANKS: 30, CONTAINERS: 31,
};
const F = {
  CHIMNEY: 1, BALCONY: 2, PORCH: 4, GARAGE: 8, DORMER: 16, ANTENNA: 32, SOLAR: 64, AWNING: 128,
  SIGN: 256, TANK: 512, DISH: 1024, SHUTTERS: 2048, TIERS: 4096, SPIRE: 8192, CHIMNEYSTACK: 16384, FENCE: 32768,
};

const FH = 3.2;
const C = {
  concrete: rgb(0x8f8c84), dark: rgb(0x2a343b), glass: rgb(0x9cc2d6), brick: rgb(0x8f5442), white: rgb(0xf0eee6),
  metal: rgb(0x8a9094), black: rgb(0x1c1c1e), wood: rgb(0x6b4a2e), door: rgb(0x4a3526), red: rgb(0xa8321f),
};
const AWN = [0xb0372c, 0x2f5f9a, 0x2a7a4a, 0xd9a93a, 0x7a3f8a, 0xc96a22];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSink() {
  return { s: new Geo(false), w: [new Geo(true), new Geo(true), new Geo(true), new Geo(true)], boxes: [] };
}

/* ---------------- Aides ---------------- */

function sbox(ctx, x0, y0, z0, x1, y1, z1, col, top) { box(ctx.S, x0, y0, z0, x1, y1, z1, col, top); }

function mass(ctx, w, d, h, y0 = 0, col = ctx.wall) {
  const hw = w / 2, hd = d / 2;
  if (y0 === 0) sbox(ctx, -hw - 0.1, -2.6, -hd - 0.1, hw + 0.1, 0.35, hd + 0.1, C.concrete);
  wallBox(ctx.W, -hw, y0, -hd, hw, y0 + h, hd, col);
}

// Porte (quad sombre sur la face avant +z)
function door(ctx, cx, wd, ht, d, col = C.door) {
  const z = d / 2 + 0.04;
  ctx.S.quad([cx - wd / 2, 0.02, z], [cx + wd / 2, 0.02, z], [cx + wd / 2, ht, z], [cx - wd / 2, ht, z], col);
}

// Toit. Retourne { top, rise, axis, type }
function roofOn(ctx, type, w, d, y, colOverride) {
  const S = ctx.S;
  const hw = w / 2, hd = d / 2;
  const rc = colOverride || ctx.roofC;
  const wc = ctx.wall;
  const minD = Math.min(w, d);
  const axis = w >= d ? 'x' : 'z';
  const over = 0.45;
  const L = (axis === 'x' ? w : d) / 2 + over;
  const half = minD / 2 + over;
  const info = { top: y, rise: 0, axis, type, w, d };
  switch (type) {
    case 1: {
      const rise = minD * 0.34;
      prism(S, [[half, 0], [0, rise], [-half, 0]], -L, L, axis, y, rc, wc);
      info.rise = rise;
      break;
    }
    case 2: {
      const rise = minD * 0.3;
      hip(S, -hw, y, -hd, hw, hd, rise, rc);
      info.rise = rise;
      break;
    }
    case 3: {
      const rise = minD * 0.22;
      prism(S, [[half, 0], [-half, rise], [-half, 0]], -L, L, axis, y, rc, wc);
      info.rise = rise * 0.6;
      break;
    }
    case 5: {
      sbox(ctx, -hw - 0.2, y, -hd - 0.2, hw + 0.2, y + 0.3, hd + 0.2, rc);
      const r = minD * 0.5;
      dome(S, 0, y + 0.3, 0, r, r * 0.85, 12, rc);
      info.rise = r * 0.85;
      info.top = y + 0.3;
      break;
    }
    case 6: {
      sawtooth(S, -hw - 0.2, y, -hd, hw + 0.2, hd, 2.0, rc, C.glass, Math.max(2, Math.round(d / 5)));
      info.rise = 0;
      info.top = y;
      break;
    }
    case 7: {
      const rise = minD * 0.42;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const a = (Math.PI * i) / 8;
        pts.push([Math.cos(a) * half, Math.sin(a) * rise]);
      }
      prism(S, pts, -L, L, axis, y, rc, wc);
      info.rise = rise;
      break;
    }
    case 8: {
      const rise = minD * 0.7;
      pyramid(S, 0, y, 0, w + 0.9, d + 0.9, rise, rc);
      info.rise = rise;
      break;
    }
    case 9: {
      const rise = minD * 0.42;
      prism(S, [[half, 0], [half * 0.58, rise * 0.68], [0, rise], [-half * 0.58, rise * 0.68], [-half, 0]], -L, L, axis, y, rc, wc);
      info.rise = rise;
      break;
    }
    case 10: {
      sbox(ctx, -hw - 0.1, y, -hd - 0.1, hw + 0.1, y + 0.25, hd + 0.1, rc);
      const t = 0.35, ph = 0.9;
      sbox(ctx, -hw - 0.1, y + 0.25, hd - t, hw + 0.1, y + 0.25 + ph, hd + 0.1, wc);
      sbox(ctx, -hw - 0.1, y + 0.25, -hd - 0.1, hw + 0.1, y + 0.25 + ph, -hd + t, wc);
      sbox(ctx, -hw - 0.1, y + 0.25, -hd + t, -hw + t - 0.1, y + 0.25 + ph, hd - t, wc);
      sbox(ctx, hw - t + 0.1, y + 0.25, -hd + t, hw + 0.1, y + 0.25 + ph, hd - t, wc);
      info.top = y + 0.25;
      break;
    }
    case 11: {
      sbox(ctx, -hw - 0.2, y, -hd - 0.2, hw + 0.2, y + 0.3, hd + 0.2, rc);
      const b1 = [w * 0.62, d * 0.62], b2 = [w * 0.3, d * 0.3];
      sbox(ctx, -b1[0] / 2, y + 0.3, -b1[1] / 2, b1[0] / 2, y + 3.1, b1[1] / 2, C.concrete, rc);
      sbox(ctx, -b2[0] / 2, y + 3.1, -b2[1] / 2, b2[0] / 2, y + 5.0, b2[1] / 2, C.concrete, rc);
      info.top = y + 0.3;
      info.rise = 0;
      break;
    }
    default: { // 0 : toit plat avec corniche
      sbox(ctx, -hw - 0.25, y, -hd - 0.25, hw + 0.25, y + 0.35, hd + 0.25, rc);
      info.top = y + 0.35;
    }
  }
  return info;
}

/* ---------------- Éléments additionnels ---------------- */

function chimney(ctx, info) {
  const { rnd } = ctx;
  const flat = info.type === 0 || info.type === 10 || info.type === 11;
  let cx, cz, y0, y1;
  if (flat) {
    cx = (rnd() < 0.5 ? -1 : 1) * info.w * 0.3; cz = (rnd() < 0.5 ? -1 : 1) * info.d * 0.3;
    y0 = info.top; y1 = info.top + 1.6;
  } else if (info.type === 5 || info.type === 6 || info.type === 7 || info.type === 8) return;
  else if (info.axis === 'x') { cx = (rnd() < 0.5 ? -1 : 1) * info.w * 0.28; cz = -info.d * 0.06; y0 = info.top + info.rise * 0.5; y1 = info.top + info.rise + 1.3; }
  else { cx = -info.w * 0.06; cz = (rnd() < 0.5 ? -1 : 1) * info.d * 0.28; y0 = info.top + info.rise * 0.5; y1 = info.top + info.rise + 1.3; }
  sbox(ctx, cx - 0.4, y0, cz - 0.4, cx + 0.4, y1, cz + 0.4, C.brick, C.black);
  sbox(ctx, cx - 0.5, y1 - 0.15, cz - 0.5, cx + 0.5, y1, cz + 0.5, C.concrete);
}

function porch(ctx, w, d) {
  const pw = Math.min(w * 0.4, 4.6), hd = d / 2, pd = 1.9;
  const cx = ctx.rnd() < 0.5 ? -w * 0.15 : w * 0.15;
  sbox(ctx, cx - pw / 2, 0, hd, cx + pw / 2, 0.2, hd + pd, C.concrete);
  sbox(ctx, cx - pw / 2 - 0.2, 2.7, hd, cx + pw / 2 + 0.2, 2.9, hd + pd + 0.2, ctx.roofC);
  sbox(ctx, cx - pw / 2, 0.2, hd + pd - 0.2, cx - pw / 2 + 0.15, 2.7, hd + pd - 0.05, C.white);
  sbox(ctx, cx + pw / 2 - 0.15, 0.2, hd + pd - 0.2, cx + pw / 2, 2.7, hd + pd - 0.05, C.white);
  door(ctx, cx, 1.1, 2.15, d);
}

function garage(ctx, w, d) {
  const side = ctx.rnd() < 0.5 ? 1 : -1;
  const gw = 3.6, gd = d * 0.72, gh = 2.8;
  const x0 = side > 0 ? w / 2 : -w / 2 - gw, x1 = x0 + gw;
  const z1 = d / 2, z0 = z1 - gd;
  sbox(ctx, x0, -0.2, z0, x1, gh, z1, shade(ctx.wall, 0.95), ctx.roofC);
  const z = z1 + 0.04;
  ctx.S.quad([x0 + 0.4, 0.02, z], [x1 - 0.4, 0.02, z], [x1 - 0.4, 2.25, z], [x0 + 0.4, 2.25, z], rgb(0xd8d8d0));
  for (let k = 1; k < 5; k++) {
    ctx.S.quad([x0 + 0.4, k * 0.45, z + 0.01], [x1 - 0.4, k * 0.45, z + 0.01], [x1 - 0.4, k * 0.45 + 0.05, z + 0.01], [x0 + 0.4, k * 0.45 + 0.05, z + 0.01], rgb(0x9a9a92));
  }
  ctx.boxes.push([x0, 0, z0, x1, gh, z1]);
}

function dormer(ctx, info) {
  if (info.axis !== 'x' || (info.type !== 1 && info.type !== 9)) return;
  const hh = info.d / 2 + 0.45;
  const zf = info.d * 0.2;
  const yr = info.top + info.rise * (1 - zf / hh);
  const n = info.w > 12 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const cx = n === 1 ? (ctx.rnd() - 0.5) * info.w * 0.3 : (i === 0 ? -1 : 1) * info.w * 0.22;
    sbox(ctx, cx - 0.8, yr - 0.4, zf - 0.9, cx + 0.8, yr + 1.5, zf + 0.35, ctx.wall);
    prism(ctx.S, [[cx + 1.1, 0], [cx, 0.8], [cx - 1.1, 0]], zf - 1.1, zf + 0.55, 'z', yr + 1.5, ctx.roofC, ctx.wall);
    const z = zf + 0.37;
    ctx.S.quad([cx - 0.5, yr + 0.1, z], [cx + 0.5, yr + 0.1, z], [cx + 0.5, yr + 1.2, z], [cx - 0.5, yr + 1.2, z], C.dark);
  }
}

function antenna(ctx, info, hgt = 3.5) {
  const x = (ctx.rnd() - 0.5) * info.w * 0.5, z = (ctx.rnd() - 0.5) * info.d * 0.5;
  const y = info.top + (info.type === 1 || info.type === 2 || info.type === 9 ? info.rise * 0.6 : 0);
  sbox(ctx, x - 0.05, y, z - 0.05, x + 0.05, y + hgt, z + 0.05, C.metal);
  sbox(ctx, x - 0.6, y + hgt * 0.7, z - 0.03, x + 0.6, y + hgt * 0.7 + 0.05, z + 0.03, C.metal);
  sbox(ctx, x - 0.4, y + hgt * 0.85, z - 0.03, x + 0.4, y + hgt * 0.85 + 0.05, z + 0.03, C.metal);
}

function solar(ctx, info) {
  if (info.type !== 0 && info.type !== 10) return;
  const n = 2 + Math.floor(ctx.rnd() * 3);
  for (let i = 0; i < n; i++) {
    const x = -info.w * 0.3 + i * 2.1;
    if (Math.abs(x) > info.w / 2 - 1.2) continue;
    prism(ctx.S, [[0.7, 0], [-0.7, 0.55], [-0.7, 0]], x - 1.0, x + 1.0, 'x', info.top + 0.1, rgb(0x1f3a5a), C.metal);
  }
}

function awning(ctx, w, d) {
  const cols = [AWN[Math.floor(ctx.rnd() * AWN.length)], 0xf0eee6];
  const n = Math.max(2, Math.round(w / 1.5));
  const sw = w / n, z = d / 2;
  for (let i = 0; i < n; i++) {
    const c = rgb(cols[i % 2]);
    const x0 = -w / 2 + i * sw, x1 = x0 + sw;
    ctx.S.quad([x0, 2.7, z + 1.4], [x1, 2.7, z + 1.4], [x1, 3.25, z], [x0, 3.25, z], c);
    ctx.S.quad([x0, 2.45, z + 1.4], [x1, 2.45, z + 1.4], [x1, 2.7, z + 1.4], [x0, 2.7, z + 1.4], c);
  }
}

function signBoard(ctx, info, wallMounted) {
  const w = info.w, d = info.d;
  const col = rgb(AWN[Math.floor(ctx.rnd() * AWN.length)]);
  if (wallMounted) {
    sbox(ctx, -w * 0.3, 3.5, d / 2, w * 0.3, 4.4, d / 2 + 0.15, col);
    sbox(ctx, -w * 0.26, 3.65, d / 2 + 0.15, w * 0.26, 4.25, d / 2 + 0.2, C.white);
  } else {
    const x = (ctx.rnd() - 0.5) * w * 0.4, z = d / 2 - 0.6, y = info.top;
    sbox(ctx, x - 1.8, y + 1.0, z, x + 1.8, y + 2.4, z + 0.25, col);
    sbox(ctx, x - 1.6, y + 1.2, z + 0.25, x + 1.6, y + 2.2, z + 0.3, C.white);
    sbox(ctx, x - 1.5, y, z, x - 1.4, y + 1.0, z + 0.15, C.metal);
    sbox(ctx, x + 1.4, y, z, x + 1.5, y + 1.0, z + 0.15, C.metal);
  }
}

function waterTank(ctx, info) {
  if (info.type !== 0 && info.type !== 10 && info.type !== 11) return;
  const x = (ctx.rnd() < 0.5 ? -1 : 1) * info.w * 0.25, z = (ctx.rnd() < 0.5 ? -1 : 1) * info.d * 0.25, y = info.top;
  for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) sbox(ctx, x + lx - 0.08, y, z + lz - 0.08, x + lx + 0.08, y + 1.2, z + lz + 0.08, C.metal);
  cylinder(ctx.S, x, y + 1.2, z, 1.25, 1.25, 2.0, 10, rgb(0x8a6a4a), rgb(0x6a4f36));
  cylinder(ctx.S, x, y + 3.2, z, 1.3, 0.05, 0.7, 10, rgb(0x59616a), null);
}

function dish(ctx, info) {
  const x = (ctx.rnd() - 0.5) * info.w * 0.6, z = (ctx.rnd() - 0.5) * info.d * 0.6, y = info.top;
  sbox(ctx, x - 0.06, y, z - 0.06, x + 0.06, y + 1.1, z + 0.06, C.metal);
  dome(ctx.S, x, y + 1.1, z, 0.8, 0.35, 8, C.white);
}

function balconies(ctx, w, d, fl) {
  const n = Math.max(1, Math.floor(w / 4.6));
  const z = d / 2;
  for (let f = 1; f < fl; f++) {
    for (let i = 0; i < n; i++) {
      if (ctx.rnd() < 0.2) continue;
      const cx = -w / 2 + (w * (i + 0.5)) / n;
      const y = f * FH;
      sbox(ctx, cx - 0.85, y - 0.05, z, cx + 0.85, y + 0.12, z + 1.1, C.concrete);
      sbox(ctx, cx - 0.85, y + 0.12, z + 1.0, cx + 0.85, y + 1.05, z + 1.06, rgb(0x384046));
    }
  }
}

function frontFence(ctx, w, d) {
  const z = d / 2 + 4.2, hw = w / 2 + 3;
  sbox(ctx, -hw, 0, z, hw, 0.95, z + 0.14, rgb(0xd8d2c0), rgb(0xe8e2d0));
  sbox(ctx, -hw, 0, 2 - d / 2, -hw + 0.14, 0.95, z, rgb(0xd8d2c0), rgb(0xe8e2d0));
  sbox(ctx, hw - 0.14, 0, 2 - d / 2, hw, 0.95, z, rgb(0xd8d2c0), rgb(0xe8e2d0));
}

/* ---------------- Types « standards » ---------------- */

function addFeatures(ctx, info, w, d, h, fl) {
  const f = ctx.feat;
  if (f & F.CHIMNEY) chimney(ctx, info);
  if (f & F.DORMER) dormer(ctx, info);
  if (f & F.ANTENNA) antenna(ctx, info);
  if (f & F.SOLAR) solar(ctx, info);
  if (f & F.TANK) waterTank(ctx, info);
  if (f & F.DISH) dish(ctx, info);
  if (f & F.AWNING) awning(ctx, w, d);
  if (f & F.SIGN) signBoard(ctx, info, ctx.tex === 3);
  if (f & F.BALCONY && fl > 1) balconies(ctx, w, d, fl);
  if (f & F.PORCH && fl <= 3 && w > 7) porch(ctx, w, d);
  if (f & F.GARAGE && w > 8) garage(ctx, w, d);
  if (f & F.FENCE) frontFence(ctx, w, d);
}

function standard(ctx, o = {}) {
  const { w, d, fl } = ctx;
  const fh = o.fh || FH;
  const h = fl * fh;
  mass(ctx, w, d, h);
  const info = roofOn(ctx, ctx.roofT, w, d, h);
  if (o.door !== false) {
    if (o.bigDoor) {
      const dw = Math.min(w * 0.6, 7);
      ctx.S.quad([-dw / 2, 0.02, d / 2 + 0.04], [dw / 2, 0.02, d / 2 + 0.04], [dw / 2, fh * 0.8, d / 2 + 0.04], [-dw / 2, fh * 0.8, d / 2 + 0.04], rgb(0x39434a));
      for (let k = 1; k < 4; k++) ctx.S.quad([-dw / 2 + (dw * k) / 4, 0.02, d / 2 + 0.05], [-dw / 2 + (dw * k) / 4 + 0.08, 0.02, d / 2 + 0.05], [-dw / 2 + (dw * k) / 4 + 0.08, fh * 0.8, d / 2 + 0.05], [-dw / 2 + (dw * k) / 4, fh * 0.8, d / 2 + 0.05], rgb(0x20262a));
    } else if (!(ctx.feat & F.PORCH)) door(ctx, (ctx.rnd() - 0.5) * w * 0.3, 1.2, 2.2, d);
  }
  addFeatures(ctx, info, w, d, h, fl);
  if (o.extra) o.extra(ctx, info, h);
  ctx.boxes.push([-w / 2, 0, -d / 2, w / 2, h + info.rise * 0.5 + 0.4, d / 2]);
}

/* ---------------- Types spéciaux ---------------- */

function tower(ctx) { // gratte-ciel / immeuble de bureaux avec retraits
  const { w, d, fl } = ctx;
  const h = fl * FH;
  const tiers = (ctx.feat & F.TIERS) && fl >= 10;
  const t1 = tiers ? Math.floor(fl * 0.25) * FH : 0;
  const hMain = h - t1;
  if (fl >= 14) {
    // podium
    const pw = w * 1.08, pd = d * 1.08;
    mass(ctx, pw, pd, FH * 2, 0, shade(ctx.wall, 0.9));
    sbox(ctx, -pw / 2 - 0.2, FH * 2, -pd / 2 - 0.2, pw / 2 + 0.2, FH * 2 + 0.3, pd / 2 + 0.2, C.concrete);
    wallBox(ctx.W, -w / 2, FH * 2 + 0.3, -d / 2, w / 2, hMain, d / 2, ctx.wall);
  } else {
    mass(ctx, w, d, hMain);
  }
  let top = h;
  if (tiers) {
    // retrait : le sommet est un volume plus étroit posé sur le corps principal
    const topStart = hMain;
    sbox(ctx, -w / 2 - 0.2, topStart, -d / 2 - 0.2, w / 2 + 0.2, topStart + 0.3, d / 2 + 0.2, C.concrete);
    wallBox(ctx.W, -w * 0.3, topStart + 0.3, -d * 0.3, w * 0.3, topStart + 0.3 + t1 * 0.9, d * 0.3, ctx.wall);
    top = topStart + 0.3 + t1 * 0.9;
    const info = roofOn(ctx, 0, w * 0.6, d * 0.6, top);
    if (ctx.feat & F.SPIRE) pyramid(ctx.S, 0, info.top, 0, 1.6, 1.6, 10 + ctx.rnd() * 8, C.metal);
    if (ctx.feat & F.ANTENNA) antenna(ctx, info, 6);
    ctx.boxes.push([-w / 2, 0, -d / 2, w / 2, topStart, d / 2]);
    ctx.boxes.push([-w * 0.3, topStart, -d * 0.3, w * 0.3, top, d * 0.3]);
    door(ctx, 0, 3.2, 3.0, d, rgb(0x20323c));
    return;
  }
  const info = roofOn(ctx, ctx.roofT === 3 ? 0 : ctx.roofT, w, d, top);
  if (ctx.feat & F.SPIRE) pyramid(ctx.S, 0, info.top + info.rise, 0, 1.4, 1.4, 8 + ctx.rnd() * 8, C.metal);
  if (ctx.feat & F.ANTENNA) antenna(ctx, info, 5);
  if (ctx.feat & F.DISH) dish(ctx, info);
  if (ctx.feat & F.TANK) waterTank(ctx, info);
  door(ctx, 0, 3.2, 3.0, d, rgb(0x20323c));
  ctx.boxes.push([-w / 2, 0, -d / 2, w / 2, top + info.rise * 0.5, d / 2]);
}

function church(ctx) {
  const { w, d } = ctx;
  const h = 8.5;
  mass(ctx, w, d, h);
  const info = roofOn(ctx, 1, w, d, h);
  // tour-clocher en façade
  const tw = Math.min(5, w * 0.45), th = h + 7;
  const tz = d / 2 - tw / 2 + 0.2;
  wallBox(ctx.W, -tw / 2, 0, tz - tw / 2, tw / 2, th, tz + tw / 2, ctx.wall);
  sbox(ctx, -tw / 2 - 0.2, th, tz - tw / 2 - 0.2, tw / 2 + 0.2, th + 0.3, tz + tw / 2 + 0.2, ctx.roofC);
  pyramid(ctx.S, 0, th + 0.3, tz, tw + 0.6, tw + 0.6, 9, ctx.roofC);
  sbox(ctx, -0.07, th + 9.3, tz - 0.07, 0.07, th + 11.3, tz + 0.07, rgb(0xd4b24a));
  sbox(ctx, -0.6, th + 10.4, tz - 0.07, 0.6, th + 10.55, tz + 0.07, rgb(0xd4b24a));
  // ouïes du clocher
  const z = tz + tw / 2 + 0.03;
  ctx.S.quad([-0.7, th - 3.2, z], [0.7, th - 3.2, z], [0.7, th - 1.0, z], [-0.7, th - 1.0, z], C.dark);
  // grande porte
  ctx.S.quad([-1.2, 0.02, z], [1.2, 0.02, z], [1.2, 3.4, z], [-1.2, 3.4, z], C.door);
  ctx.boxes.push([-w / 2, 0, -d / 2, w / 2, h + info.rise * 0.5, d / 2]);
  ctx.boxes.push([-tw / 2, 0, tz - tw / 2, tw / 2, th, tz + tw / 2]);
}

function townhall(ctx) {
  const { w, d, fl } = ctx;
  const h = fl * 4.0;
  mass(ctx, w, d, h);
  const info = roofOn(ctx, ctx.roofT === 5 ? 0 : ctx.roofT, w, d, h);
  // portique à colonnes + fronton
  const n = 4, pw = Math.min(w * 0.55, 10), z0 = d / 2, pd = 2.6;
  sbox(ctx, -pw / 2 - 0.4, 0, z0, pw / 2 + 0.4, 0.5, z0 + pd + 0.2, C.concrete);
  for (let i = 0; i < n; i++) cylinder(ctx.S, -pw / 2 + (pw * i) / (n - 1), 0.5, z0 + pd - 0.2, 0.38, 0.34, 5.2, 8, C.white, C.white);
  sbox(ctx, -pw / 2 - 0.4, 5.7, z0, pw / 2 + 0.4, 6.2, z0 + pd + 0.3, C.white);
  prism(ctx.S, [[pw / 2 + 0.6, 0], [0, 1.6], [-pw / 2 - 0.6, 0]], z0, z0 + pd + 0.3, 'z', 6.2, C.white, C.white);
  door(ctx, 0, 2.4, 3.4, d + pd * 2 - 0.4, C.door);
  // beffroi
  const bw = 3.6, by = h + info.rise * 0.2;
  wallBox(ctx.W, -bw / 2, by, -bw / 2, bw / 2, by + 6, bw / 2, ctx.wall);
  sbox(ctx, -bw / 2 - 0.2, by + 6, -bw / 2 - 0.2, bw / 2 + 0.2, by + 6.3, bw / 2 + 0.2, ctx.roofC);
  pyramid(ctx.S, 0, by + 6.3, 0, bw + 0.5, bw + 0.5, 4.5, ctx.roofC);
  const z = bw / 2 + 0.04;
  cylinder(ctx.S, 0, by + 3.2, z, 1.0, 1.0, 0.06, 12, C.white, C.white);
  ctx.boxes.push([-w / 2, 0, -d / 2, w / 2, h + 2, d / 2]);
  ctx.boxes.push([-bw / 2, h, -bw / 2, bw / 2, by + 10, bw / 2]);
}

function hospital(ctx) {
  standard(ctx, {
    extra(c, info) {
      // croix rouge sur la façade
      const z = c.d / 2 + 0.06, y = c.fl * FH - 1.6;
      c.S.quad([-1.2, y - 1.2, z], [1.2, y - 1.2, z], [1.2, y + 1.2, z], [-1.2, y + 1.2, z], C.white);
      c.S.quad([-0.3, y - 1.0, z + 0.01], [0.3, y - 1.0, z + 0.01], [0.3, y + 1.0, z + 0.01], [-0.3, y + 1.0, z + 0.01], rgb(0xc42a2a));
      c.S.quad([-1.0, y - 0.3, z + 0.01], [1.0, y - 0.3, z + 0.01], [1.0, y + 0.3, z + 0.01], [-1.0, y + 0.3, z + 0.01], rgb(0xc42a2a));
      // héliport sur le toit
      if (info.type === 0) {
        sbox(c, -3, info.top, -3, 3, info.top + 0.1, 3, rgb(0x4a4f52));
        c.S.quad([-1.5, info.top + 0.11, -1.8], [-0.9, info.top + 0.11, -1.8], [-0.9, info.top + 0.11, 1.8], [-1.5, info.top + 0.11, 1.8], C.white);
        c.S.quad([0.9, info.top + 0.11, -1.8], [1.5, info.top + 0.11, -1.8], [1.5, info.top + 0.11, 1.8], [0.9, info.top + 0.11, 1.8], C.white);
        c.S.quad([-0.9, info.top + 0.11, -0.3], [0.9, info.top + 0.11, -0.3], [0.9, info.top + 0.11, 0.3], [-0.9, info.top + 0.11, 0.3], C.white);
      }
    },
  });
}

function fireStation(ctx) {
  standard(ctx, {
    extra(c, info, h) {
      const gw = Math.min(c.w * 0.7, 10), z = c.d / 2 + 0.05;
      for (let i = 0; i < 2; i++) {
        const x0 = -gw / 2 + (gw * i) / 2 + 0.4, x1 = -gw / 2 + (gw * (i + 1)) / 2 - 0.4;
        c.S.quad([x0, 0.02, z], [x1, 0.02, z], [x1, 3.6, z], [x0, 3.6, z], rgb(0xb8b8b0));
        for (let k = 1; k < 6; k++) c.S.quad([x0, k * 0.6, z + 0.01], [x1, k * 0.6, z + 0.01], [x1, k * 0.6 + 0.06, z + 0.01], [x0, k * 0.6 + 0.06, z + 0.01], rgb(0x8a8a82));
      }
      // tour de séchage
      const bx = c.w / 2 - 1.8, bz = -c.d / 2 + 1.8;
      wallBox(c.W, bx - 1.5, 0, bz - 1.5, bx + 1.5, h + 5, bz + 1.5, c.wall);
      sbox(c, bx - 1.7, h + 5, bz - 1.7, bx + 1.7, h + 5.3, bz + 1.7, c.roofC);
    },
  });
}

function gasStation(ctx) {
  const { w, d } = ctx;
  mass(ctx, w, d, 3.4);
  const info = roofOn(ctx, 0, w, d, 3.4);
  door(ctx, 0, 2.4, 2.4, d, rgb(0x2a4a5a));
  // auvent sur piliers + pompes
  const cw = 13, cd = 7.5, cz = d / 2 + cd / 2 + 1.5;
  sbox(ctx, -cw / 2, 4.6, cz - cd / 2, cw / 2, 5.2, cz + cd / 2, ctx.roofC, C.white);
  for (const px of [-cw / 2 + 0.8, cw / 2 - 0.8]) for (const pz of [cz - cd / 2 + 0.8, cz + cd / 2 - 0.8]) sbox(ctx, px - 0.2, 0, pz - 0.2, px + 0.2, 4.6, pz + 0.2, C.white);
  for (const px of [-2.4, 2.4]) {
    sbox(ctx, px - 0.4, 0.15, cz - 0.3, px + 0.4, 1.5, cz + 0.3, rgb(0xc8c8c0), C.dark);
    sbox(ctx, px - 1.3, 0, cz - 0.9, px + 1.3, 0.15, cz + 0.9, C.concrete);
  }
  // totem de prix
  sbox(ctx, cw / 2 + 1.5 - 0.1, 0, d / 2, cw / 2 + 1.6, 6.5, d / 2 + 0.1, C.metal);
  sbox(ctx, cw / 2 + 0.7, 5.6, d / 2 - 0.2, cw / 2 + 2.4, 7.2, d / 2 + 0.3, ctx.roofC);
  ctx.boxes.push([-w / 2, 0, -d / 2, w / 2, 3.8, d / 2]);
  ctx.boxes.push([-cw / 2, 0, cz - cd / 2, cw / 2, 5.2, cz + cd / 2]);
  void info;
}

function bunker(ctx) {
  const { w, d } = ctx;
  const h = 3.2;
  sbox(ctx, -w / 2, -2.4, -d / 2, w / 2, h, d / 2, ctx.wall, ctx.roofC);
  // meurtrière + porte blindée
  const z = d / 2 + 0.03;
  ctx.S.quad([-w * 0.35, 1.7, z], [w * 0.35, 1.7, z], [w * 0.35, 2.3, z], [-w * 0.35, 2.3, z], C.black);
  ctx.S.quad([w * 0.3, 0.05, z], [w * 0.45, 0.05, z], [w * 0.45, 1.5, z], [w * 0.3, 1.5, z], rgb(0x3a3e3a));
  // talus de terre
  const earth = rgb(0x6a6a48);
  prism(ctx.S, [[d / 2 + 2.5, 0], [d / 2 - 0.4, h + 0.35], [-d / 2 + 0.4, h + 0.35], [-d / 2 - 2.5, 0]], -w / 2 - 2.2, w / 2 + 2.2, 'x', 0, earth, earth);
  if (ctx.feat & F.ANTENNA) antenna(ctx, { top: h + 0.4, type: 0, rise: 0, w, d }, 4);
  ctx.boxes.push([-w / 2 - 1, 0, -d / 2 - 1, w / 2 + 1, h + 0.4, d / 2 + 1]);
}

function watchtower(ctx) {
  const { w, d, fl } = ctx;
  const lh = fl * 3.0 + 2.5, cab = 2.4;
  const x = w / 2 - 0.3, z = d / 2 - 0.3;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sbox(ctx, sx * x - 0.17, -2.5, sz * z - 0.17, sx * x + 0.17, lh, sz * z + 0.17, C.wood);
  // croisillons
  for (let y = 2; y < lh - 1; y += 2.8) {
    sbox(ctx, -x, y, z - 0.05, x, y + 0.12, z + 0.05, C.wood);
    sbox(ctx, -x, y, -z - 0.05, x, y + 0.12, -z + 0.05, C.wood);
    sbox(ctx, x - 0.05, y, -z, x + 0.05, y + 0.12, z, C.wood);
    sbox(ctx, -x - 0.05, y, -z, -x + 0.05, y + 0.12, z, C.wood);
  }
  sbox(ctx, -w / 2 - 0.9, lh, -d / 2 - 0.9, w / 2 + 0.9, lh + 0.25, d / 2 + 0.9, shade(ctx.wall, 0.85));
  // garde-corps + cabine
  wallBox(ctx.W, -w / 2 - 0.5, lh + 0.25, -d / 2 - 0.5, w / 2 + 0.5, lh + 0.25 + cab, d / 2 + 0.5, ctx.wall);
  pyramid(ctx.S, 0, lh + 0.25 + cab, 0, w + 2.6, d + 2.6, 1.8, ctx.roofC);
  const zz = d / 2 + 0.53;
  ctx.S.quad([-w * 0.35, lh + 1.1, zz], [w * 0.35, lh + 1.1, zz], [w * 0.35, lh + 2.0, zz], [-w * 0.35, lh + 2.0, zz], C.black);
  // échelle
  sbox(ctx, -0.4, 0, z + 0.1, -0.3, lh, z + 0.2, C.metal);
  sbox(ctx, 0.3, 0, z + 0.1, 0.4, lh, z + 0.2, C.metal);
  ctx.boxes.push([-w / 2 - 0.9, 0, -d / 2 - 0.9, w / 2 + 0.9, lh + cab + 2, d / 2 + 0.9]);
}

function lighthouse(ctx) {
  const r = ctx.w / 2, h = ctx.fl * 3.4;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const r0 = r - (r * 0.35 * i) / n, r1 = r - (r * 0.35 * (i + 1)) / n;
    cylinder(ctx.S, 0, (h * i) / n, 0, r0, r1, h / n, 14, i % 2 ? C.red : C.white, null);
  }
  const rt = r * 0.65;
  cylinder(ctx.S, 0, -2.5, 0, r + 0.5, r + 0.5, 2.6, 14, C.concrete, null);
  sbox(ctx, -rt - 1.0, h, -rt - 1.0, rt + 1.0, h + 0.3, rt + 1.0, rgb(0x333333));
  cylinder(ctx.S, 0, h + 0.3, 0, rt - 0.2, rt - 0.2, 2.2, 10, rgb(0xcfe6f2), null);
  cylinder(ctx.S, 0, h + 2.5, 0, rt + 0.3, 0.2, 1.5, 10, C.red, null);
  sbox(ctx, -0.5, 0.02, rt + r - rt + 0.05, 0.5, 2.1, rt + r - rt + 0.1, C.door);
  ctx.boxes.push([-r, 0, -r, r, h + 4, r]);
}

function silo(ctx) {
  const r = ctx.w / 2, h = ctx.fl * 3.4;
  cylinder(ctx.S, 0, -2.4, 0, r, r, h + 2.4, 14, ctx.wall, null);
  for (let y = 1.5; y < h; y += 2.2) cylinder(ctx.S, 0, y, 0, r + 0.04, r + 0.04, 0.12, 14, shade(ctx.wall, 0.8), null);
  dome(ctx.S, 0, h, 0, r, r * 0.6, 14, ctx.roofC);
  sbox(ctx, r - 0.1, 0, -0.25, r + 0.05, h + 0.4, 0.25, C.metal);
  ctx.boxes.push([-r, 0, -r, r, h + r * 0.6, r]);
}

function tanks(ctx) {
  const r = ctx.w / 4.4, h = 3 + ctx.fl * 1.6;
  const n = 2 + (ctx.seed % 2);
  const xs = n === 2 ? [-r * 1.1, r * 1.1] : [-r * 2.0, 0, r * 2.0];
  for (const x of xs) {
    cylinder(ctx.S, x, -2.4, 0, r, r, h + 2.4, 12, ctx.wall, null);
    dome(ctx.S, x, h, 0, r, r * 0.35, 12, ctx.roofC);
    sbox(ctx, x + r - 0.1, 0, -0.2, x + r + 0.05, h, 0.2, C.metal);
  }
  sbox(ctx, xs[0], h * 0.55, -0.15, xs[xs.length - 1], h * 0.55 + 0.25, 0.15, C.metal);
  ctx.boxes.push([xs[0] - r, 0, -r, xs[xs.length - 1] + r, h + r * 0.4, r]);
}

function containers(ctx) {
  const cols = [0xa8432f, 0x2f5f8a, 0x4a7a4a, 0xc89a2c, 0x7a4a8a, 0x8a8a8a, 0xb05a22];
  const rows = [-1, 1];
  const L = ctx.d, Wd = 2.5;
  let top = 0;
  for (let ri = 0; ri < rows.length; ri++) {
    const x = rows[ri] * (Wd / 2 + 0.2);
    const lv = Math.max(1, ctx.fl - (ri === 1 ? 1 : 0));
    for (let l = 0; l < lv; l++) {
      const c = rgb(cols[Math.floor(ctx.rnd() * cols.length)]);
      const y0 = l * 2.6, y1 = y0 + 2.6;
      wallBox(ctx.W, x - Wd / 2, y0, -L / 2, x + Wd / 2, y1, L / 2, c);
      sbox(ctx, x - Wd / 2, y1 - 0.0, -L / 2, x + Wd / 2, y1 + 0.05, L / 2, shade(c, 0.75));
      top = Math.max(top, y1);
    }
  }
  ctx.boxes.push([-Wd - 0.2, 0, -L / 2, Wd + 0.2, top, L / 2]);
}

function windmill(ctx) {
  const r = ctx.w / 2, h = ctx.fl * 3.0 + 2;
  cylinder(ctx.S, 0, -2.4, 0, r, r * 0.62, h + 2.4, 10, ctx.wall, null);
  cylinder(ctx.S, 0, h, 0, r * 0.7, 0.05, 3.2, 10, ctx.roofC, null);
  // pales
  const a0 = (ctx.seed % 90) * (Math.PI / 180);
  const hub = [0, h + 0.9, r * 0.62 + 0.8];
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const len = 6.5, hw = 0.5;
    const nx = -dy, ny = dx;
    const p0 = [hub[0] + dx * 0.8, hub[1] + dy * 0.8, hub[2]];
    const p1 = [hub[0] + dx * len, hub[1] + dy * len, hub[2]];
    ctx.S.quad([p0[0] - nx * hw, p0[1] - ny * hw, p0[2]], [p1[0] - nx * hw, p1[1] - ny * hw, p1[2]], [p1[0] + nx * hw, p1[1] + ny * hw, p1[2]], [p0[0] + nx * hw, p0[1] + ny * hw, p0[2]], C.wood);
    ctx.S.quad([p0[0] + nx * hw, p0[1] + ny * hw, p0[2]], [p1[0] + nx * hw, p1[1] + ny * hw, p1[2]], [p1[0] - nx * hw, p1[1] - ny * hw, p1[2]], [p0[0] - nx * hw, p0[1] - ny * hw, p0[2]], C.wood);
  }
  sbox(ctx, -0.35, h + 0.55, r * 0.62 + 0.1, 0.35, h + 1.25, r * 0.62 + 0.8, C.wood);
  door(ctx, 0, 1.2, 2.1, r * 2 * 0.95);
  ctx.boxes.push([-r, 0, -r, r, h + 3, r]);
}

function hut(ctx) {
  const r = ctx.w / 2, h = 2.4;
  if (ctx.roofT === 8) {
    cylinder(ctx.S, 0, -0.6, 0, r, r * 0.96, h + 0.6, 8, ctx.wall, null);
    cylinder(ctx.S, 0, h, 0, r * 1.45, 0.05, r * 1.2 + 0.8, 8, ctx.roofC, null);
    ctx.S.quad([-0.4, 0.02, r * 0.97], [0.4, 0.02, r * 0.97], [0.4, 1.75, r * 0.97], [-0.4, 1.75, r * 0.97], C.door);
  } else {
    sbox(ctx, -ctx.w / 2, -0.6, -ctx.d / 2, ctx.w / 2, h, ctx.d / 2, ctx.wall);
    if (ctx.roofT === 2) hip(ctx.S, -ctx.w / 2, h, -ctx.d / 2, ctx.w / 2, ctx.d / 2, 1.5, ctx.roofC);
    else prism(ctx.S, [[ctx.d / 2 + 0.5, 0], [0, 1.5], [-ctx.d / 2 - 0.5, 0]], -ctx.w / 2 - 0.5, ctx.w / 2 + 0.5, 'x', h, ctx.roofC, ctx.wall);
    door(ctx, 0, 0.9, 1.8, ctx.d);
  }
  ctx.boxes.push([-r, 0, -r, r, h + 1.2, r]);
}

function mast(ctx) {
  const h = ctx.fl * 3.2;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const r0 = 1.6 - (1.0 * i) / n, r1 = 1.6 - (1.0 * (i + 1)) / n;
    cylinder(ctx.S, 0, -1.5 + (i * (h + 1.5)) / n, 0, r0, r1, (h + 1.5) / n, 4, i % 2 ? C.white : C.red, null);
  }
  sbox(ctx, -1.5, h - 2, -0.05, 1.5, h - 1.9, 0.05, C.metal);
  sbox(ctx, -0.05, h - 4, -1.2, 0.05, h - 3.9, 1.2, C.metal);
  sbox(ctx, -0.04, h, -0.04, 0.04, h + 5, 0.04, C.metal);
  sbox(ctx, -1.2, -1.0, -1.2, 1.2, 0.4, 1.2, C.concrete);
  ctx.boxes.push([-1.2, 0, -1.2, 1.2, h, 1.2]);
}

function ruin(ctx) {
  const { w, d, rnd } = ctx;
  const hmax = ctx.fl * FH;
  // murs partiels
  const walls = [
    [-w / 2, -d / 2, w / 2, -d / 2 + 0.4, hmax],
    [-w / 2, -d / 2, -w / 2 + 0.4, d / 2, hmax * (0.5 + rnd() * 0.4)],
    [w / 2 - 0.4, -d / 2, w / 2, d / 2 * (0.2 + rnd()), hmax * (0.3 + rnd() * 0.5)],
    [-w / 2, d / 2 - 0.4, -w / 2 + w * (0.2 + rnd() * 0.4), d / 2, hmax * (0.2 + rnd() * 0.4)],
  ];
  for (const [x0, z0, x1, z1, hh] of walls) {
    wallBox(ctx.W, x0, 0, z0, x1, hh, z1, ctx.wall);
    sbox(ctx, x0, hh, z0, x1, hh + 0.05, z1, shade(ctx.wall, 0.7));
  }
  sbox(ctx, -w / 2, -1.2, -d / 2, w / 2, 0.05, d / 2, rgb(0x6b6860));
  for (let i = 0; i < 6; i++) {
    const x = (rnd() - 0.5) * w * 0.8, z = (rnd() - 0.5) * d * 0.8, s = 0.3 + rnd() * 0.6;
    sbox(ctx, x - s, 0, z - s, x + s, s * 1.3, z + s, rgb(0x8a8378));
  }
  ctx.boxes.push([-w / 2, 0, -d / 2, w / 2, hmax * 0.8, -d / 2 + 0.5]);
}

function boathouse(ctx) {
  standard(ctx, { door: false, extra(c) { c.S.quad([-1.6, 0.02, c.d / 2 + 0.04], [1.6, 0.02, c.d / 2 + 0.04], [1.6, 2.3, c.d / 2 + 0.04], [-1.6, 2.3, c.d / 2 + 0.04], rgb(0x3a2f24)); } });
}

function barn(ctx) {
  standard(ctx, {
    fh: 4.2,
    door: false,
    extra(c, info, h) {
      const z = c.d / 2 + 0.04, dw = Math.min(5, c.w * 0.5);
      c.S.quad([-dw / 2, 0.02, z], [dw / 2, 0.02, z], [dw / 2, h * 0.85, z], [-dw / 2, h * 0.85, z], rgb(0x5a2a22));
      const t = 0.14;
      c.S.quad([-dw / 2, 0.02, z + 0.01], [-dw / 2 + t, 0.02, z + 0.01], [-dw / 2 + t, h * 0.85, z + 0.01], [-dw / 2, h * 0.85, z + 0.01], C.white);
      c.S.quad([dw / 2 - t, 0.02, z + 0.01], [dw / 2, 0.02, z + 0.01], [dw / 2, h * 0.85, z + 0.01], [dw / 2 - t, h * 0.85, z + 0.01], C.white);
      c.S.quad([-dw / 2, h * 0.85 - t, z + 0.01], [dw / 2, h * 0.85 - t, z + 0.01], [dw / 2, h * 0.85, z + 0.01], [-dw / 2, h * 0.85, z + 0.01], C.white);
      c.S.quad([-dw / 2, h * 0.5 - t / 2, z + 0.01], [dw / 2, h * 0.5 - t / 2, z + 0.01], [dw / 2, h * 0.5 + t / 2, z + 0.01], [-dw / 2, h * 0.5 + t / 2, z + 0.01], C.white);
    },
  });
}

function factory(ctx) {
  standard(ctx, {
    fh: 4.4,
    extra(c, info, h) {
      // cheminée rouge/blanc
      const x = c.w / 2 - 3, z = -c.d / 2 + 3, hh = 18 + c.rnd() * 8;
      for (let i = 0; i < 4; i++) cylinder(c.S, x, -2 + (i * (hh + 2)) / 4, z, 1.5 - i * 0.12, 1.5 - (i + 1) * 0.12, (hh + 2) / 4, 10, i % 2 ? C.white : C.red, null);
      cylinder(c.S, x, hh, z, 1.1, 1.1, 0.5, 10, C.black, C.black);
      c.boxes.push([x - 1.5, 0, z - 1.5, x + 1.5, hh, z + 1.5]);
    },
  });
}

/* ---------------- Table de dispatch ---------------- */

const BUILDERS = {
  [K.HOUSE]: (c) => standard(c),
  [K.VILLA]: (c) => standard(c),
  [K.APT]: (c) => standard(c),
  [K.SHOP]: (c) => standard(c),
  [K.OFFICE]: tower,
  [K.SKYSCRAPER]: tower,
  [K.WAREHOUSE]: (c) => standard(c, { fh: 4.4, bigDoor: true }),
  [K.FACTORY]: factory,
  [K.BARN]: barn,
  [K.FARMHOUSE]: (c) => standard(c),
  [K.CHURCH]: church,
  [K.SCHOOL]: (c) => standard(c),
  [K.HOSPITAL]: hospital,
  [K.TOWNHALL]: townhall,
  [K.BARRACKS]: (c) => standard(c, { fh: 3.4 }),
  [K.BUNKER]: bunker,
  [K.WATCHTOWER]: watchtower,
  [K.HANGAR]: (c) => standard(c, { fh: 9, bigDoor: true }),
  [K.CABIN]: (c) => standard(c),
  [K.BOATHOUSE]: boathouse,
  [K.LIGHTHOUSE]: lighthouse,
  [K.SILO]: silo,
  [K.WINDMILL]: windmill,
  [K.HUT]: hut,
  [K.RUIN]: ruin,
  [K.GAS]: gasStation,
  [K.HOTEL]: (c) => standard(c),
  [K.MARKET]: (c) => standard(c, { fh: 4.4, bigDoor: true }),
  [K.MAST]: mast,
  [K.FIRE]: fireStation,
  [K.TANKS]: tanks,
  [K.CONTAINERS]: containers,
};

export function buildBuilding(spec, sink) {
  const [kind, x, z, w, d, fl, roofT, wall, roofC, feat, seed, rot, y, tex] = spec;
  const ang = rot * (Math.PI / 2);
  const c = Math.round(Math.cos(ang)), s = Math.round(Math.sin(ang));
  const ctx = {
    S: sink.s, W: sink.w[tex] || sink.w[0], boxes: [],
    w, d, fl, roofT, wall: rgb(wall), roofC: rgb(roofC), feat, seed, tex, rnd: mulberry32(seed),
  };
  sink.s.setXform(c, s, x, y, z);
  for (const g of sink.w) g.setXform(c, s, x, y, z);
  try {
    (BUILDERS[kind] || BUILDERS[K.HOUSE])(ctx);
  } finally {
    sink.s.clearXform();
    for (const g of sink.w) g.clearXform();
  }
  // collisions : boîtes locales -> AABB monde
  for (const [x0, y0, z0, x1, y1, z1] of ctx.boxes) {
    const ax = c * x0 - s * z0, az = s * x0 + c * z0;
    const bx = c * x1 - s * z1, bz = s * x1 + c * z1;
    sink.boxes.push([Math.min(ax, bx) + x, y + y0, Math.min(az, bz) + z, Math.max(ax, bx) + x, y + y1, Math.max(az, bz) + z]);
  }
}
