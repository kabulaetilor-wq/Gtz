// Générateur de la carte d'Élite Sniper.
// Usage : node tools/generate-map.mjs [dossier_sortie]   (défaut : public/map)
// Produit 100 fichiers chunk_X_Z.bin (terrain 257x257 + carte de peinture 160x160 + objets JSON)
// et un manifest.json. Tout est déterministe (graine fixe).
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'public/map');
const SEED = 20261105;
const HALF = 1000;
const NC = 10;
const CH = 200;
const HN = 257;
const SN = 160;
const TOTAL_BUILDINGS = 1000;

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const rr = (a, b) => a + rng() * (b - a);
const ri = (a, b) => Math.floor(a + rng() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
function hash(ix, iz, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct, s) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, z * f, s + i * 17); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ */
/* Terrain de base                                                     */
/* ------------------------------------------------------------------ */
function baseH(x, z) {
  const n1 = fbm(x * 0.0016, z * 0.0016, 5, 11);
  const n2 = fbm(x * 0.006 + 100, z * 0.006, 4, 12);
  const ridge = 1 - Math.abs(fbm(x * 0.0025 - 50, z * 0.0025 + 70, 4, 13) * 2 - 1);
  let h = 6 + (n1 - 0.5) * 70 + (n2 - 0.5) * 16 + ridge * ridge * 22;
  if (h < 4) h = 4 - (4 - h) * 0.08;
  h += (fbm(x * 0.05, z * 0.05, 3, 14) - 0.5) * 1.6;
  return h;
}

// Rivières : f(t) = position transversale en fonction de la coordonnée t le long du cours
const RIVERS = [
  { axis: 'z', f: (t) => -430 + 170 * Math.sin(t * 0.0042 + 0.8) + 55 * Math.sin(t * 0.0135 + 2.1),
    df: (t) => 170 * 0.0042 * Math.cos(t * 0.0042 + 0.8) + 55 * 0.0135 * Math.cos(t * 0.0135 + 2.1),
    hw: (t) => 11 + 4 * vnoise(t * 0.01, 0, 91), name: 'Rivière Ouest' },
  { axis: 'x', f: (t) => 420 + 120 * Math.sin(t * 0.0036 + 2.2) + 38 * Math.sin(t * 0.0125),
    df: (t) => 120 * 0.0036 * Math.cos(t * 0.0036 + 2.2) + 38 * 0.0125 * Math.cos(t * 0.0125),
    hw: (t) => 12 + 4 * vnoise(t * 0.01, 1, 92), name: 'Grand Fleuve' },
  { axis: 'z', f: (t) => 540 + 120 * Math.sin(t * 0.005 + 4) + 40 * Math.sin(t * 0.016),
    df: (t) => 120 * 0.005 * Math.cos(t * 0.005 + 4) + 40 * 0.016 * Math.cos(t * 0.016),
    hw: (t) => 7 + 3 * vnoise(t * 0.01, 2, 93), name: 'Rivière Est' },
];
const LAKES = [
  { x: -150, z: -380, r: 85, name: 'Lac du Nord' },
  { x: 330, z: -430, r: 120, name: 'Grand Lac' },
  { x: -720, z: -330, r: 90, name: 'Lac Perdu' },
  { x: 160, z: 720, r: 95, name: 'Lac du Sud' },
  { x: 770, z: 250, r: 70, name: "Étang de l'Est" },
];

function riverInfo(x, z) {
  let best = null;
  for (const rv of RIVERS) {
    const t = rv.axis === 'z' ? z : x;
    const pos = rv.axis === 'z' ? x : z;
    const dd = Math.abs(pos - rv.f(t)) / Math.sqrt(1 + rv.df(t) ** 2);
    const hw = rv.hw(t);
    if (!best || dd - hw < best.d - best.hw) best = { d: dd, hw };
  }
  return best;
}
function lakeInfo(x, z) {
  let best = null;
  for (const lk of LAKES) {
    const dx = x - lk.x, dz = z - lk.z;
    const ang = Math.atan2(dz, dx);
    const rad = lk.r * (1 + 0.28 * (vnoise(Math.cos(ang) * 2 + lk.x, Math.sin(ang) * 2 + lk.z, 71) - 0.5) * 2);
    const d = Math.hypot(dx, dz) - rad;
    if (!best || d < best.d) best = { d, r: rad };
  }
  return best;
}
function carveRiver(h, d, hw) {
  if (d < hw) return -(1.2 + 2.0 * (1 - (d / hw) * (d / hw)));
  const s = smooth(0, 1, (d - hw) / 55);
  return lerp(-1.2, h, s);
}
function carveLake(h, d) {
  if (d < 0) return -(1.5 + Math.min(5, -d * 0.12));
  return lerp(-1.5, h, smooth(0, 1, d / 45));
}

const PLATEAUS = [];
function addPlateau(x, z, r, y) {
  if (y === undefined) y = clamp(baseH(x, z), 4, 22);
  PLATEAUS.push({ x, z, r, y });
  return y;
}

function Hpre(x, z) {
  let h = baseH(x, z);
  for (let i = 0; i < PLATEAUS.length; i++) {
    const p = PLATEAUS[i];
    const dx = x - p.x, dz = z - p.z;
    const R = p.r * 1.4;
    if (dx * dx + dz * dz >= R * R) continue;
    h = lerp(h, p.y, 1 - smooth(p.r * 0.85, R, Math.sqrt(dx * dx + dz * dz)));
  }
  const rv = riverInfo(x, z);
  if (rv && rv.d < rv.hw + 56) h = Math.min(h, carveRiver(h, rv.d, rv.hw));
  const lk = lakeInfo(x, z);
  if (lk && lk.d < 46) h = Math.min(h, carveLake(h, lk.d));
  const e = smooth(870, 1000, Math.max(Math.abs(x), Math.abs(z)));
  if (e > 0) h = lerp(h, -4.5, e);
  return h;
}

// Pads : rectangles aplanis sous les bâtiments isolés
const PAD_C = 32;
const padMap = new Map();
const pads = [];
function addPad(x, z, hw, hd, y) {
  const p = { x, z, hw, hd, y };
  pads.push(p);
  const m = 12;
  for (let i = Math.floor((x - hw - m) / PAD_C); i <= Math.floor((x + hw + m) / PAD_C); i++) {
    for (let j = Math.floor((z - hd - m) / PAD_C); j <= Math.floor((z + hd + m) / PAD_C); j++) {
      const k = i * 4096 + j;
      if (!padMap.has(k)) padMap.set(k, []);
      padMap.get(k).push(p);
    }
  }
}
function H(x, z) {
  let h = Hpre(x, z);
  const lst = padMap.get(Math.floor(x / PAD_C) * 4096 + Math.floor(z / PAD_C));
  if (lst) {
    for (const p of lst) {
      const dx = Math.max(Math.abs(x - p.x) - p.hw, 0);
      const dz = Math.max(Math.abs(z - p.z) - p.hd, 0);
      const d = Math.hypot(dx, dz);
      if (d < 12) h = lerp(h, p.y, 1 - smooth(0, 12, d));
    }
  }
  return h;
}
const isWaterPre = (x, z) => Hpre(x, z) < 0.25;
function slopeAt(x, z, s = 8) {
  const a = Hpre(x - s, z), b = Hpre(x + s, z), c = Hpre(x, z - s), d = Hpre(x, z + s);
  return Math.max(Math.abs(a - b), Math.abs(c - d)) / (2 * s);
}
function waterDistance(x, z) {
  const rv = riverInfo(x, z);
  const lk = lakeInfo(x, z);
  return Math.min(rv.d - rv.hw, lk.d);
}

