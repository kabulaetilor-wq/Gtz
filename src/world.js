import * as THREE from 'three';
import { parseChunk } from './mapformat.js';
import { Geo, rgb, shade, box, cylinder, dome, pyramid } from './meshbuilder.js';
import { makeSink, buildBuilding } from './buildings.js';
import { buildProp } from './props.js';
import { makeWallTextures, makeWaterTexture } from './textures.js';
import { Animals } from './animals.js';
import * as core from './worldcore.js';

export { heightAt, isWater, rayBoxes, inCollider, treeNear, groundAt, moveActor, WATER_WALK_LIMIT, isLoadedAt, pushOut, pushTrees } from './worldcore.js';

export const WORLD_SIZE = 2000;
export const EYE = new THREE.Vector3(0, 40, 0);
export const compounds = []; // zones de présence ennemie (camps, villages)
export let manifest = null;

const MAP_URL = './map/';
const state = { scene: null, mats: null, animals: null, water: null, chunkMeshes: new Map(), stats: { tris: 0, chunks: 0 } };

/* ---------------- Ciel, lumières ---------------- */
function buildSky(scene) {
  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x55633f, 1.55));
  const sunDir = new THREE.Vector3(0.5, 0.55, -0.65).normalize();
  const sun = new THREE.DirectionalLight(0xfff1d0, 2.3);
  sun.position.copy(sunDir).multiplyScalar(500);
  scene.add(sun);
  const geo = new THREE.SphereGeometry(1300, 24, 16);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(0xb7cdd6), top = new THREE.Color(0x3f78c4), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / 1300));
    c.copy(horizon).lerp(top, Math.pow(t, 0.55));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(30, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  sunMesh.position.copy(sunDir).multiplyScalar(1150);
  scene.add(sunMesh);
}

/* ---------------- Matériaux ---------------- */
function noiseTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 110 + Math.random() * 90;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeMaterials() {
  const detail = noiseTexture();
  const terrain = new THREE.MeshLambertMaterial({ map: new THREE.Texture(), side: THREE.DoubleSide });
  terrain.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail };
    sh.fragmentShader = 'uniform sampler2D detailMap;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        diffuseColor.rgb *= sampledDiffuseColor.rgb;
        float dn = texture2D( detailMap, vMapUv * 64.0 ).r;
        diffuseColor.rgb *= 0.8 + 0.4 * dn;
      #endif`
    );
  };
  const waterTex = makeWaterTexture();
  waterTex.repeat.set(50, 50);
  const water = new THREE.MeshLambertMaterial({ map: waterTex, color: 0x5a9ab8, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  const walls = makeWallTextures().map((t) => new THREE.MeshLambertMaterial({ vertexColors: true, map: t }));
  return {
    terrain,
    water,
    waterTex,
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    pool: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88, emissive: 0x0a3550 }),
    walls,
  };
}

