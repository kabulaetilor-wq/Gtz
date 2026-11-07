// Noyau du monde (sans dépendance graphique) : hauteur du terrain, collisions, rayons, arbres.
// Utilisable sous Node pour les tests.
export const CH = 200;
export const NC = 10;
export const HALF = 1000;
const CELL = 32;

const chunks = new Map();
const cells = new Map();
let stamp = 0;

export const chunkKey = (cx, cz) => cx * 16 + cz;

export function registerChunk(ch) {
  // ch : { cx, cz, HN, minH, maxH, heights, trees }
  ch.x0 = -HALF + ch.cx * CH;
  ch.z0 = -HALF + ch.cz * CH;
  ch.range = ch.maxH - ch.minH;
  ch.key = chunkKey(ch.cx, ch.cz);
  ch.boxRefs = [];
  chunks.set(ch.key, ch);
}

export function unregisterChunk(key) {
  const ch = chunks.get(key);
  if (!ch) return;
  for (const [ck, box] of ch.boxRefs) {
    const arr = cells.get(ck);
    if (!arr) continue;
    const i = arr.indexOf(box);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) cells.delete(ck);
  }
  chunks.delete(key);
}

export const isLoaded = (cx, cz) => chunks.has(chunkKey(cx, cz));
export const loadedChunks = () => chunks;

export function heightAt(x, z) {
  const cx = Math.floor((x + HALF) / CH);
  const cz = Math.floor((z + HALF) / CH);
  if (cx < 0 || cz < 0 || cx >= NC || cz >= NC) return -4.5;
  const ch = chunks.get(cx * 16 + cz);
  if (!ch) return 0;
  const N = ch.HN - 1;
  let fx = ((x - ch.x0) / CH) * N;
  let fz = ((z - ch.z0) / CH) * N;
  if (fx < 0) fx = 0; else if (fx > N - 0.001) fx = N - 0.001;
  if (fz < 0) fz = 0; else if (fz > N - 0.001) fz = N - 0.001;
  const i = fx | 0, j = fz | 0;
  const u = fx - i, v = fz - j;
  const H = ch.heights, W = ch.HN;
  const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
  const q = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  return ch.minH + (q / 65535) * ch.range;
}

export const isWater = (x, z) => heightAt(x, z) < 0.05;

/* ---------- Collisions (boîtes alignées sur les axes) ---------- */
const cellKey = (ix, iz) => (ix + 64) * 256 + (iz + 64);

// boxes : tableaux [x0,y0,z0,x1,y1,z1]
export function addBoxes(key, boxes) {
  const ch = chunks.get(key);
  if (!ch) return;
  for (const b of boxes) {
    const box = { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5], st: 0 };
    for (let ix = Math.floor(box.x0 / CELL); ix <= Math.floor(box.x1 / CELL); ix++) {
      for (let iz = Math.floor(box.z0 / CELL); iz <= Math.floor(box.z1 / CELL); iz++) {
        const ck = cellKey(ix, iz);
        let arr = cells.get(ck);
        if (!arr) { arr = []; cells.set(ck, arr); }
        arr.push(box);
        ch.boxRefs.push([ck, box]);
      }
    }
  }
}

export function boxCount() {
  const set = new Set();
  for (const arr of cells.values()) for (const b of arr) set.add(b);
  return set.size;
}

function rayBox(ox, oy, oz, dx, dy, dz, b, maxLen) {
  let t0 = 0, t1 = maxLen;
  if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return -1; }
  else { let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx; if (a > c) { const t = a; a = c; c = t; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return -1; }
  if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return -1; }
  else { let a = (b.y0 - oy) / dy, c = (b.y1 - oy) / dy; if (a > c) { const t = a; a = c; c = t; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return -1; }
  else { let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz; if (a > c) { const t = a; a = c; c = t; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return -1; }
  return t0;
}

// Distance au premier obstacle sur le rayon (dir normalisé), ou Infinity.
export function rayBoxes(origin, dir, maxLen) {
  const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
  stamp++;
  let best = Infinity;
  const step = 8;
  let lastKey = -1;
  for (let s = 0; ; s += step) {
    const t = s > maxLen ? maxLen : s;
    if (t > best + CELL) break;
    const ck = cellKey(Math.floor((ox + dx * t) / CELL), Math.floor((oz + dz * t) / CELL));
    if (ck !== lastKey) {
      lastKey = ck;
      const arr = cells.get(ck);
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          if (b.st === stamp) continue;
          b.st = stamp;
          const d = rayBox(ox, oy, oz, dx, dy, dz, b, maxLen);
          if (d >= 0 && d < best) best = d;
        }
      }
    }
    if (t >= maxLen) break;
  }
  return best;
}

// Un point (x,z) est-il dans l'emprise d'un bâtiment (marge pad) ?
export function inCollider(x, z, pad = 0) {
  const arr = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!arr) return false;
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
  }
  return false;
}