/* ------------------------------------------------------------------ */
/* Routes (index spatial)                                              */
/* ------------------------------------------------------------------ */
const roads = [];
const RC = 40;
const roadMap = new Map();
function rk(i, j) { return (i + 200) * 1000 + (j + 200); }
function addRoadSeg(x0, z0, x1, z1, hw, type) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / 36));
  for (let k = 0; k < n; k++) {
    const ax = lerp(x0, x1, k / n), az = lerp(z0, z1, k / n);
    const bx = lerp(x0, x1, (k + 1) / n), bz = lerp(z0, z1, (k + 1) / n);
    const s = { x0: ax, z0: az, x1: bx, z1: bz, hw, type };
    roads.push(s);
    const minx = Math.min(ax, bx) - hw, maxx = Math.max(ax, bx) + hw;
    const minz = Math.min(az, bz) - hw, maxz = Math.max(az, bz) + hw;
    for (let i = Math.floor(minx / RC); i <= Math.floor(maxx / RC); i++) {
      for (let j = Math.floor(minz / RC); j <= Math.floor(maxz / RC); j++) {
        const key = rk(i, j);
        if (!roadMap.has(key)) roadMap.set(key, []);
        roadMap.get(key).push(s);
      }
    }
  }
}
function segDist(px, pz, s) {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - s.x0) * dx + (pz - s.z0) * dz) / l2, 0, 1);
  return Math.hypot(px - (s.x0 + dx * t), pz - (s.z0 + dz * t));
}
// Distance au bord de la route la plus proche (négatif = sur la route)
function roadNear(x, z) {
  const ci = Math.floor(x / RC), cj = Math.floor(z / RC);
  let best = null;
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      const lst = roadMap.get(rk(i, j));
      if (!lst) continue;
      for (const s of lst) {
        const d = segDist(x, z, s) - s.hw;
        if (!best || d < best.d) best = { d, type: s.type, hw: s.hw, seg: s };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Occupation (bâtiments)                                              */
/* ------------------------------------------------------------------ */
const OC = 32;
const occMap = new Map();
const rects = [];
function occAdd(x, z, hw, hd) {
  const r = { x, z, hw, hd };
  rects.push(r);
  for (let i = Math.floor((x - hw) / OC); i <= Math.floor((x + hw) / OC); i++) {
    for (let j = Math.floor((z - hd) / OC); j <= Math.floor((z + hd) / OC); j++) {
      const k = i * 4096 + j;
      if (!occMap.has(k)) occMap.set(k, []);
      occMap.get(k).push(r);
    }
  }
}
function occHit(x, z, hw, hd) {
  for (let i = Math.floor((x - hw) / OC); i <= Math.floor((x + hw) / OC); i++) {
    for (let j = Math.floor((z - hd) / OC); j <= Math.floor((z + hd) / OC); j++) {
      const lst = occMap.get(i * 4096 + j);
      if (!lst) continue;
      for (const r of lst) {
        if (Math.abs(x - r.x) < hw + r.hw && Math.abs(z - r.z) < hd + r.hd) return true;
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Couleurs                                                            */
/* ------------------------------------------------------------------ */
function jitter(hex, amt) {
  const r = clamp(((hex >> 16) & 255) + Math.round((rng() - 0.5) * 2 * amt), 0, 255);
  const g = clamp(((hex >> 8) & 255) + Math.round((rng() - 0.5) * 2 * amt), 0, 255);
  const b = clamp((hex & 255) + Math.round((rng() - 0.5) * 2 * amt), 0, 255);
  return (r << 16) | (g << 8) | b;
}
const PAL = {
  warm: [0xe8e0d0, 0xd8cbb0, 0xc9b79a, 0xe6d5b8, 0xb9a083, 0xefe6d2],
  brick: [0x9b5a45, 0xa8654d, 0x8a4e3c, 0xb3735a, 0x8f5442],
  pastel: [0xc7d6c0, 0xd6c0c0, 0xc0cfd9, 0xe0d9a8, 0xd9c7e0, 0xf0d0b8],
  concrete: [0xa8a8a2, 0x9a9a96, 0xbab8b0, 0xb0aca0],
  glass: [0x6a8aa6, 0x7ea0b8, 0x5a7a8c, 0x88a4b4, 0x99aab8, 0x4f6f8a],
  industrial: [0x8f9a9e, 0xa59f90, 0x7d8a85, 0x9aa49c],
  military: [0x6b7355, 0x7a7458, 0x5f6650, 0x8a8468],
  wood: [0x7a5636, 0x8b6340, 0x6e4a2c, 0x9a7048],
  roofTile: [0xa5502f, 0xb35c38, 0x8f4426, 0x9d4a2c],
  roofSlate: [0x4a4f55, 0x3d4247, 0x565b60, 0x5b5f66],
  roofBrown: [0x5a4030, 0x6b4c36, 0x4d382a],
  roofMetal: [0x3f6a52, 0x3d5c7a, 0x7a4a3a, 0x6a6e72, 0x8a2f27],
  roofFlat: [0x8a8a86, 0x77777a, 0x9a968c],
  roofThatch: [0xb59d5a, 0xa28a4c],
};

/* ------------------------------------------------------------------ */
/* Types de bâtiments                                                  */
/* ------------------------------------------------------------------ */
const K = {
  HOUSE: 0, VILLA: 1, APT: 2, SHOP: 3, OFFICE: 4, SKYSCRAPER: 5, WAREHOUSE: 6, FACTORY: 7, BARN: 8,
  FARMHOUSE: 9, CHURCH: 10, SCHOOL: 11, HOSPITAL: 12, TOWNHALL: 13, BARRACKS: 14, BUNKER: 15,
  WATCHTOWER: 16, HANGAR: 17, CABIN: 18, BOATHOUSE: 19, LIGHTHOUSE: 20, SILO: 21, WINDMILL: 22,
  HUT: 23, RUIN: 24, GAS: 25, HOTEL: 26, MARKET: 27, MAST: 28, FIRE: 29, TANKS: 30, CONTAINERS: 31,
};
const KIND_NAMES = Object.keys(K);
// Roofs : 0 plat,1 pignon,2 croupe,3 monopente,5 dôme,6 shed,7 voûte,8 pyramide,9 gambrel,10 parapet,11 étagé
const F = { CHIMNEY: 1, BALCONY: 2, PORCH: 4, GARAGE: 8, DORMER: 16, ANTENNA: 32, SOLAR: 64, AWNING: 128,
  SIGN: 256, TANK: 512, DISH: 1024, SHUTTERS: 2048, TIERS: 4096, SPIRE: 8192, CHIMNEYSTACK: 16384, FENCE: 32768 };
const flag = (p, f) => (rng() < p ? f : 0);

const buildings = []; // [k,x,z,w,d,fl,roof,wall,roofc,feat,seed,rot,y,tex]
const sigs = new Set();
const pools = []; // [x,z,w,d,y,shape]
const props = [];  // [type,x,z,rot,scale,seed]
const animals = []; // [type,x,z,seed]
const bridges = [];
const sandboxCounts = { kinds: {} };

function makeSpec(kind, x, z, w, d) {
  const seed = ri(1, 2147483000);
  const rot = ri(0, 3);
  let fl = 1, roof = 0, wall, roofc, feat = 0, tex = 0;
  switch (kind) {
    case K.HOUSE:
      fl = ri(1, 3); roof = pick([1, 1, 2, 2, 3, 9]);
      wall = jitter(pick([...PAL.warm, ...PAL.brick, ...PAL.pastel]), 10);
      roofc = jitter(pick([...PAL.roofTile, ...PAL.roofSlate, ...PAL.roofBrown]), 8);
      feat = flag(0.6, F.CHIMNEY) | flag(0.4, F.PORCH) | flag(0.35, F.GARAGE) | flag(0.3, F.DORMER) | flag(0.25, F.SHUTTERS) | flag(0.2, F.SOLAR) | flag(0.15, F.ANTENNA) | flag(0.3, F.FENCE);
      tex = 0; break;
    case K.VILLA:
      fl = ri(2, 3); roof = pick([2, 2, 1, 11]);
      wall = jitter(pick([...PAL.warm, ...PAL.pastel]), 8); roofc = jitter(pick(PAL.roofTile), 8);
      feat = F.PORCH | F.BALCONY | flag(0.8, F.CHIMNEY) | flag(0.6, F.GARAGE) | flag(0.5, F.SHUTTERS) | flag(0.5, F.SOLAR) | F.FENCE;
      tex = 0; break;
    case K.APT:
      fl = ri(4, 8); roof = pick([0, 10, 0, 10, 3]);
      wall = jitter(pick([...PAL.brick, ...PAL.concrete, ...PAL.warm]), 10); roofc = jitter(pick(PAL.roofFlat), 8);
      feat = F.BALCONY | flag(0.5, F.TANK) | flag(0.4, F.DISH) | flag(0.3, F.ANTENNA) | flag(0.3, F.AWNING) | flag(0.3, F.SOLAR);
      tex = 0; break;
    case K.SHOP:
      fl = ri(2, 5); roof = pick([0, 10, 3]);
      wall = jitter(pick([...PAL.brick, ...PAL.pastel, ...PAL.warm]), 12); roofc = jitter(pick(PAL.roofFlat), 8);
      feat = F.AWNING | F.SIGN | flag(0.4, F.DISH) | flag(0.3, F.TANK) | flag(0.3, F.BALCONY);
      tex = 3; break;
    case K.OFFICE:
      fl = ri(6, 16); roof = pick([0, 10, 11]);
      wall = jitter(pick(PAL.glass), 10); roofc = jitter(pick(PAL.roofFlat), 8);
      feat = flag(0.6, F.ANTENNA) | flag(0.5, F.TIERS) | flag(0.4, F.TANK) | flag(0.3, F.DISH);
      tex = 1; break;
    case K.SKYSCRAPER:
      fl = ri(16, 46); roof = pick([0, 11, 11, 5]);
      wall = jitter(pick(PAL.glass), 12); roofc = jitter(pick(PAL.roofFlat), 8);
      feat = F.TIERS | flag(0.7, F.SPIRE) | flag(0.6, F.ANTENNA) | flag(0.3, F.DISH);
      tex = 1; break;
    case K.WAREHOUSE:
      fl = ri(1, 2); roof = pick([1, 7, 6, 0, 3]);
      wall = jitter(pick(PAL.industrial), 12); roofc = jitter(pick(PAL.roofMetal), 10);
      feat = flag(0.4, F.TANK) | flag(0.3, F.AWNING) | flag(0.3, F.SIGN);
      tex = 2; break;
    case K.FACTORY:
      fl = ri(2, 4); roof = pick([6, 6, 0, 1]);
      wall = jitter(pick([...PAL.industrial, ...PAL.brick]), 12); roofc = jitter(pick(PAL.roofMetal), 10);
      feat = F.CHIMNEYSTACK | flag(0.5, F.TANK) | flag(0.4, F.ANTENNA) | flag(0.5, F.SIGN);
      tex = 2; break;
    case K.BARN:
      fl = ri(1, 2); roof = pick([9, 9, 1]);
      wall = jitter(pick([0x8e2f27, 0x7a2a22, ...PAL.wood]), 10); roofc = jitter(pick([0x4a4f55, 0x5a4030, 0x6a6e72]), 8);
      feat = flag(0.3, F.ANTENNA); tex = 2; break;
    case K.FARMHOUSE:
      fl = ri(1, 2); roof = pick([1, 2, 9]);
      wall = jitter(pick([...PAL.warm, ...PAL.wood, ...PAL.pastel]), 10); roofc = jitter(pick([...PAL.roofTile, ...PAL.roofBrown]), 8);
      feat = F.CHIMNEY | F.PORCH | flag(0.5, F.DORMER) | flag(0.4, F.SHUTTERS) | flag(0.3, F.FENCE);
      tex = 0; break;
    case K.CHURCH:
      fl = 2; roof = 1; wall = jitter(pick([0xe6dccb, 0xcfc4ae, 0xb9b09c]), 8); roofc = jitter(pick(PAL.roofSlate), 8);
      feat = F.SPIRE | F.SHUTTERS; tex = 0; break;
    case K.SCHOOL:
      fl = ri(2, 3); roof = pick([0, 10, 3]); wall = jitter(pick([...PAL.brick, 0xd9c7a0]), 10); roofc = jitter(pick(PAL.roofFlat), 8);
      feat = F.ANTENNA | flag(0.5, F.PORCH); tex = 0; break;
    case K.HOSPITAL:
      fl = ri(3, 6); roof = 0; wall = jitter(0xe8ece8, 6); roofc = jitter(0x9a968c, 6);
      feat = F.DISH | flag(0.6, F.TANK) | flag(0.5, F.AWNING); tex = 1; break;
    case K.TOWNHALL:
      fl = ri(2, 3); roof = pick([5, 11, 2]); wall = jitter(pick([0xe0d8c4, 0xcdc2a8, 0xd6cdb8]), 6); roofc = jitter(pick([0x3f6a52, 0x4a4f55, 0x8a8a86]), 8);
      feat = F.PORCH | F.SPIRE | flag(0.5, F.SHUTTERS); tex = 0; break;
    case K.BARRACKS:
      fl = ri(1, 2); roof = pick([1, 3, 0]); wall = jitter(pick(PAL.military), 8); roofc = jitter(pick([0x4f5a45, 0x5f6650, 0x6a6e5a]), 6);
      feat = flag(0.4, F.ANTENNA) | flag(0.3, F.AWNING); tex = 2; break;
    case K.BUNKER:
      fl = 1; roof = 0; wall = jitter(pick(PAL.concrete), 8); roofc = jitter(0x77786f, 8); feat = flag(0.4, F.ANTENNA); tex = 2; break;
    case K.WATCHTOWER:
      fl = ri(2, 4); roof = pick([8, 2, 0]); wall = jitter(pick(PAL.wood), 8); roofc = jitter(pick(PAL.roofBrown), 8); feat = F.TIERS; tex = 2; break;
    case K.HANGAR:
      fl = 1; roof = pick([7, 7, 1]); wall = jitter(pick(PAL.industrial), 10); roofc = jitter(pick(PAL.roofMetal), 8); feat = flag(0.5, F.SIGN); tex = 2; break;
    case K.CABIN:
      fl = ri(1, 2); roof = pick([1, 1, 3]); wall = jitter(pick(PAL.wood), 12); roofc = jitter(pick([...PAL.roofBrown, ...PAL.roofThatch]), 8);
      feat = F.CHIMNEY | flag(0.7, F.PORCH) | flag(0.4, F.SHUTTERS); tex = 0; break;
    case K.BOATHOUSE:
      fl = 1; roof = pick([1, 3]); wall = jitter(pick(PAL.wood), 12); roofc = jitter(pick(PAL.roofBrown), 8); feat = F.PORCH; tex = 2; break;
    case K.LIGHTHOUSE:
      fl = ri(8, 12); roof = 5; wall = 0xf0eee6; roofc = 0xb0372c; feat = F.SPIRE; tex = 2; break;
    case K.SILO:
      fl = ri(4, 7); roof = 5; wall = jitter(pick([0xb0b4b4, 0x9fa6a6, 0xc4c8c4]), 8); roofc = jitter(0x77797a, 8); feat = 0; tex = 2; break;
    case K.WINDMILL:
      fl = ri(4, 6); roof = 8; wall = jitter(pick([0xe0d8c8, 0xcfc4b0]), 8); roofc = jitter(pick(PAL.roofBrown), 8); feat = F.SPIRE; tex = 2; break;
    case K.HUT:
      fl = 1; roof = pick([8, 1, 2]); wall = jitter(pick([...PAL.wood, 0xb59d6a, 0xa08a62]), 12); roofc = jitter(pick([...PAL.roofThatch, ...PAL.roofBrown]), 8); feat = 0; tex = 2; break;
    case K.RUIN:
      fl = ri(1, 3); roof = 0; wall = jitter(pick([...PAL.brick, ...PAL.concrete]), 14); roofc = jitter(0x6a6a66, 6); feat = 0; tex = 0; break;
    case K.GAS:
      fl = 1; roof = 0; wall = jitter(pick([0xe8e4d8, 0xd8d0c0]), 8); roofc = jitter(pick([0xb0372c, 0x2f5f9a, 0x2a7a4a]), 6); feat = F.SIGN | F.AWNING; tex = 3; break;
    case K.HOTEL:
      fl = ri(5, 12); roof = pick([0, 10, 11]); wall = jitter(pick([...PAL.warm, ...PAL.glass]), 10); roofc = jitter(pick(PAL.roofFlat), 8);
      feat = F.BALCONY | F.SIGN | flag(0.5, F.AWNING) | flag(0.5, F.TANK); tex = 0; break;
    case K.MARKET:
      fl = 1; roof = pick([7, 6, 1]); wall = jitter(pick(PAL.pastel), 10); roofc = jitter(pick(PAL.roofMetal), 8); feat = F.AWNING | F.SIGN; tex = 3; break;
    case K.MAST:
      fl = ri(6, 14); roof = 8; wall = jitter(0xb04a3a, 8); roofc = 0x8a8a86; feat = F.ANTENNA; tex = 2; break;
    case K.FIRE:
      fl = 2; roof = pick([0, 10]); wall = jitter(pick([0xb8483a, 0xc8c0b0]), 8); roofc = jitter(pick(PAL.roofFlat), 8); feat = F.SIGN | F.ANTENNA; tex = 3; break;
    case K.TANKS:
      fl = 2; roof = 5; wall = jitter(pick([0xc8cccc, 0xb8bcbc, 0xa8aca8]), 10); roofc = 0x77797a; feat = 0; tex = 2; break;
    case K.CONTAINERS:
      fl = ri(1, 3); roof = 0; wall = pick([0xa8432f, 0x2f5f8a, 0x4a7a4a, 0xc89a2c, 0x7a4a8a, 0x8a8a8a]); roofc = wall; feat = 0; tex = 2; break;
    default: wall = 0xcccccc; roofc = 0x777777;
  }
  const y = r2(Hpre(x, z));
  const spec = [kind, r1(x), r1(z), r1(w), r1(d), fl, roof, wall, roofc, feat, seed, rot, y, tex];
  return spec;
}

// Taille de l'emprise selon le type
function sizeFor(kind, maxW, maxD) {
  let w, d;
  switch (kind) {
    case K.HOUSE: w = rr(8, 13); d = rr(8, 13); break;
    case K.VILLA: w = rr(13, 19); d = rr(11, 16); break;
    case K.APT: w = rr(12, 17); d = rr(11, 16); break;
    case K.SHOP: w = rr(9, 15); d = rr(9, 15); break;
    case K.OFFICE: w = rr(15, 26); d = rr(15, 26); break;
    case K.SKYSCRAPER: w = rr(18, 30); d = rr(18, 30); break;
    case K.WAREHOUSE: w = rr(20, 34); d = rr(14, 24); break;
    case K.FACTORY: w = rr(20, 32); d = rr(16, 26); break;
    case K.BARN: w = rr(11, 17); d = rr(18, 26); break;
    case K.FARMHOUSE: w = rr(10, 14); d = rr(9, 12); break;
    case K.CHURCH: w = rr(10, 14); d = rr(18, 26); break;
    case K.SCHOOL: w = rr(22, 32); d = rr(12, 16); break;
    case K.HOSPITAL: w = rr(24, 32); d = rr(16, 24); break;
    case K.TOWNHALL: w = rr(18, 26); d = rr(14, 20); break;
    case K.BARRACKS: w = rr(8, 11); d = rr(20, 30); break;
    case K.BUNKER: w = rr(7, 11); d = rr(6, 9); break;
    case K.WATCHTOWER: w = rr(4, 6); d = rr(4, 6); break;
    case K.HANGAR: w = rr(22, 32); d = rr(26, 36); break;
    case K.CABIN: w = rr(6, 9); d = rr(5, 8); break;
    case K.BOATHOUSE: w = rr(6, 9); d = rr(8, 12); break;
    case K.LIGHTHOUSE: w = rr(6, 8); d = w; break;
    case K.SILO: w = rr(5, 8); d = w; break;
    case K.WINDMILL: w = rr(7, 9); d = w; break;
    case K.HUT: w = rr(3.5, 5.5); d = rr(3.5, 5.5); break;
    case K.RUIN: w = rr(6, 12); d = rr(6, 12); break;
    case K.GAS: w = rr(8, 11); d = rr(6, 8); break;
    case K.HOTEL: w = rr(16, 24); d = rr(14, 20); break;
    case K.MARKET: w = rr(16, 24); d = rr(12, 18); break;
    case K.MAST: w = rr(3, 4); d = w; break;
    case K.FIRE: w = rr(14, 18); d = rr(12, 16); break;
    case K.TANKS: w = rr(9, 13); d = w; break;
    case K.CONTAINERS: w = rr(6, 7); d = rr(12, 15); break;
    default: w = 8; d = 8;
  }
  if (maxW) w = Math.min(w, maxW);
  if (maxD) d = Math.min(d, maxD);
  return [w, d];
}

function cornersOk(x, z, hw, hd, margin = 2) {
  for (const [sx, sz] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = x + sx * hw, pz = z + sz * hd;
    const rn = roadNear(px, pz);
    if (rn && rn.d < margin) return false;
    if (Hpre(px, pz) < 0.6) return false;
  }
  return true;
}

// Tente de placer un bâtiment. opts: {pad:boolean, maxW, maxD}
function tryPlace(kind, x, z, opts = {}) {
  if (buildings.length >= TOTAL_BUILDINGS) return null;
  const [w, d] = sizeFor(kind, opts.maxW, opts.maxD);
  if (Math.abs(x) > 940 || Math.abs(z) > 940) return null;
  if (!cornersOk(x, z, w / 2, d / 2, opts.roadMargin ?? 2)) return null;
  if (occHit(x, z, w / 2 + 1.2, d / 2 + 1.2)) return null;
  if (opts.pad) {
    if (slopeAt(x, z, 10) > 0.35) return null;
  }
  const spec = makeSpec(kind, x, z, w, d);
  if (opts.pad) addPad(x, z, w / 2 + 3, d / 2 + 3, spec[12]);
  occAdd(x, z, w / 2 + 0.5, d / 2 + 0.5);
  buildings.push(spec);
  sandboxCounts.kinds[KIND_NAMES[kind]] = (sandboxCounts.kinds[KIND_NAMES[kind]] || 0) + 1;
  const sig = [spec[0], spec[3], spec[4], spec[5], spec[6], spec[7], spec[8], spec[9], spec[13]].join('|');
  sigs.add(sig);
  return spec;
}

function addPool(x, z, w, d, y, shape = 0) {
  pools.push([r1(x), r1(z), r1(w), r1(d), r2(y), shape]);
}
function addProp(type, x, z, rot = 0, scale = 1) {
  props.push([type, r1(x), r1(z), r2(rot), r2(scale), ri(1, 99999)]);
}
// Types de props
const P = { LAMP: 0, CAR: 1, FENCE: 2, POLE: 3, HAY: 4, CRATE: 5, SANDBAG: 6, CONTAINER: 7, FUELTANK: 8, BILLBOARD: 9,
  BENCH: 10, ROCK: 11, HELIPAD: 12, WELL: 13, CAMPFIRE: 14, FLAG: 15, TENT: 16, LOGS: 17, PIER: 18, TRUCK: 19, BARREL: 20, STATUE: 21 };

/* ------------------------------------------------------------------ */
/* Sites : joueur, villes, camps, fermes                               */
/* ------------------------------------------------------------------ */
const TOWNS = [];
const PLAYER_Y = addPlateau(0, 0, 40, clamp(baseH(0, 0) + 4, 8, 30));

function farFromWater(x, z, margin) {
  const rv = riverInfo(x, z), lk = lakeInfo(x, z);
  return rv.d - rv.hw > margin && lk.d > margin;
}

function siteTown(name, type, r, count, pitch, maxTries = 6000) {
  for (let relax = 0; relax < 4; relax++) {
    for (let t = 0; t < maxTries; t++) {
      const lim = 900 - r * 0.9;
      const x = rr(-lim, lim), z = rr(-lim, lim);
      if (Math.hypot(x, z) < r + 330 - relax * 60) continue;
      if (!farFromWater(x, z, r * 0.95 + 40 - relax * 25)) continue;
      if (TOWNS.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 110 - relax * 40)) continue;
      const by = baseH(x, z);
      if (by < 3 || by > 32) continue;
      if (slopeAt(x, z, 60) > 0.22 + relax * 0.06) continue;
      const y = addPlateau(x, z, r, clamp(by, 5, 24));
      const tw = { name, type, x: r1(x), z: r1(z), r, count, pitch, y };
      TOWNS.push(tw);
      return tw;
    }
  }
  throw new Error('Impossible de placer ' + name);
}

console.log('1/6 Placement des sites…');
siteTown('Port-Élite', 'city', 280, 170, 44);
siteTown('Valmont', 'town', 200, 105, 44);
siteTown('Rochefort', 'town', 200, 105, 44);
siteTown('Saint-Aubin', 'town', 200, 105, 44);
siteTown('Les Aulnes', 'village', 120, 42, 36);
siteTown('Hautebrise', 'village', 120, 42, 36);
siteTown('Marnes', 'village', 120, 42, 36);
siteTown('Ker-Vallon', 'village', 120, 42, 36);
siteTown('Zone Industrielle Nord', 'industrial', 170, 90, 44);
siteTown('Base Alpha', 'military', 140, 45, 44);

// Camps ennemis autour de la tour du tireur (utilisés pour les missions)
const CAMPS = [];
{
  const ringDefs = [95, 120, 150, 180, 210, 240, 270, 300, 330, 355, 380, 150];
  let a0 = -Math.PI / 2;
  ringDefs.forEach((dist, i) => {
    for (let tries = 0; tries < 4000; tries++) {
      const ang = a0 + (i / ringDefs.length) * Math.PI * 2 * 1.0 + rr(-0.35, 0.35);
      const dd = dist + rr(-15, 15);
      const x = Math.cos(ang) * dd, z = Math.sin(ang) * dd;
      if (Math.abs(x) > 880 || Math.abs(z) > 880) continue;
      if (!farFromWater(x, z, 70)) continue;
      const by = baseH(x, z);
      if (by < 3 || by > 48) continue;
      if (slopeAt(x, z, 25) > 0.45) continue;
      if (TOWNS.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 60)) continue;
      if (CAMPS.some((o) => Math.hypot(o.x - x, o.z - z) < 90)) continue;
      const y = addPlateau(x, z, 45, clamp(by, 4, 30));
      CAMPS.push({ x: r1(x), z: r1(z), y, kind: ['military', 'farm', 'village', 'gas', 'ruins', 'military'][i % 6] });
      return;
    }
  });
}
console.log('   villes:', TOWNS.length, ' camps:', CAMPS.length);

// Fermes
const FARMS = [];
for (let i = 0; i < 12; i++) {
  for (let t = 0; t < 3000; t++) {
    const x = rr(-850, 850), z = rr(-850, 850);
    if (Math.hypot(x, z) < 160) continue;
    if (!farFromWater(x, z, 90)) continue;
    const by = baseH(x, z);
    if (by < 3 || by > 30) continue;
    if (slopeAt(x, z, 40) > 0.3) continue;
    if (TOWNS.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 200)) continue;
    if (CAMPS.some((o) => Math.hypot(o.x - x, o.z - z) < 120)) continue;
    if (FARMS.some((o) => Math.hypot(o.x - x, o.z - z) < 200)) continue;
    const y = addPlateau(x, z, 48, clamp(by, 4, 22));
    FARMS.push({ x: r1(x), z: r1(z), y, ang: rr(0, Math.PI) });
    break;
  }
}
console.log('   fermes:', FARMS.length);

/* ------------------------------------------------------------------ */
/* Routes : grilles urbaines, autoroutes, pistes                       */
/* ------------------------------------------------------------------ */
console.log('2/6 Routes et ponts…');
for (const tw of TOWNS) {
  const hw = tw.type === 'village' ? 3 : 4;
  const R = tw.r;
  const K2 = Math.floor(R / tw.pitch) + 1;
  for (let k = -K2; k <= K2; k++) {
    const off = k * tw.pitch;
    if (Math.abs(off) > R) continue;
    const half = Math.sqrt(R * R - off * off);
    addRoadSeg(tw.x + off, tw.z - half, tw.x + off, tw.z + half, hw, 0);
    addRoadSeg(tw.x - half, tw.z + off, tw.x + half, tw.z + off, hw, 0);
  }
}
// Arbre couvrant minimal + liaisons supplémentaires
const edges = [];
{
  const inTree = [0];
  const rest = new Set(TOWNS.map((_, i) => i).filter((i) => i !== 0));
  while (rest.size) {
    let bestE = null;
    for (const a of inTree) for (const b of rest) {
      const d = Math.hypot(TOWNS[a].x - TOWNS[b].x, TOWNS[a].z - TOWNS[b].z);
      if (!bestE || d < bestE.d) bestE = { a, b, d };
    }
    edges.push([bestE.a, bestE.b]);
    inTree.push(bestE.b);
    rest.delete(bestE.b);
  }
  for (let i = 0; i < TOWNS.length; i++) {
    const order = TOWNS.map((_, j) => j).filter((j) => j !== i).sort((p, q) =>
      Math.hypot(TOWNS[i].x - TOWNS[p].x, TOWNS[i].z - TOWNS[p].z) - Math.hypot(TOWNS[i].x - TOWNS[q].x, TOWNS[i].z - TOWNS[q].z));
    const j = order[1];
    if (Math.hypot(TOWNS[i].x - TOWNS[j].x, TOWNS[i].z - TOWNS[j].z) < 900 &&
        !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]);
  }
}
const highwayPts = [];
function buildPolyline(ax, az, bx, bz, wobble) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / 30));
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  const seed = ri(1, 9999);
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const off = (vnoise(k * 0.13, seed, 33) - 0.5) * 2 * wobble * Math.sin(Math.PI * t);
    pts.push([lerp(ax, bx, t) + nx * off, lerp(az, bz, t) + nz * off]);
  }
  return pts;
}
const bridgeCandidates = [];
for (const [a, b] of edges) {
  const A = TOWNS[a], B = TOWNS[b];
  const dirx = (B.x - A.x), dirz = (B.z - A.z), L = Math.hypot(dirx, dirz);
  const sx = A.x + (dirx / L) * (A.r * 0.5), sz = A.z + (dirz / L) * (A.r * 0.5);
  const ex = B.x - (dirx / L) * (B.r * 0.5), ez = B.z - (dirz / L) * (B.r * 0.5);
  const pts = buildPolyline(sx, sz, ex, ez, 35);
  for (let k = 0; k < pts.length - 1; k++) {
    addRoadSeg(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 4.5, 1);
  }
  highwayPts.push(pts);
  // détection de ponts : balayage tous les 3 m
  let inWater = false, start = null, last = null;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(seg / 3);
    for (let s = 0; s <= steps; s++) {
      const x = lerp(x0, x1, s / steps), z = lerp(z0, z1, s / steps);
      const w = isWaterPre(x, z);
      if (w && !inWater) { inWater = true; start = [x, z]; }
      if (!w && inWater) { inWater = false; bridgeCandidates.push([start, last || [x, z], [x, z]]); }
      last = [x, z];
    }
  }
}
for (const [s, , e] of bridgeCandidates) {
  const dx = e[0] - s[0], dz = e[1] - s[1];
  const L = Math.hypot(dx, dz);
  if (L < 1) continue;
  const ux = dx / L, uz = dz / L;
  const x0 = s[0] - ux * 7, z0 = s[1] - uz * 7, x1 = e[0] + ux * 7, z1 = e[1] + uz * 7;
  // tablier en pente : chaque extrémité est à 0,9 m au-dessus de sa rive (franchissable à pied et en voiture)
  const yA = Math.max(Hpre(x0, z0), 0.4) + 0.9, yB = Math.max(Hpre(x1, z1), 0.4) + 0.9;
  bridges.push([r1(x0), r1(z0), r1(x1), r1(z1), r2(Math.max(yA, yB)), 11, r2(yA), r2(yB)]);
}
console.log('   routes:', roads.length, ' segments, ponts:', bridges.length);