/* ---------------- Terrain ---------------- */
function buildTerrain(ch, step) {
  const HN = ch.HN, N = HN - 1;
  const n = N / step + 1;
  const sp = CH_SIZE / N;
  const hf = (i, j) => ch.minH + (ch.heights[j * HN + i] / 65535) * ch.range;
  const pos = [], nor = [], uv = [];
  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = i * step, gj = j * step;
      const h = hf(gi, gj);
      pos.push(ch.x0 + gi * sp, h, ch.z0 + gj * sp);
      const hl = hf(Math.max(0, gi - 1), gj), hr = hf(Math.min(N, gi + 1), gj);
      const hu = hf(gi, Math.max(0, gj - 1)), hd = hf(gi, Math.min(N, gj + 1));
      const sx = (Math.min(N, gi + 1) - Math.max(0, gi - 1)) * sp, sz = (Math.min(N, gj + 1) - Math.max(0, gj - 1)) * sp;
      let nx = -(hr - hl) / sx, nz = -(hd - hu) / sz;
      const l = Math.hypot(nx, 1, nz);
      nor.push(nx / l, 1 / l, nz / l);
      uv.push(gi / N, gj / N);
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = (j + 1) * n + i, c = j * n + i + 1, d = (j + 1) * n + i + 1;
      idx.push(a, b, c, c, b, d);
    }
  }
  // jupes pour masquer les fissures entre niveaux de détail
  const skirt = 4;
  const edge = (get) => {
    const base = pos.length / 3;
    for (let k = 0; k < n; k++) {
      const v = get(k);
      pos.push(pos[v * 3], pos[v * 3 + 1] - skirt, pos[v * 3 + 2]);
      nor.push(0, 1, 0);
      uv.push(uv[v * 2], uv[v * 2 + 1]);
    }
    for (let k = 0; k < n - 1; k++) {
      const a = get(k), b = get(k + 1), c = base + k, d = base + k + 1;
      idx.push(a, c, b, b, c, d);
    }
  };
  edge((k) => k);
  edge((k) => (n - 1) * n + k);
  edge((k) => k * n);
  edge((k) => k * n + n - 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
const CH_SIZE = core.CH;

/* ---------------- Arbres ---------------- */
const TREE_GREENS = [0x2f5a35, 0x3a6a3a, 0x2a5030, 0x44763c, 0x35623a];
const OAK_GREENS = [0x4a7a2e, 0x5a8a34, 0x3f6e2a, 0x6a9238];
const BARK = rgb(0x5b4126);

function addTree(g, kind, x, z, y, scale, lod, hv) {
  const rot = (x * 7.13 + z * 3.31) % 6.283;
  g.setXform(Math.cos(rot), Math.sin(rot), x, y - 0.15, z, scale);
  if (kind === 0) { // pin
    const c1 = rgb(TREE_GREENS[hv % 5]);
    if (lod === 1) cylinder(g, 0, 0.5, 0, 1.7, 0.05, 6.5, 5, c1, null);
    else {
      box(g, -0.14, 0, -0.14, 0.14, 1.7, 0.14, BARK);
      cylinder(g, 0, 1.2, 0, 1.75, 0.08, 3.2, 6, c1, null);
      cylinder(g, 0, 3.0, 0, 1.4, 0.08, 2.7, 6, shade(c1, 1.1), null);
      cylinder(g, 0, 4.7, 0, 0.95, 0.05, 2.3, 6, shade(c1, 1.2), null);
    }
  } else if (kind === 1) { // chêne
    const c1 = rgb(OAK_GREENS[hv % 4]);
    if (lod === 1) dome(g, 0, 1.8, 0, 2.3, 2.6, 5, c1);
    else {
      box(g, -0.18, 0, -0.18, 0.18, 2.6, 0.18, BARK);
      cylinder(g, 0, 2.0, 0, 1.3, 2.4, 1.2, 7, c1, null);
      dome(g, 0, 3.2, 0, 2.4, 2.0, 7, shade(c1, 1.12));
    }
  } else if (kind === 2) { // bouleau
    const c1 = rgb(0x8aa84a);
    box(g, -0.1, 0, -0.1, 0.1, 3.6, 0.1, rgb(0xe4e0d2));
    if (lod === 1) dome(g, 0, 2.4, 0, 1.3, 2.4, 5, c1);
    else {
      cylinder(g, 0, 2.4, 0, 0.8, 1.35, 1.4, 6, c1, null);
      dome(g, 0, 3.8, 0, 1.35, 1.7, 6, shade(c1, 1.1));
    }
  } else if (kind === 3) { // buisson
    dome(g, 0, 0, 0, 1.0, 0.9, lod === 1 ? 4 : 6, rgb(0x3d6a2c));
  } else { // peuplier
    box(g, -0.12, 0, -0.12, 0.12, 2.2, 0.12, BARK);
    const c1 = rgb(0x5a8c3a);
    if (lod === 1) cylinder(g, 0, 1.5, 0, 0.9, 0.05, 7, 5, c1, null);
    else {
      cylinder(g, 0, 1.5, 0, 0.95, 0.75, 4.6, 6, c1, null);
      cylinder(g, 0, 6.1, 0, 0.75, 0.05, 2.4, 6, shade(c1, 1.1), null);
    }
  }
  g.clearXform();
}

/* ---------------- Piscines et ponts ---------------- */
function buildPool(gs, gw, p, ground) {
  const [x, z, w, d, y, shape] = p;
  const stone = rgb(0xdedbd0), deck = rgb(0xc8c6bc), blue = rgb(0x2fa8d4);
  gs.setXform(1, 0, x, y, z);
  gw.setXform(1, 0, x, y, z);
  if (shape === 1) { // bassin circulaire (fontaine)
    const r = w / 2;
    cylinder(gs, 0, -0.3, 0, r + 1.6, r + 1.6, 0.4, 16, deck, deck);
    cylinder(gs, 0, -0.3, 0, r + 0.5, r + 0.5, 0.85, 16, stone, stone);
    cylinder(gw, 0, 0.3, 0, r, r, 0.01, 16, blue, blue);
  } else {
    const hw = w / 2, hd = d / 2, t = 0.5, dk = 2.0;
    box(gs, -hw - t - dk, -0.3, -hd - t - dk, hw + t + dk, 0.1, -hd - t, deck);
    box(gs, -hw - t - dk, -0.3, hd + t, hw + t + dk, 0.1, hd + t + dk, deck);
    box(gs, -hw - t - dk, -0.3, -hd - t, -hw - t, 0.1, hd + t, deck);
    box(gs, hw + t, -0.3, -hd - t, hw + t + dk, 0.1, hd + t, deck);
    box(gs, -hw - t, -0.3, -hd - t, hw + t, 0.38, -hd, stone);
    box(gs, -hw - t, -0.3, hd, hw + t, 0.38, hd + t, stone);
    box(gs, -hw - t, -0.3, -hd, -hw, 0.38, hd, stone);
    box(gs, hw, -0.3, -hd, hw + t, 0.38, hd, stone);
    box(gs, -hw, -0.3, -hd, hw, 0.0, hd, rgb(0x1d6f8a));
    gw.quad([-hw, 0.3, hd], [hw, 0.3, hd], [hw, 0.3, -hd], [-hw, 0.3, -hd], blue);
    // échelle
    box(gs, hw - 0.1, 0.0, hd * 0.2, hw + 0.15, 0.9, hd * 0.2 + 0.05, rgb(0xb8bcc0));
  }
  gs.clearXform();
  gw.clearXform();
  void ground;
}

function buildBridge(g, br) {
  const [x0, z0, x1, z1, , width, yA, yB] = br;
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (L < 1) return;
  const ux = dx / L, uz = dz / L;
  g.setXform(ux, uz, (x0 + x1) / 2, 0, (z0 + z1) / 2);
  const hw = width / 2;
  const concrete = rgb(0x9a978f), asphalt = rgb(0x3e3e42), rail = rgb(0xc8c6bc);
  const nSeg = Math.max(1, Math.ceil(L / 3));
  const deckAt = (t) => yA + (yB - yA) * t;
  for (let i = 0; i < nSeg; i++) {
    const t0 = i / nSeg, t1 = (i + 1) / nSeg;
    const a0 = -L / 2 + t0 * L, a1 = -L / 2 + t1 * L + 0.05;
    const dy = Math.max(deckAt(t0), deckAt(t1));
    box(g, a0, dy - 0.7, -hw, a1, dy, hw, concrete, asphalt);
    box(g, a0, dy, -hw, a1, dy + 1.0, -hw + 0.3, rail, rail);
    box(g, a0, dy, hw - 0.3, a1, dy + 1.0, hw, rail, rail);
  }
  for (let s = -L / 2 + 4; s < L / 2; s += 14) {
    const dy = deckAt((s + L / 2) / L);
    box(g, s - 0.7, dy - 8, -hw + 1.4, s + 0.7, dy - 0.7, -hw + 2.6, concrete);
    box(g, s - 0.7, dy - 8, hw - 2.6, s + 0.7, dy - 0.7, hw - 1.4, concrete);
  }
  g.clearXform();
}

/* ---------------- Construction d'un chunk ---------------- */
function meshOf(geo, mat, group, extra) {
  const m = new THREE.Mesh(geo, mat);
  if (extra) Object.assign(m, extra);
  group.add(m);
  state.stats.tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  return m;
}

function buildChunk(ch, focus) {
  const { mats } = state;
  const group = new THREE.Group();
  const cx = ch.x0 + core.CH / 2, cz = ch.z0 + core.CH / 2;
  const dist = Math.hypot(cx - focus.x, cz - focus.z);
  const step = dist < 260 ? 2 : 4;
  const lod = dist < 420 ? 0 : 1;

  // terrain + peinture
  const splatTex = new THREE.DataTexture(ch.splat, ch.SN, ch.SN, THREE.RGBAFormat);
  splatTex.colorSpace = THREE.SRGBColorSpace;
  splatTex.magFilter = THREE.LinearFilter;
  splatTex.minFilter = THREE.LinearMipmapLinearFilter;
  splatTex.generateMipmaps = true;
  splatTex.wrapS = splatTex.wrapT = THREE.ClampToEdgeWrapping;
  splatTex.needsUpdate = true;
  const tmat = mats.terrain.clone();
  tmat.onBeforeCompile = mats.terrain.onBeforeCompile;
  tmat.map = splatTex;
  const tgeo = buildTerrain(ch, step);
  meshOf(tgeo, tmat, group);

  // eau
  if (ch.minH < 0.3) {
    const wg = new THREE.PlaneGeometry(core.CH, core.CH, 1, 1);
    wg.rotateX(-Math.PI / 2);
    wg.translate(cx, 0, cz);
    const wm = meshOf(wg, mats.water, group);
    wm.renderOrder = 1;
  }

  const o = ch.objects;
  // arbres
  const gt = new Geo(false);
  const t = o.t;
  for (let i = 0; i < t.length; i += 4) {
    const x = t[i], z = t[i + 1];
    addTree(gt, t[i + 2], x, z, core.heightAt(x, z), t[i + 3], lod, ((x * 13 + z * 7) | 0) & 7);
  }
  if (!gt.empty) meshOf(gt.toGeometry(), mats.solid, group);

  // bâtiments
  const sink = makeSink();
  for (const b of o.b) buildBuilding(b, sink);
  // piscines + accessoires + ponts dans la géométrie pleine
  const gp = new Geo(false); // eau des piscines
  for (const p of o.w) buildPool(sink.s, gp, p, core.heightAt(p[0], p[1]));
  for (const p of o.p) buildProp(sink.s, p, core.heightAt(p[1], p[2]));
  for (const b of o.br) buildBridge(sink.s, b);
  if (!sink.s.empty) meshOf(sink.s.toGeometry(), mats.solid, group);
  sink.w.forEach((g, i) => { if (!g.empty) meshOf(g.toGeometry(), mats.walls[i], group); });
  if (!gp.empty) meshOf(gp.toGeometry(), mats.pool, group);
  core.addBoxes(ch.key, sink.boxes);
  core.registerBridges(ch.key, o.br);

  // animaux
  if (o.a.length) state.animals.addChunk(ch.key, o.a);

  state.scene.add(group);
  state.chunkMeshes.set(ch.key, group);
  state.stats.chunks++;
}

function disposeChunk(key) {
  const g = state.chunkMeshes.get(key);
  if (g) {
    state.scene.remove(g);
    g.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material && m.material.map && m.material.map.isDataTexture) { m.material.map.dispose(); m.material.dispose(); }
    });
    state.chunkMeshes.delete(key);
  }
  state.animals.removeChunk(key);
  core.unregisterBridges(key);
  core.unregisterChunk(key);
}

