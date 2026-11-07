// Test de fumée : exécute le vrai src/main.js sous Node avec un faux DOM / faux three (maths réelles).
import fs from 'node:fs';
import path from 'node:path';
const els = {};
class El {
  constructor(id) { this.id = id; this.style = {}; this.children = []; this.h = {}; this.width = 1280; this.height = 720; this.textContent = ''; this.innerHTML = ''; this.value = '1.5';
    const set = new Set(); this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), toggle: (c, f) => { (f === undefined ? !set.has(c) : f) ? set.add(c) : set.delete(c); }, contains: (c) => set.has(c), set }; }
  addEventListener(t, f) { (this.h[t] ||= []).push(f); }
  emit(t, ev = {}) { for (const f of this.h[t] || []) f({ preventDefault() {}, stopPropagation() {}, pointerType: 'touch', button: 0, ...ev }); }
  appendChild(c) { this.children.push(c); } removeChild(c) { this.children = this.children.filter((x) => x !== c); } get firstChild() { return this.children[0]; }
  remove() {} setPointerCapture() {} querySelector() { return new El('q'); }
  getContext() { return new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : (() => { const f = () => new Proxy(function () {}, { get: (t2, k2) => (k2 === 'addColorStop' ? () => {} : f()), apply: () => f() }); return f(); })()), apply: () => 1, set: () => true }); }
}
const getEl = (id) => (els[id] ||= new El(id));
const winH = {};
globalThis.document = { getElementById: getEl, createElement: () => new El('c'), body: new El('body'), addEventListener: (t, f) => (winH[t] ||= []).push(f), hidden: false };
globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: (t, f) => (winH[t] ||= []).push(f) };
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
let raf = null; globalThis.requestAnimationFrame = (f) => { raf = f; };
globalThis.fetch = async (u) => {
  const p = path.join('public', String(u).replace(/^\.\//, ''));
  if (!fs.existsSync(p)) return { ok: false, status: 404 };
  const b = fs.readFileSync(p);
  return { ok: true, status: 200, json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const errors = [];
process.on('unhandledRejection', (e) => { errors.push(e); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let T = 0;
const step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { T += dt * 1000; raf && raf(T); } };
const key = (type, k) => (winH[type] || []).forEach((f) => f({ key: k, repeat: false, preventDefault() {} }));

await import('../src/main.js');
for (let i = 0; i < 300 && !els.menu?.classList.set.has('hidden') === false; i++) await wait(50);
await wait(500); step(3);
console.log('menu visible:', !els.menu.classList.set.has('hidden'), 'loadtxt:', els.loadtxt.textContent);
els.btnPlay.emit('click'); step(10);

// 1) marche avec le clavier
key('keydown', 'w'); step(120); key('keyup', 'w');
console.log('marche OK, argent', els.money.textContent);

// 2) joystick tactile + regard
const touch = els.touch;
touch.emit('pointerdown', { pointerId: 1, clientX: 200, clientY: 500 });
touch.emit('pointermove', { pointerId: 1, clientX: 200, clientY: 440 }); step(60);
touch.emit('pointerup', { pointerId: 1, clientX: 200, clientY: 440 });
touch.emit('pointerdown', { pointerId: 2, clientX: 900, clientY: 300 });
touch.emit('pointermove', { pointerId: 2, clientX: 960, clientY: 280 }); step(5);
touch.emit('pointerup', { pointerId: 2 });

// 3) armes, tir, visée, rechargement
for (const b of ['bWeapon', 'bAim', 'bReload']) { els[b].emit('pointerdown', { pointerId: 5 }); els[b].emit('pointerup', { pointerId: 5 }); step(5); }
els.bFire.emit('pointerdown', { pointerId: 6 }); step(10); els.bFire.emit('pointerup', { pointerId: 6 }); step(10);
els.bWeapon.emit('pointerdown', { pointerId: 5 }); els.bWeapon.emit('pointerup', { pointerId: 5 });
els.bAim.emit('pointerdown', { pointerId: 5 }); els.bAim.emit('pointerup', { pointerId: 5 }); step(60);
console.log('ammo:', els.ammo.textContent);

// 4) véhicule : téléporter près de la 1ʳᵉ voiture
const man = JSON.parse(fs.readFileSync('public/map/manifest.json'));
const v0 = man.vehicles[0];
els.bPause.emit('pointerdown', { pointerId: 9 }); els.bPause.emit('pointerup', { pointerId: 9 }); step(2);
els.btnResume.emit('click'); step(2);
els.bMap.emit('pointerdown', { pointerId: 9 }); els.bMap.emit('pointerup', { pointerId: 9 }); step(2);
console.log('missions listées:', els.missions.innerHTML.split('mcard').length - 1);
// "Départ" mission #2 via le bouton généré n'est pas capturable (innerHTML) : on passe par le menu pause → refuge
els.btnMClose.emit('click');
key('keydown', 'e'); step(2);
for (let i = 0; i < 200; i++) { step(1); }
key('keydown', 'e');
// conduire
key('keydown', 'w'); step(180); key('keyup', 'w');
key('keydown', 'e'); step(5);
console.log('prompt:', JSON.stringify(els.prompt.textContent), 'bUse hidden:', els.bUse.classList.set.has('hidden'));

// 5) téléportation + mission 1 via beacon
els.bPause.emit('pointerdown', { pointerId: 9 }); els.bPause.emit('pointerup', { pointerId: 9 });
els.btnHome.emit('click'); step(2); for (let i = 0; i < 200; i++) { step(2); await wait(20); if (!els.loading.classList.set.has('hidden') === false) break; }
step(30);
console.log('après refuge: loading hidden', els.loading.classList.set.has('hidden'), 'obj:', els.objv.textContent);
// attendre les chunks
for (let i = 0; i < 60; i++) { step(3); await wait(30); }
console.log('objectif:', els.objv.textContent, '| popups:', els.popups.children.map((c) => c.textContent).join(' / '));

// 6) tire pendant 10 s dans tous les sens
for (let k = 0; k < 40; k++) { els.bFire.emit('pointerdown', { pointerId: 6 }); step(8); els.bFire.emit('pointerup', { pointerId: 6 }); touch.emit('pointerdown', { pointerId: 3, clientX: 900, clientY: 300 }); touch.emit('pointermove', { pointerId: 3, clientX: 930, clientY: 300 }); touch.emit('pointerup', { pointerId: 3 }); }
step(300);
console.log('errors:', errors.length); for (const e of errors) console.log(e && e.stack || e);
console.log('rendu frames OK; hp bar', els.hpfill.style.transform);
process.exit(errors.length ? 1 : 0);