// Pistes depuis les camps/fermes vers la ville la plus proche, et vers la tour
function dirtTrack(ax, az, bx, bz) {
  const pts = buildPolyline(ax, az, bx, bz, 20);
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4);
    for (let s = 0; s <= steps; s++) {
      if (isWaterPre(lerp(x0, x1, s / steps), lerp(z0, z1, s / steps))) return false;
    }
  }
  for (let k = 0; k < pts.length - 1; k++) addRoadSeg(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 2.2, 2);
  return true;
}
for (const c of [...CAMPS, ...FARMS]) {
  let best = null;
  for (const t of TOWNS) {
    const d = Math.hypot(t.x - c.x, t.z - c.z) - t.r * 0.7;
    if (!best || d < best.d) best = { d, x: t.x, z: t.z };
  }
  if (best && best.d < 700) dirtTrack(c.x, c.z, best.x, best.z);
}
if (CAMPS.length) {
  const near = CAMPS.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  dirtTrack(0, 0, near.x, near.z);
}

/* ------------------------------------------------------------------ */
/* Bâtiments                                                           */
/* ------------------------------------------------------------------ */
console.log('3/6 Placement des 1000 bâtiments…');

function blockCells(tw) {
  const cells = [];
  const K2 = Math.floor(tw.r / tw.pitch) + 1;
  for (let i = -K2; i < K2; i++) for (let j = -K2; j < K2; j++) {
    const bx = tw.x + (i + 0.5) * tw.pitch, bz = tw.z + (j + 0.5) * tw.pitch;
    const rho = Math.hypot(bx - tw.x, bz - tw.z) / tw.r;
    if (rho > 0.93) continue;
    cells.push({ bx, bz, rho, i, j });
  }
  return cells;
}