/* ---------------- Chargement ---------------- */
const tick = () => new Promise((r) => setTimeout(r, 0));

async function fetchChunk(cx, cz) {
  const res = await fetch(`${MAP_URL}chunk_${cx}_${cz}.bin`);
  if (!res.ok) throw new Error(`Chunk ${cx},${cz} : HTTP ${res.status}`);
  return parseChunk(await res.arrayBuffer());
}

// Charge les chunks dans un rayon autour de (fx, fz). onProgress(0..1, texte)
export async function loadWorld(scene, onProgress = () => {}, radius = 420) {
  state.scene = scene;
  onProgress(0, 'Lecture de la carte…');
  const res = await fetch(`${MAP_URL}manifest.json`);
  if (!res.ok) throw new Error('manifest.json introuvable');
  manifest = await res.json();
  const p = manifest.spawn;
  EYE.set(p.x, 2, p.z);

  onProgress(0.02, 'Ciel et matériaux…');
  buildSky(scene);
  state.mats = makeMaterials();
  state.water = state.mats.waterTex;
  state.animals = new Animals(scene, core.heightAt);

  // zones de présence ennemie
  compounds.length = 0;
  for (const c of manifest.camps) compounds.push({ x: c.x, z: c.z, r: 30, y: c.y, kind: c.kind });
  for (const t of manifest.towns) if (t.type !== 'city') compounds.push({ x: t.x, z: t.z, r: t.r * 0.5, y: 0, kind: t.type });

  const focus = { x: p.x, z: p.z };
  const list = [];
  for (let cx = 0; cx < core.NC; cx++) {
    for (let cz = 0; cz < core.NC; cz++) {
      const x = -core.HALF + cx * core.CH + core.CH / 2, z = -core.HALF + cz * core.CH + core.CH / 2;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d <= radius) list.push({ cx, cz, d });
    }
  }
  list.sort((a, b) => a.d - b.d);
  const total = list.length;

  // 1) téléchargement + enregistrement (la hauteur doit être connue avant toute construction)
  const parsed = [];
  for (let i = 0; i < total; i += 4) {
    const batch = list.slice(i, i + 4);
    const got = await Promise.all(batch.map((b) => fetchChunk(b.cx, b.cz)));
    got.forEach((ch) => { ch.trees = ch.objects.t; core.registerChunk(ch); parsed.push(ch); });
    onProgress(0.05 + 0.4 * Math.min(1, (i + 4) / total), `Carte : ${Math.min(i + 4, total)}/${total} fichiers`);
    await tick();
  }
  // 2) construction des meshes
  for (let i = 0; i < parsed.length; i++) {
    buildChunk(parsed[i], focus);
    onProgress(0.45 + 0.55 * ((i + 1) / parsed.length), `Construction du monde : ${i + 1}/${parsed.length}`);
    await tick();
  }
  onProgress(1, 'Prêt');
  return {
    chunks: state.stats.chunks,
    animals: state.animals.count(),
    colliders: core.boxCount(),
    name: manifest.name,
  };
}