export function treeNear(x, z, r) {
  const cx = Math.floor((x + HALF) / CH), cz = Math.floor((z + HALF) / CH);
  const ch = chunks.get(cx * 16 + cz);
  if (!ch || !ch.trees) return false;
  const t = ch.trees, r2 = r * r;
  for (let i = 0; i < t.length; i += 4) {
    const dx = t[i] - x, dz = t[i + 1] - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/* =====================================================================
   Ponts praticables, sol, déplacement des acteurs (joueur, véhicules, ennemis)
   ===================================================================== */
const bridges = [];

export function registerBridges(key, list) {
  for (const [x0, z0, x1, z1, deckY, width, yA = deckY, yB = deckY] of list) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1) continue;
    bridges.push({ key, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ux: (x1 - x0) / L, uz: (z1 - z0) / L, L, yA, yB, hw: width / 2 });
  }
}
export function unregisterBridges(key) {
  for (let i = bridges.length - 1; i >= 0; i--) if (bridges[i].key === key) bridges.splice(i, 1);
}

// Hauteur du sol praticable : terrain, ou tablier d'un pont (avec rampe de 4 m aux extrémités)
export function groundAt(x, z) {
  const h = heightAt(x, z);
  for (let i = 0; i < bridges.length; i++) {
    const b = bridges[i];
    const dx = x - b.cx, dz = z - b.cz;
    const u = dx * b.ux + dz * b.uz, v = -dx * b.uz + dz * b.ux;
    if (Math.abs(v) > b.hw - 0.35) continue;
    const e = b.L / 2 - Math.abs(u);
    if (e <= 0) continue;
    const t = Math.min(1, e / 4);
    const deck = b.yA + (b.yB - b.yA) * ((u + b.L / 2) / b.L);
    const g = h + (deck - h) * t;
    if (g > h) return g;
  }
  return h;
}

export const WATER_WALK_LIMIT = -0.35;
export const isLoadedAt = (x, z) => chunks.has(Math.floor((x + HALF) / CH) * 16 + Math.floor((z + HALF) / CH));

const _stampBoxes = { n: 0 };
// Pousse le cercle (rayon r) hors des boîtes qui bloquent entre les hauteurs y0 (pieds) et y1 (tête). Modifie p.x / p.z.
export function pushOut(p, r, y0, y1) {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    const ix = Math.floor(p.x / CELL), iz = Math.floor(p.z / CELL);
    _stampBoxes.n++;
    const st = -_stampBoxes.n; // marquage distinct du lancer de rayons
    for (let cx = ix - 1; cx <= ix + 1; cx++) {
      for (let cz = iz - 1; cz <= iz + 1; cz++) {
        const arr = cells.get(cellKey(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          if (b.pst === st) continue;
          b.pst = st;
          if (b.y1 < y0 + 0.45 || b.y0 > y1) continue;
          if (p.x < b.x0 - r || p.x > b.x1 + r || p.z < b.z0 - r || p.z > b.z1 + r) continue;
          const qx = p.x < b.x0 ? b.x0 : p.x > b.x1 ? b.x1 : p.x;
          const qz = p.z < b.z0 ? b.z0 : p.z > b.z1 ? b.z1 : p.z;
          const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), k = (r - d) / d;
            p.x += dx * k; p.z += dz * k;
          } else {
            const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z;
            const m = Math.min(l, rr, t, bb);
            if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r;
          }
        }
      }
    }
  }
  return hit;
}

// Troncs d'arbres (pas les buissons)
export function pushTrees(p, r) {
  let hit = false;
  const cx = Math.floor((p.x + HALF) / CH), cz = Math.floor((p.z + HALF) / CH);
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const ch = chunks.get((cx + a) * 16 + (cz + b));
      if (!ch || !ch.trees) continue;
      const t = ch.trees;
      for (let i = 0; i < t.length; i += 4) {
        if (t[i + 2] === 3) continue; // buisson
        const rr = r + 0.3 * t[i + 3];
        const dx = p.x - t[i], dz = p.z - t[i + 1];
        if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        hit = true;
        const d = Math.sqrt(d2) || 0.001, k = (rr - d) / d;
        p.x += dx * k; p.z += dz * k;
      }
    }
  }
  return hit;
}

// Déplace l'acteur a {x,z} de (dx,dz) avec glissement : eau, pentes raides, bâtiments, arbres.
// Retourne true si un obstacle a été touché.
export function moveActor(a, dx, dz, r, headH = 1.75, opts = {}) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return false;
  const maxSlope = opts.maxSlope ?? 0.9;
  const water = opts.water !== false;
  const gOld = groundAt(a.x, a.z);
  const ok = (nx, nz) => {
    const g = groundAt(nx, nz);
    if (water && g < WATER_WALK_LIMIT) return false;
    return (g - gOld) / len <= maxSlope;
  };
  let nx = a.x + dx, nz = a.z + dz, blocked = false;
  if (!ok(nx, nz)) {
    blocked = true;
    if (Math.abs(dx) > 1e-9 && ok(a.x + dx, a.z)) { nx = a.x + dx; nz = a.z; }
    else if (Math.abs(dz) > 1e-9 && ok(a.x, a.z + dz)) { nx = a.x; nz = a.z + dz; }
    else { nx = a.x; nz = a.z; }
  }
  const p = { x: nx, z: nz };
  const y0 = gOld;
  if (pushOut(p, r, y0, y0 + headH)) blocked = true;
  if (pushTrees(p, r)) blocked = true;
  // après la poussée, ne pas finir dans l'eau
  if (water && groundAt(p.x, p.z) < WATER_WALK_LIMIT) { p.x = a.x; p.z = a.z; blocked = true; }
  a.x = p.x; a.z = p.z;
  return blocked;
}