function placeInBlock(tw, cell, pickKind, single) {
  const off = tw.pitch * 0.2;
  const slots = single ? [[0, 0]] : [[-off, -off], [off, -off], [-off, off], [off, off]];
  let placed = 0;
  for (const [ox, oz] of slots) {
    const kind = pickKind(cell, single);
    if (kind === null) continue;
    const m = single ? tw.pitch - 12 : tw.pitch * 0.38;
    const sp = tryPlace(kind, cell.bx + ox + rr(-1, 1), cell.bz + oz + rr(-1, 1), { maxW: m, maxD: m });
    if (sp) placed++;
  }
  return placed;
}

function parkBlock(tw, cell) {
  const pool = rng() < 0.4;
  if (pool) {
    addPool(cell.bx, cell.bz, rr(10, 14), rr(18, 24), Hpre(cell.bx, cell.bz), 0);
  } else if (rng() < 0.5) {
    addPool(cell.bx, cell.bz, 9, 9, Hpre(cell.bx, cell.bz), 1); // bassin circulaire
    addProp(P.STATUE, cell.bx, cell.bz, 0, 1);
  }
  for (let k = 0; k < 6; k++) addProp(P.BENCH, cell.bx + rr(-15, 15), cell.bz + rr(-15, 15), rr(0, 6.28), 1);
  occAdd(cell.bx, cell.bz, 18, 18);
  parkBlocks.push({ x: cell.bx, z: cell.bz });
}
const parkBlocks = [];