export function unloadAll() {
  for (const key of [...state.chunkMeshes.keys()]) disposeChunk(key);
}

/* ---------------- Streaming autour du joueur ---------------- */
const LOAD_R = 560, UNLOAD_R = 760;
let streaming = false;
const pending = new Set();
const chunkCenter = (cx, cz) => [-core.HALF + cx * core.CH + core.CH / 2, -core.HALF + cz * core.CH + core.CH / 2];

// À appeler souvent : charge au plus 1 chunk à la fois, en tâche de fond, et décharge les lointains.
export function streamAround(px, pz) {
  if (!state.mats) return;
  for (const [key] of [...state.chunkMeshes]) {
    const cx = Math.floor(key / 16), cz = key % 16;
    const [x, z] = chunkCenter(cx, cz);
    if (Math.hypot(x - px, z - pz) > UNLOAD_R) disposeChunk(key);
  }
  if (streaming) return;
  let best = null, bd = Infinity;
  for (let cx = 0; cx < core.NC; cx++) for (let cz = 0; cz < core.NC; cz++) {
    const key = core.chunkKey(cx, cz);
    if (state.chunkMeshes.has(key) || pending.has(key)) continue;
    const [x, z] = chunkCenter(cx, cz);
    const d = Math.hypot(x - px, z - pz);
    if (d <= LOAD_R && d < bd) { bd = d; best = { cx, cz, key }; }
  }
  if (!best) return;
  streaming = true;
  pending.add(best.key);
  fetchChunk(best.cx, best.cz).then((ch) => {
    ch.trees = ch.objects.t;
    core.registerChunk(ch);
    return tick().then(() => buildChunk(ch, { x: px, z: pz }));
  }).catch((e) => console.warn(e)).finally(() => { pending.delete(best.key); streaming = false; });
}

// Vrai si tous les chunks proches (rayon r) sont construits
export function areaReady(px, pz, r = 260) {
  for (let cx = 0; cx < core.NC; cx++) for (let cz = 0; cz < core.NC; cz++) {
    const [x, z] = chunkCenter(cx, cz);
    if (Math.hypot(x - px, z - pz) <= r && !state.chunkMeshes.has(core.chunkKey(cx, cz))) return false;
  }
  return true;
}

/* ---------------- Mise à jour par image ---------------- */
export function updateWorld(dt, eye) {
  if (!state.mats) return;
  state.mats.waterTex.offset.x += dt * 0.004;
  state.mats.waterTex.offset.y += dt * 0.0025;
  state.animals.update(dt, eye || EYE);
}

export function scareAnimals(x, z, r) {
  if (state.animals) state.animals.scare(x, z, r);
}

export const worldStats = () => ({ ...state.stats, animals: state.animals ? state.animals.count() : 0 });