function populateTown(tw) {
  const cells = blockCells(tw);
  const used = new Set();
  const take = (filter, count, kind, single) => {
    const cand = cells.filter((c) => !used.has(c) && filter(c)).sort((a, b) => a.rho + rng() * 0.3 - (b.rho + rng() * 0.3));
    let n = 0;
    for (const c of cand) {
      if (n >= count) break;
      const sp = tryPlace(kind, c.bx, c.bz, { maxW: tw.pitch - 12, maxD: tw.pitch - 12 });
      if (sp) { used.add(c); n++; }
    }
    return n;
  };
  const start = buildings.length;
  const target = start + tw.count;

  if (tw.type === 'city') {
    // civiques
    take((c) => c.rho > 0.3 && c.rho < 0.5, 1, K.TOWNHALL, true);
    take((c) => c.rho > 0.35 && c.rho < 0.7, 1, K.HOSPITAL, true);
    take((c) => c.rho > 0.4, 2, K.SCHOOL, true);
    take((c) => c.rho > 0.25 && c.rho < 0.6, 2, K.CHURCH, true);
    take((c) => c.rho > 0.3 && c.rho < 0.6, 1, K.FIRE, true);
    take((c) => c.rho > 0.3 && c.rho < 0.55, 2, K.MARKET, true);
    take((c) => c.rho > 0.25 && c.rho < 0.5, 3, K.HOTEL, true);
    // parcs
    cells.filter((c) => !used.has(c) && c.rho > 0.3 && c.rho < 0.7 && rng() < 0.08).forEach((c) => { used.add(c); parkBlock(tw, c); });
    // centre-ville : tours
    const downtown = cells.filter((c) => !used.has(c) && c.rho < 0.36);
    for (const c of downtown) {
      if (buildings.length >= target) break;
      const kind = rng() < 0.6 ? K.SKYSCRAPER : K.OFFICE;
      if (tryPlace(kind, c.bx, c.bz, { maxW: tw.pitch - 12, maxD: tw.pitch - 12 })) used.add(c);
    }
    const mid = cells.filter((c) => !used.has(c) && c.rho >= 0.36 && c.rho < 0.62);
    for (const c of mid) {
      if (buildings.length >= target) break;
      placeInBlock(tw, c, () => pick([K.APT, K.APT, K.SHOP, K.SHOP, K.OFFICE, K.HOTEL, K.APT]), false);
      used.add(c);
    }
    const outer = cells.filter((c) => !used.has(c) && c.rho >= 0.62);
    for (const c of outer) {
      if (buildings.length >= target) break;
      placeInBlock(tw, c, () => pick([K.HOUSE, K.HOUSE, K.HOUSE, K.APT, K.SHOP, K.HOUSE]), false);
    }
  } else if (tw.type === 'town') {
    take((c) => c.rho < 0.4, 1, K.TOWNHALL, true);
    take((c) => c.rho > 0.2 && c.rho < 0.7, 1, K.CHURCH, true);
    take((c) => c.rho > 0.3, 1, K.SCHOOL, true);
    take((c) => c.rho < 0.6, 1, K.FIRE, true);
    take((c) => c.rho < 0.5, 1, K.MARKET, true);
    take((c) => c.rho < 0.6, 1, K.GAS, true);
    cells.filter((c) => !used.has(c) && c.rho > 0.1 && c.rho < 0.6 && rng() < 0.07).forEach((c) => { used.add(c); parkBlock(tw, c); });
    const order = cells.filter((c) => !used.has(c)).sort((a, b) => a.rho - b.rho);
    for (const c of order) {
      if (buildings.length >= target) break;
      placeInBlock(tw, c, (cell) => (cell.rho < 0.35 ? pick([K.SHOP, K.APT, K.SHOP, K.OFFICE, K.HOUSE]) : pick([K.HOUSE, K.HOUSE, K.HOUSE, K.APT, K.HOUSE, K.VILLA])), false);
    }
  } else if (tw.type === 'village') {
    take((c) => c.rho < 0.5, 1, K.CHURCH, true);
    take((c) => c.rho < 0.7, 1, K.SHOP, true);
    const order = cells.filter((c) => !used.has(c)).sort((a, b) => a.rho + rng() * 0.2 - (b.rho + rng() * 0.2));
    for (const c of order) {
      if (buildings.length >= target) break;
      placeInBlock(tw, c, () => pick([K.HOUSE, K.HOUSE, K.HOUSE, K.CABIN, K.FARMHOUSE, K.BARN, K.HOUSE, K.HUT]), false);
    }
  } else if (tw.type === 'industrial') {
    const order = cells.slice().sort((a, b) => a.rho + rng() * 0.2 - (b.rho + rng() * 0.2));
    for (const c of order) {
      if (buildings.length >= target) break;
      const kind = pick([K.WAREHOUSE, K.WAREHOUSE, K.FACTORY, K.FACTORY, K.TANKS, K.CONTAINERS, K.WAREHOUSE, K.SILO, K.MAST, K.GAS]);
      if (kind === K.TANKS || kind === K.SILO || kind === K.CONTAINERS || kind === K.MAST) {
        placeInBlock(tw, c, () => kind, false);
      } else {
        tryPlace(kind, c.bx, c.bz, { maxW: tw.pitch - 10, maxD: tw.pitch - 10 });
      }
    }
  } else if (tw.type === 'military') {
    take((c) => c.rho < 0.3, 2, K.HANGAR, true);
    const order = cells.slice().sort((a, b) => a.rho + rng() * 0.3 - (b.rho + rng() * 0.3));
    for (const c of order) {
      if (buildings.length >= target) break;
      placeInBlock(tw, c, () => pick([K.BARRACKS, K.BARRACKS, K.BUNKER, K.WATCHTOWER, K.TANKS, K.CONTAINERS, K.MAST, K.BUNKER, K.HANGAR]), false);
    }
    // périmètre : clôtures et miradors
    for (let a = 0; a < 6.283; a += 0.12) {
      const x = tw.x + Math.cos(a) * tw.r * 0.98, z = tw.z + Math.sin(a) * tw.r * 0.98;
      if (isWaterPre(x, z)) continue;
      addProp(P.FENCE, x, z, a + Math.PI / 2, 14);
    }
    addProp(P.HELIPAD, tw.x + 60, tw.z + 60, 0, 1);
    for (let k = 0; k < 18; k++) addProp(P.SANDBAG, tw.x + rr(-100, 100), tw.z + rr(-100, 100), rr(0, 3), 1);
    for (let k = 0; k < 14; k++) addProp(P.CRATE, tw.x + rr(-90, 90), tw.z + rr(-90, 90), rr(0, 3), 1);
    for (let k = 0; k < 8; k++) addProp(P.TENT, tw.x + rr(-110, 110), tw.z + rr(-110, 110), rr(0, 3), 1);
    for (let k = 0; k < 6; k++) addProp(P.TRUCK, tw.x + rr(-100, 100), tw.z + rr(-100, 100), rr(0, 6), 1);
    addProp(P.FLAG, tw.x, tw.z + 20, 0, 1);
  }
  // si le quota n'est pas atteint (conflits routes/eau), on complète avec des maisons sur les blocs libres
  let guard = 0;
  while (buildings.length < target && guard++ < 4000) {
    const c = cells[Math.floor(rng() * cells.length)];
    if (!c) break;
    const kind = tw.type === 'industrial' ? K.WAREHOUSE : tw.type === 'military' ? K.BARRACKS : K.HOUSE;
    tryPlace(kind, c.bx + rr(-12, 12), c.bz + rr(-12, 12), { maxW: 14, maxD: 14 });
  }
  tw.placed = buildings.length - start;
}

for (const tw of TOWNS) populateTown(tw);
console.log('   villes/zones :', buildings.length, 'bâtiments');

// Équipements urbains : lampadaires et voitures
for (const tw of TOWNS) {
  if (tw.type === 'military') continue;
  const K2 = Math.floor(tw.r / tw.pitch) + 1;
  for (let i = -K2; i <= K2; i++) {
    for (let t = -tw.r; t <= tw.r; t += 22) {
      for (const [x, z] of [[tw.x + i * tw.pitch + 5, tw.z + t], [tw.x + t, tw.z + i * tw.pitch + 5]]) {
        if (Math.hypot(x - tw.x, z - tw.z) > tw.r * 0.92) continue;
        if (Hpre(x, z) < 0.6) continue;
        if (rng() < 0.55) addProp(P.LAMP, x, z, 0, 1);
        else if (rng() < 0.18 && tw.type !== 'industrial') addProp(P.CAR, x - 2.2 + rr(-1, 1), z, rr(-0.1, 0.1) + (rng() < 0.5 ? 0 : Math.PI / 2), 1);
      }
    }
  }
}
// Poteaux électriques le long des autoroutes
for (const pts of highwayPts) {
  let acc = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    acc += L;
    if (acc < 60) continue;
    acc = 0;
    const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
    const x = x1 + nx * 9, z = z1 + nz * 9;
    if (isWaterPre(x, z)) continue;
    addProp(P.POLE, x, z, Math.atan2(x1 - x0, z1 - z0), 1);
  }
}

// Camps ennemis (bâtiments + props)
for (const c of CAMPS) {
  const n = ri(3, 5);
  let placed = 0;
  const mk = {
    military: [K.BUNKER, K.BARRACKS, K.WATCHTOWER, K.CONTAINERS, K.BUNKER],
    farm: [K.FARMHOUSE, K.BARN, K.SILO, K.HUT, K.BARN],
    village: [K.HOUSE, K.CABIN, K.HOUSE, K.SHOP, K.HUT],
    gas: [K.GAS, K.SHOP, K.CONTAINERS, K.HOUSE, K.HUT],
    ruins: [K.RUIN, K.RUIN, K.RUIN, K.HUT, K.RUIN],
  }[c.kind];
  for (let t = 0; t < 300 && placed < n; t++) {
    const a = rr(0, 6.283), r = rr(6, 30);
    if (tryPlace(mk[placed % mk.length], c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, { roadMargin: 1 })) placed++;
  }
  const nProps = c.kind === 'military' ? [P.SANDBAG, P.CRATE, P.TENT, P.BARREL, P.CAMPFIRE] : [P.CRATE, P.BARREL, P.CAMPFIRE, P.LOGS, P.WELL];
  for (let k = 0; k < 9; k++) addProp(nProps[k % nProps.length], c.x + rr(-34, 34), c.z + rr(-34, 34), rr(0, 6.28), 1);
}

// Fermes
const pastures = [];
for (const f of FARMS) {
  const set = [K.FARMHOUSE, K.BARN, K.BARN, K.SILO, K.HUT, K.WINDMILL];
  let placed = 0;
  for (let t = 0; t < 300 && placed < set.length && placed < 4; t++) {
    const a = rr(0, 6.283), r = rr(8, 32);
    if (tryPlace(set[placed], f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, { roadMargin: 1 })) placed++;
  }
  for (let k = 0; k < 6; k++) addProp(P.HAY, f.x + rr(-35, 35), f.z + rr(-35, 35), rr(0, 3), 1);
  // enclos : clôtures + animaux
  const px = f.x + Math.cos(f.ang) * 70, pz = f.z + Math.sin(f.ang) * 70;
  if (!isWaterPre(px, pz)) {
    pastures.push({ x: px, z: pz, w: 56, d: 40 });
    for (let s = -28; s < 28; s += 7) { addProp(P.FENCE, px + s + 3.5, pz - 20, 0, 7); addProp(P.FENCE, px + s + 3.5, pz + 20, 0, 7); }
    for (let s = -20; s < 20; s += 7) { addProp(P.FENCE, px - 28, pz + s + 3.5, Math.PI / 2, 7); addProp(P.FENCE, px + 28, pz + s + 3.5, Math.PI / 2, 7); }
    const type = pick([0, 0, 1, 2, 15, 13]);
    const cnt = ri(8, 14);
    for (let k = 0; k < cnt; k++) animals.push([type, r1(px + rr(-24, 24)), r1(pz + rr(-16, 16)), ri(1, 99999)]);
  }
  for (let k = 0; k < ri(4, 8); k++) animals.push([14, r1(f.x + rr(-20, 20)), r1(f.z + rr(-20, 20)), ri(1, 99999)]);
}

// Villas avec piscine autour des lacs
{
  let placed = 0, guard = 0;
  while (placed < 32 && guard++ < 30000) {
    const lk = pick(LAKES);
    const a = rr(0, 6.283), r = lk.r + rr(45, 140);
    const x = lk.x + Math.cos(a) * r, z = lk.z + Math.sin(a) * r;
    if (!farFromWater(x, z, 18)) continue;
    if (TOWNS.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + 20)) continue;
    const sp = tryPlace(K.VILLA, x, z, { pad: true });
    if (!sp) continue;
    const [, vx, vz, vw, vd, , , , , , , , vy] = sp;
    // piscine à côté de la villa
    const pw = rr(4, 6.5), pd = rr(8, 13);
    const side = rng() < 0.5 ? 1 : -1;
    const px = vx + side * (vw / 2 + 4 + pw / 2), pz = vz + rr(-2, 2);
    if (!occHit(px, pz, pw / 2 + 1, pd / 2 + 1) && cornersOk(px, pz, pw / 2, pd / 2, 1)) {
      addPad(px, pz, pw / 2 + 3, pd / 2 + 3, vy);
      occAdd(px, pz, pw / 2 + 2, pd / 2 + 2);
      addPool(px, pz, pw, pd, vy, 0);
      for (let k = 0; k < 2; k++) addProp(P.BENCH, px + rr(-pw, pw), pz + pd / 2 + 2.5, 0, 1);
    }
    for (let k = 0; k < 6; k++) addProp(P.FENCE, vx - 12 + k * 4.8, vz + vd / 2 + 12, 0, 4.8);
    placed++;
  }
  console.log('   villas avec piscine:', placed);
}
// Piscines d'hôtel (en ville) : une grande piscine publique par ville de type city/town
for (const tw of TOWNS.filter((t) => t.type === 'city' || t.type === 'town')) {
  for (const p of parkBlocks.filter((p) => Math.hypot(p.x - tw.x, p.z - tw.z) < tw.r)) void p;
}

// Bâtiments épars : cabanes, huttes, hangars, fermes, moulins, ruines, bateaux, phares
{
  const fillKinds = [K.CABIN, K.CABIN, K.HUT, K.HUT, K.BARN, K.RUIN, K.WINDMILL, K.WATCHTOWER, K.HOUSE, K.FARMHOUSE, K.SHOP, K.MAST];
  let guard = 0;
  // Remises à bateaux avec ponton
  let boats = 0;
  while (boats < 10 && guard++ < 30000 && buildings.length < TOTAL_BUILDINGS) {
    const lk = pick(LAKES);
    const a = rr(0, 6.283);
    const x = lk.x + Math.cos(a) * (lk.r + rr(8, 16)), z = lk.z + Math.sin(a) * (lk.r + rr(8, 16));
    if (Hpre(x, z) < 0.8 || Hpre(x, z) > 6) continue;
    const sp = tryPlace(K.BOATHOUSE, x, z, { pad: true });
    if (sp) {
      addProp(P.PIER, x - Math.cos(a) * 7, z - Math.sin(a) * 7, Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI / 2, 1);
      boats++;
    }
  }
  // Phares sur la côte
  let lights = 0;
  guard = 0;
  while (lights < 3 && guard++ < 30000 && buildings.length < TOTAL_BUILDINGS) {
    const side = ri(0, 3);
    const t = rr(-700, 700);
    const x = side === 0 ? -840 : side === 1 ? 840 : t, z = side === 2 ? -840 : side === 3 ? 840 : t;
    const xx = side < 2 ? x : t, zz = side < 2 ? t : z;
    if (Hpre(xx, zz) < 1.0) continue;
    if (tryPlace(K.LIGHTHOUSE, xx, zz, { pad: true })) lights++;
  }
  guard = 0;
  while (buildings.length < TOTAL_BUILDINGS && guard++ < 200000) {
    const x = rr(-900, 900), z = rr(-900, 900);
    if (Math.hypot(x, z) < 70) continue;
    if (TOWNS.some((t) => Math.hypot(t.x - x, t.z - z) < t.r * 1.1)) continue;
    const kind = pick(fillKinds);
    const by = Hpre(x, z);
    if (by < 2 || by > 50) continue;
    tryPlace(kind, x, z, { pad: true });
  }
  console.log('   bâtiments au total:', buildings.length);
}

/* ------------------------------------------------------------------ */
/* Champs (peinture) et couverture du sol                              */
/* ------------------------------------------------------------------ */
function fieldInfo(x, z) {
  let best = null;
  for (let fi = 0; fi < FARMS.length; fi++) {
    const f = FARMS[fi];
    const d = Math.hypot(x - f.x, z - f.z);
    if (d > 190 || d < 62) continue;
    if (!best || d < best.d) best = { f, fi, d };
  }
  if (!best) return null;
  const ca = Math.cos(best.f.ang), sa = Math.sin(best.f.ang);
  const u = (x - best.f.x) * ca + (z - best.f.z) * sa;
  const v = -(x - best.f.x) * sa + (z - best.f.z) * ca;
  const ci = Math.floor(u / 38), cj = Math.floor(v / 38);
  const fu = u - ci * 38, fv = v - cj * 38;
  if (fu < 1.8 || fu > 36.2 || fv < 1.8 || fv > 36.2) return { edge: true };
  const hsh = hash(ci, cj, 600 + best.fi);
  if (hsh < 0.18) return null;
  for (const p of pastures) if (Math.abs(x - p.x) < p.w / 2 + 3 && Math.abs(z - p.z) < p.d / 2 + 3) return null;
  return { type: Math.floor(hsh * 6) % 6, stripe: Math.sin(v * 1.9) * 0.5 + 0.5, hsh };
}

const forestDensity = (x, z) => smooth(0.47, 0.63, fbm(x * 0.0042, z * 0.0042, 4, 501));
const townWeight = (x, z) => {
  let w = 0;
  for (const t of TOWNS) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < t.r * 1.3) w = Math.max(w, 1 - smooth(t.r * 0.9, t.r * 1.25, d));
  }
  for (const c of CAMPS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < 60) w = Math.max(w, 1 - smooth(25, 55, d) * 1);
  }
  for (const f of FARMS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < 60) w = Math.max(w, 0.8 * (1 - smooth(28, 58, d)));
  }
  return w;
};

function colorAt(x, z, h, slope, tw) {
  const n = fbm(x * 0.03, z * 0.03, 3, 700);
  const n2 = fbm(x * 0.18, z * 0.18, 2, 701);
  // base herbe
  let r = lerp(76, 98, n), g = lerp(112, 132, n), b = lerp(46, 54, n);
  const dry = smooth(0.55, 0.8, fbm(x * 0.006, z * 0.006, 3, 702));
  r = lerp(r, 134, dry * 0.5); g = lerp(g, 128, dry * 0.45); b = lerp(b, 70, dry * 0.3);
  r += (n2 - 0.5) * 14; g += (n2 - 0.5) * 16; b += (n2 - 0.5) * 8;
  // forêt
  const fd = forestDensity(x, z);
  r = lerp(r, 46, fd * 0.55); g = lerp(g, 80, fd * 0.55); b = lerp(b, 38, fd * 0.5);
  // altitude / roche / neige
  const alt = smooth(34, 58, h);
  r = lerp(r, 128, alt * 0.75); g = lerp(g, 122, alt * 0.7); b = lerp(b, 112, alt * 0.7);
  const rock = smooth(0.42, 0.75, slope);
  r = lerp(r, 118 + n2 * 20, rock); g = lerp(g, 114 + n2 * 20, rock); b = lerp(b, 106 + n2 * 18, rock);
  if (h > 62) { const s = smooth(62, 70, h + (n - 0.5) * 8) * (1 - rock * 0.5); r = lerp(r, 240, s); g = lerp(g, 244, s); b = lerp(b, 248, s); }
  // champs
  const fi = fieldInfo(x, z);
  if (fi) {
    if (fi.edge) { r = lerp(r, 70, 0.6); g = lerp(g, 98, 0.6); b = lerp(b, 44, 0.6); }
    else {
      const cols = [[196, 170, 72], [88, 140, 52], [112, 78, 52], [210, 176, 40], [110, 150, 80], [150, 168, 70]];
      const c = cols[fi.type];
      const k = 0.88 + fi.stripe * 0.2;
      r = c[0] * k; g = c[1] * k; b = c[2] * k;
    }
  }
  // pâturages
  for (const p of pastures) {
    if (Math.abs(x - p.x) < p.w / 2 + 2 && Math.abs(z - p.z) < p.d / 2 + 2) { r = 110 + n * 20; g = 150 + n * 14; b = 62; }
  }
  // zones urbaines
  if (tw > 0.01) {
    const cell = hash(Math.floor(x / 11), Math.floor(z / 11), 703);
    const lawn = cell < 0.6;
    const cr = lawn ? 92 + n2 * 14 : 138 + n2 * 10, cg = lawn ? 138 + n2 * 14 : 136 + n2 * 10, cb = lawn ? 62 : 128;
    r = lerp(r, cr, tw * 0.85); g = lerp(g, cg, tw * 0.85); b = lerp(b, cb, tw * 0.85);
  }
  // rivage et lit
  if (h < 1.4) {
    const sandW = smooth(1.4, 0.2, h);
    r = lerp(r, 200 + n2 * 10, sandW); g = lerp(g, 184 + n2 * 10, sandW); b = lerp(b, 140, sandW);
  }
  if (h < 0.1) {
    const dep = smooth(0, -3.5, h);
    r = lerp(150, 84, dep); g = lerp(140, 92, dep); b = lerp(100, 74, dep);
  }
  // routes
  const rn = roadNear(x, z);
  if (rn && rn.d < 1.2 && h > 0.15) {
    const t = rn.type;
    if (rn.d < 0) {
      if (t === 2) { r = 136 + n2 * 14; g = 112 + n2 * 12; b = 80; }
      else {
        const base = t === 1 ? 54 : 62;
        r = base + n2 * 8; g = base + n2 * 8; b = base + 4 + n2 * 8;
        // axe central pointillé
        const along = (x * 0.3 + z * 0.7);
        if (rn.d > -0.18 * rn.hw - 0.2 && Math.floor(along / 3.5) % 2 === 0 && rn.hw > 3.2) { r = 205; g = 190; b = 90; }
        if (rn.d < -rn.hw + 0.35) { r = 190; g = 190; b = 186; }
      }
    } else if (t !== 2) { r = lerp(r, 160, 0.6); g = lerp(g, 160, 0.6); b = lerp(b, 156, 0.6); }
  }
  // dalles autour des piscines
  for (const p of poolsNear(x, z)) {
    if (Math.abs(x - p[0]) < p[2] / 2 + 2.2 && Math.abs(z - p[1]) < p[3] / 2 + 2.2) { r = 188; g = 186; b = 178; }
  }
  return [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)];
}
const poolGrid = new Map();
for (const p of pools) {
  const key = Math.floor(p[0] / 64) * 4096 + Math.floor(p[1] / 64);
  if (!poolGrid.has(key)) poolGrid.set(key, []);
  poolGrid.get(key).push(p);
}
function poolsNear(x, z) {
  const out = [];
  const ci = Math.floor(x / 64), cj = Math.floor(z / 64);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const l = poolGrid.get(i * 4096 + j);
    if (l) out.push(...l);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Faune sauvage et arbres (globaux, répartis ensuite par chunk)        */
/* ------------------------------------------------------------------ */
console.log('4/6 Faune…');
const A = { COW: 0, SHEEP: 1, HORSE: 2, DEER: 3, RABBIT: 4, FOX: 5, DOG: 6, BOAR: 7, DUCK: 8, SWAN: 9, FISH: 10, CROW: 11, EAGLE: 12, GOAT: 13, CHICKEN: 14, PIG: 15, CAT: 16 };
function scatterAnimals(type, count, groupMin, groupMax, test, spread = 14) {
  let placed = 0, guard = 0;
  while (placed < count && guard++ < 200000) {
    const x = rr(-880, 880), z = rr(-880, 880);
    if (!test(x, z)) continue;
    const g = ri(groupMin, groupMax);
    for (let k = 0; k < g && placed < count; k++) {
      const ax = x + rr(-spread, spread), az = z + rr(-spread, spread);
      if (!test(ax, az)) continue;
      animals.push([type, r1(ax), r1(az), ri(1, 99999)]);
      placed++;
    }
  }
}
const onLand = (x, z) => Hpre(x, z) > 2 && roadNear(x, z)?.d > 6 && !occHit(x, z, 3, 3);
const inForest = (x, z) => onLand(x, z) && forestDensity(x, z) > 0.55 && Hpre(x, z) < 50;
const inMeadow = (x, z) => onLand(x, z) && forestDensity(x, z) < 0.3 && Hpre(x, z) < 35;
const inWater = (x, z) => Hpre(x, z) < -0.8 && Math.max(Math.abs(x), Math.abs(z)) < 820;
const onRocks = (x, z) => onLand(x, z) && Hpre(x, z) > 38 && Hpre(x, z) < 70;
scatterAnimals(A.DEER, 90, 2, 5, inForest);
scatterAnimals(A.BOAR, 30, 2, 4, inForest);
scatterAnimals(A.FOX, 24, 1, 2, inForest, 6);
scatterAnimals(A.RABBIT, 70, 1, 3, inMeadow, 6);
scatterAnimals(A.GOAT, 36, 2, 5, onRocks);
scatterAnimals(A.DUCK, 60, 3, 6, inWater, 8);
scatterAnimals(A.SWAN, 16, 1, 3, inWater, 6);
scatterAnimals(A.FISH, 110, 2, 5, inWater, 6);
scatterAnimals(A.CROW, 36, 3, 6, (x, z) => Hpre(x, z) > 2, 20);
scatterAnimals(A.EAGLE, 14, 1, 2, (x, z) => Hpre(x, z) > 30, 10);
for (const tw of TOWNS) {
  for (let k = 0; k < (tw.type === 'city' ? 8 : 4); k++) {
    const a = rr(0, 6.283), r = rr(10, tw.r * 0.8);
    animals.push([A.DOG, r1(tw.x + Math.cos(a) * r), r1(tw.z + Math.sin(a) * r), ri(1, 99999)]);
    animals.push([A.CAT, r1(tw.x + Math.cos(a + 1) * r), r1(tw.z + Math.sin(a + 1) * r), ri(1, 99999)]);
  }
}
for (const c of CAMPS) animals.push([A.DOG, r1(c.x + rr(-15, 15)), r1(c.z + rr(-15, 15)), ri(1, 99999)]);

/* ------------------------------------------------------------------ */
/* Écriture des chunks                                                 */
/* ------------------------------------------------------------------ */
console.log('5/6 Écriture des 100 chunks (terrain + peinture)…');
fs.mkdirSync(OUT, { recursive: true });

// Répartition des objets par chunk
function chunkOf(x, z) {
  return [clamp(Math.floor((x + HALF) / CH), 0, NC - 1), clamp(Math.floor((z + HALF) / CH), 0, NC - 1)];
}
const chunkObjs = [];
for (let i = 0; i < NC; i++) { chunkObjs.push([]); for (let j = 0; j < NC; j++) chunkObjs[i].push({ b: [], p: [], a: [], w: [], br: [], t: [] }); }
for (const b of buildings) { const [i, j] = chunkOf(b[1], b[2]); chunkObjs[i][j].b.push(b); }
for (const p of props) { const [i, j] = chunkOf(p[1], p[2]); chunkObjs[i][j].p.push(p); }
for (const a of animals) { const [i, j] = chunkOf(a[1], a[2]); chunkObjs[i][j].a.push(a); }
for (const w of pools) { const [i, j] = chunkOf(w[0], w[1]); chunkObjs[i][j].w.push(w); }
for (const b of bridges) { const [i, j] = chunkOf((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); chunkObjs[i][j].br.push(b); }

let totalBytes = 0, totalTrees = 0;
const stats = { minH: 1e9, maxH: -1e9 };
const heights = new Float32Array(HN * HN);
const t0 = Date.now();
for (let cx = 0; cx < NC; cx++) {
  for (let cz = 0; cz < NC; cz++) {
    const x0 = -HALF + cx * CH, z0 = -HALF + cz * CH;
    // hauteurs
    let minH = 1e9, maxH = -1e9;
    for (let j = 0; j < HN; j++) {
      for (let i = 0; i < HN; i++) {
        const h = H(x0 + (i * CH) / (HN - 1), z0 + (j * CH) / (HN - 1));
        heights[j * HN + i] = h;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    minH = Math.floor(minH * 10) / 10 - 0.1;
    maxH = Math.ceil(maxH * 10) / 10 + 0.1;
    stats.minH = Math.min(stats.minH, minH); stats.maxH = Math.max(stats.maxH, maxH);
    const hq = new Uint16Array(HN * HN);
    for (let k = 0; k < hq.length; k++) hq[k] = Math.round(((heights[k] - minH) / (maxH - minH)) * 65535);
    const hAt = (x, z) => {
      const fx = clamp(((x - x0) / CH) * (HN - 1), 0, HN - 1.001), fz = clamp(((z - z0) / CH) * (HN - 1), 0, HN - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = heights[j * HN + i], b = heights[j * HN + i + 1], c = heights[(j + 1) * HN + i], d = heights[(j + 1) * HN + i + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    // peinture
    const splat = new Uint8Array(SN * SN * 4);
    const cell = CH / SN;
    for (let j = 0; j < SN; j++) {
      for (let i = 0; i < SN; i++) {
        const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
        const h = hAt(x, z);
        const sl = Math.max(Math.abs(hAt(x + 2.5, z) - hAt(x - 2.5, z)), Math.abs(hAt(x, z + 2.5) - hAt(x, z - 2.5))) / 5;
        const col = colorAt(x, z, h, sl, townWeight(x, z));
        const o = (j * SN + i) * 4;
        splat[o] = col[0]; splat[o + 1] = col[1]; splat[o + 2] = col[2];
        splat[o + 3] = h < 0 ? clamp(Math.round(-h * 40), 1, 254) : 255;
      }
    }
    // arbres
    const trees = [];
    const spacing = 5;
    for (let gj = 0; gj < CH / spacing; gj++) {
      for (let gi = 0; gi < CH / spacing; gi++) {
        const x = x0 + (gi + rng()) * spacing, z = z0 + (gj + rng()) * spacing;
        if (Math.abs(x) > 930 || Math.abs(z) > 930) continue;
        const h = hAt(x, z);
        if (h < 1.5 || h > 56) continue;
        const tw = townWeight(x, z);
        let dens = forestDensity(x, z) * 0.85 + 0.035;
        dens *= 1 - smooth(0.2, 0.7, tw) * 0.9;
        if (tw > 0.2) dens = 0.02;
        if (dens < rng()) continue;
        const rn = roadNear(x, z);
        if (rn && rn.d < 3) continue;
        if (occHit(x, z, 2.5, 2.5)) continue;
        const fi = fieldInfo(x, z);
        if (fi && !fi.edge) continue;
        if (pastures.some((p) => Math.abs(x - p.x) < p.w / 2 + 2 && Math.abs(z - p.z) < p.d / 2 + 2)) continue;
        if (poolsNear(x, z).some((p) => Math.abs(x - p[0]) < p[2] / 2 + 3 && Math.abs(z - p[1]) < p[3] / 2 + 3)) continue;
        let kind;
        const q = rng();
        if (h > 34) kind = q < 0.8 ? 0 : 3;
        else if (h < 3.5) kind = q < 0.5 ? 2 : q < 0.8 ? 1 : 3;
        else kind = q < 0.4 ? 1 : q < 0.7 ? 0 : q < 0.82 ? 2 : q < 0.92 ? 3 : 4;
        trees.push(r1(x), r1(z), kind, r2(0.7 + rng() * 0.9));
      }
    }
    totalTrees += trees.length / 4;
    const objs = chunkObjs[cx][cz];
    const json = JSON.stringify({ b: objs.b, p: objs.p, a: objs.a, w: objs.w, br: objs.br, t: trees });
    const jb = Buffer.from(json, 'utf8');
    const HEADER = 24;
    const buf = Buffer.alloc(HEADER + hq.byteLength + splat.byteLength + jb.length);
    buf.write('ESM1', 0, 'ascii');
    buf.writeUInt16LE(cx, 4); buf.writeUInt16LE(cz, 6);
    buf.writeUInt16LE(HN, 8); buf.writeUInt16LE(SN, 10);
    buf.writeFloatLE(minH, 12); buf.writeFloatLE(maxH, 16);
    buf.writeUInt32LE(jb.length, 20);
    Buffer.from(hq.buffer).copy(buf, HEADER);
    Buffer.from(splat.buffer).copy(buf, HEADER + hq.byteLength);
    jb.copy(buf, HEADER + hq.byteLength + splat.byteLength);
    fs.writeFileSync(path.join(OUT, `chunk_${cx}_${cz}.bin`), buf);
    totalBytes += buf.length;
  }
  process.stdout.write(`   colonne ${cx + 1}/${NC} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
}

/* ------------------------------------------------------------------ */
/* Manifest                                                            */
/* ------------------------------------------------------------------ */
console.log('6/6 Manifest…');
const manifest = {
  format: 'ESM1',
  name: 'Vallée des Élites',
  seed: SEED,
  size: HALF * 2,
  chunkSize: CH,
  chunksPerSide: NC,
  heightSamples: HN,
  splatSamples: SN,
  waterLevel: 0,
  player: { x: 0, z: 0, towerY: r2(PLAYER_Y), eyeHeight: 10.6 },
  towns: TOWNS.map((t) => ({ name: t.name, type: t.type, x: t.x, z: t.z, r: t.r, buildings: t.placed })),
  camps: CAMPS,
  farms: FARMS.map((f) => ({ x: f.x, z: f.z })),
  rivers: RIVERS.map((r) => r.name),
  lakes: LAKES,
  counts: {
    buildings: buildings.length,
    uniqueBuildings: sigs.size,
    pools: pools.length,
    props: props.length,
    animals: animals.length,
    trees: totalTrees,
    bridges: bridges.length,
    roadSegments: roads.length,
    kinds: sandboxCounts.kinds,
  },
  kindNames: KIND_NAMES,
  files: NC * NC,
  bytes: totalBytes,
};
/* ------------------------------------------------------------------ */
/* Missions, véhicules, point de départ (positions validées)           */
/* ------------------------------------------------------------------ */
{
  const mr = mulberry32(SEED + 99);
  const mrr = (a, b) => a + mr() * (b - a);
  function spotNear(cx, cz, rmin, rmax, o = {}) {
    for (let t = 0; t < 6000; t++) {
      const a = mr() * 6.2832, r = rmin + mr() * (Math.max(rmax - rmin, 4) + t * 0.05);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x) > 900 || Math.abs(z) > 900) continue;
      if (Hpre(x, z) < 1.3) continue;
      if (occHit(x, z, 2.2, 2.2)) continue;
      if (slopeAt(x, z, 3) > 0.4) continue;
      if (poolsNear(x, z).some((p) => Math.abs(x - p[0]) < p[2] / 2 + 4 && Math.abs(z - p[1]) < p[3] / 2 + 4)) continue;
      if (o.avoid && o.avoid.some((q) => Math.hypot(q.x - x, q.z - z) < (o.sep || 4))) continue;
      return { x: r1(x), z: r1(z) };
    }
    throw new Error(`Aucun emplacement valide près de ${cx.toFixed(0)},${cz.toFixed(0)}`);
  }
  const group = (cx, cz, n, rmin, rmax, officers = 0) => {
    const out = [];
    for (let i = 0; i < n + officers; i++) {
      const s = spotNear(cx, cz, rmin, rmax, { avoid: out, sep: 5 });
      out.push({ x: s.x, z: s.z, k: i < officers ? 'officer' : 'soldier' });
    }
    return out;
  };
  const townByName = (n) => TOWNS.find((t) => t.name === n);
  const towardTower = (t, frac) => { const d = Math.hypot(t.x, t.z) || 1; return { x: t.x - (t.x / d) * t.r * frac, z: t.z - (t.z / d) * t.r * frac }; };
  const C = CAMPS;
  if (C.length < 8) throw new Error('Pas assez de camps pour les missions');

  // départs des missions près de la tour : anneau de 5 balises
  const ring = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    ring.push(spotNear(Math.cos(a) * 13, Math.sin(a) * 13, 0, 3, { avoid: ring, sep: 5 }));
  }
  const towerSpot = spotNear(0, 0, 3, 8);
  const crestFor = (c, f) => spotNear(c.x * f, c.z * f, 0, 12);
  const farFarm = FARMS.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).find((f) => Math.hypot(f.x, f.z) > 300) || FARMS[FARMS.length - 1];
  const BA = townByName('Base Alpha'), PE = townByName('Port-Élite'), ZI = townByName('Zone Industrielle Nord');
  const RO = townByName('Rochefort'), SA = townByName('Saint-Aubin'), VA = townByName('Valmont'), MA = townByName('Marnes');
  const cp = (c, rmin = 6, rmax = 20) => spotNear(c.x, c.z, rmin, rmax);
  const edge = (t, f = 0.9) => { const p = towardTower(t, -f * 0 + f * -1); return spotNear(t.x + (p.x - t.x) * -1 * 0 + (towardTower(t, f).x - t.x), t.z + (towardTower(t, f).z - t.z), 0, 14); };

  const missions = [
    { id: 1, name: 'Poste de tir', reward: 500, time: 0, start: ring[0], loadout: 'sniper',
      brief: 'Prenez position sur la crête puis éliminez les gardes du camp au nord avec le fusil de précision.',
      steps: [
        { type: 'goto', ...crestFor(C[0], 0.55), r: 7, text: 'Rejoignez la crête' },
        { type: 'kill', spawns: group(C[0].x, C[0].z, 3, 6, 24), text: 'Éliminez les gardes du camp' },
      ] },
    { id: 2, name: 'Fouille de la ferme', reward: 700, time: 0, start: ring[1],
      brief: 'Nettoyez la ferme, récupérez trois documents puis revenez au poste.',
      steps: [
        { type: 'kill', spawns: group(C[1].x, C[1].z, 4, 6, 26), text: 'Éliminez les occupants de la ferme' },
        { type: 'collect', points: [cp(C[1]), cp(C[1], 8, 24), cp(C[1], 10, 28)], text: 'Récupérez les documents', item: 'document' },
        { type: 'goto', ...towerSpot, r: 8, text: 'Retournez au poste' },
      ] },
    { id: 3, name: 'Colis sensible', reward: 800, time: 260, start: ring[2],
      brief: 'Récupérez le colis à la station-service puis livrez-le à la ferme avant la fin du temps. Un véhicule aide.',
      steps: [
        { type: 'collect', points: [cp(C[3], 5, 18)], text: 'Récupérez le colis à la station-service', item: 'colis' },
        { type: 'goto', ...spotNear(farFarm.x, farFarm.z, 6, 24), r: 8, text: 'Livrez le colis à la ferme' },
      ] },
    { id: 4, name: 'Contre la montre', reward: 900, time: 200, start: ring[3],
      brief: 'Passez les cinq points de contrôle le plus vite possible.',
      steps: [C[4], C[5], C[2], C[7]].map((c, i) => ({ type: 'goto', ...cp(c, 4, 20), r: 9, text: `Point de contrôle ${i + 1}/5` })).concat([{ type: 'goto', ...towerSpot, r: 9, text: 'Point de contrôle 5/5 : le poste' }]) },
    { id: 5, name: 'Chasse au colonel', reward: 1400, time: 0, start: ring[4], loadout: 'all',
      brief: 'Un officier se cache dans le camp militaire. Éliminez-le, lui et ses gardes, puis fuyez.',
      steps: [
        { type: 'kill', spawns: group(C[7].x, C[7].z, 3, 6, 26, 1), text: "Éliminez l'officier et ses gardes" },
        { type: 'goto', ...spotNear(C[7].x * 0.4, C[7].z * 0.4, 0, 20), r: 10, text: 'Repliez-vous vers le poste' },
      ] },
    { id: 6, name: 'Assaut sur la base Alpha', reward: 2200, time: 0, start: spotNear(towardTower(BA, 0.95).x, towardTower(BA, 0.95).z, 0, 12), loadout: 'all',
      brief: 'Infiltrez la base militaire et neutralisez la garnison.',
      steps: [
        { type: 'kill', spawns: group(BA.x, BA.z, 8, 8, BA.r * 0.7, 1), text: 'Neutralisez la garnison' },
        { type: 'goto', ...spotNear(towardTower(BA, 0.95).x, towardTower(BA, 0.95).z, 0, 14), r: 9, text: 'Sortez de la base' },
      ] },
    { id: 7, name: 'Sniper au port', reward: 1800, time: 420, start: spotNear(PE.x + 270, PE.z + 20, 0, 40), loadout: 'sniper',
      brief: "Depuis la rive d'en face, éliminez les cibles dans la ville portuaire. Surveillez le vent et la chute de balle.",
      steps: [
        { type: 'kill', spawns: group(PE.x, PE.z, 6, 20, PE.r * 0.55, 1), text: 'Éliminez les cibles du port' },
      ] },
    { id: 8, name: 'Zone industrielle', reward: 2000, time: 0, start: spotNear(towardTower(ZI, 0.95).x, towardTower(ZI, 0.95).z, 0, 12),
      brief: 'Éliminez les gardes, récupérez trois caisses et sortez.',
      steps: [
        { type: 'kill', spawns: group(ZI.x, ZI.z, 6, 10, ZI.r * 0.6), text: 'Éliminez les gardes' },
        { type: 'collect', points: [0, 1, 2].map(() => spotNear(ZI.x, ZI.z, 15, ZI.r * 0.7)), text: 'Récupérez les caisses', item: 'caisse' },
        { type: 'goto', ...spotNear(towardTower(ZI, 0.95).x, towardTower(ZI, 0.95).z, 0, 14), r: 9, text: 'Quittez la zone' },
      ] },
    { id: 9, name: 'Le convoi', reward: 2600, time: 0, start: spotNear(towardTower(RO, 0.95).x, towardTower(RO, 0.95).z, 0, 12), loadout: 'all',
      brief: 'Deux groupes tiennent deux villes. Nettoyez-les l’une après l’autre.',
      steps: [
        { type: 'kill', spawns: group(RO.x, RO.z, 5, 10, RO.r * 0.6), text: 'Libérez Rochefort' },
        { type: 'goto', ...spotNear(towardTower(SA, 0.8).x, towardTower(SA, 0.8).z, 0, 12), r: 9, text: 'Rejoignez Saint-Aubin' },
        { type: 'kill', spawns: group(SA.x, SA.z, 5, 10, SA.r * 0.6, 1), text: 'Libérez Saint-Aubin' },
      ] },
    { id: 10, name: 'Le grand nettoyage', reward: 4000, time: 0, start: spotNear(towardTower(VA, 0.95).x, towardTower(VA, 0.95).z, 0, 12), loadout: 'all',
      brief: "L'opération finale : trois villes, vingt hommes. Faites le ménage.",
      steps: [
        { type: 'kill', spawns: group(VA.x, VA.z, 6, 10, VA.r * 0.6), text: 'Libérez Valmont' },
        { type: 'goto', ...spotNear(MA.x, MA.z, 4, 20), r: 9, text: 'Rejoignez Marnes' },
        { type: 'kill', spawns: group(MA.x, MA.z, 6, 6, MA.r * 0.8), text: 'Libérez Marnes' },
        { type: 'goto', ...spotNear(towardTower(PE, 0.9).x, towardTower(PE, 0.9).z, 0, 14), r: 9, text: 'Rejoignez Port-Élite' },
        { type: 'kill', spawns: group(PE.x, PE.z, 7, 15, PE.r * 0.6, 1), text: 'Libérez Port-Élite' },
      ] },
  ];

  // véhicules garés
  const vehicles = [];
  const parked = [];
  const addVeh = (x, z, h, v) => { vehicles.push([r1(x), r1(z), r2(h), v]); parked.push({ x, z }); };
  for (let i = 0; i < 3; i++) { const s = spotNear(0, 0, 16, 26, { avoid: parked, sep: 7 }); addVeh(s.x, s.z, mrr(0, 6.28), i); }
  for (const t of TOWNS) {
    const want = t.type === 'city' ? 5 : t.type === 'village' ? 2 : 3;
    let got = 0;
    for (let tries = 0; tries < 3000 && got < want; tries++) {
      const a = mr() * 6.2832, r = mr() * t.r * 0.75;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      const rn = roadNear(x, z);
      if (!rn || rn.type !== 0 || rn.d > -1.2 || rn.d < -rn.hw + 1.4) continue;
      if (parked.some((q) => Math.hypot(q.x - x, q.z - z) < 12)) continue;
      const sg = rn.seg;
      addVeh(x, z, Math.atan2(sg.x1 - sg.x0, sg.z1 - sg.z0) + (mr() < 0.5 ? 0 : Math.PI), t.type === 'military' ? 3 : t.type === 'industrial' ? 4 : ri(0, 2));
      got++;
    }
  }
  for (const c of CAMPS.filter((q) => q.kind === 'military')) { const s = spotNear(c.x, c.z, 10, 30, { avoid: parked, sep: 8 }); addVeh(s.x, s.z, mrr(0, 6.28), 3); }

  manifest.spawn = { x: towerSpot.x, z: towerSpot.z, yaw: 0 };
  manifest.safehouse = { x: 0, z: 0, r: 7 };
  manifest.missions = missions;
  manifest.vehicles = vehicles;
  console.log('   missions:', missions.length, ' véhicules:', vehicles.length);
  for (const m of missions) console.log('   #' + m.id, m.name.padEnd(26), m.steps.map((s) => s.type + (s.spawns ? '×' + s.spawns.length : s.points ? '×' + s.points.length : '')).join(' → '), '| départ', m.start.x, m.start.z);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

console.log('');
console.log('=== Carte générée ===');
console.log('Fichiers chunk :', NC * NC, '+ manifest.json');
console.log('Taille totale  :', (totalBytes / 1048576).toFixed(2), 'Mo');
console.log('Bâtiments      :', buildings.length, '(signatures uniques :', sigs.size + ')');
console.log('Piscines/bassins:', pools.length, ' Ponts:', bridges.length, ' Props:', props.length);
console.log('Animaux        :', animals.length, ' Arbres:', totalTrees);
console.log('Altitudes      :', stats.minH.toFixed(1), '→', stats.maxH.toFixed(1), 'm');
