import * as THREE from 'three';

// Textures dessinées au canvas (aucun fichier image requis).
// Les couleurs claires sont multipliées par la couleur de sommet du mur.

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function speckle(g, S, alpha, count) {
  for (let i = 0; i < count; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// 0 : habitat (fenêtre + cadre + appui)
function residential() {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, S, S);
  speckle(g, S, 0.05, 200);
  // enduit : bande basse
  g.fillStyle = '#e4e4e4';
  g.fillRect(0, S - 10, S, 10);
  // fenêtre
  const x = S * 0.27, y = S * 0.18, w = S * 0.46, h = S * 0.52;
  g.fillStyle = '#ffffff';
  g.fillRect(x - 5, y - 5, w + 10, h + 10);
  g.fillStyle = '#2a3944';
  g.fillRect(x, y, w, h);
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, 'rgba(180,210,230,.55)');
  gr.addColorStop(0.5, 'rgba(180,210,230,0)');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.fillStyle = '#ffffff';
  g.fillRect(x + w / 2 - 2, y, 4, h);
  g.fillRect(x, y + h * 0.45, w, 4);
  // appui
  g.fillStyle = '#d0d0d0';
  g.fillRect(x - 8, y + h + 5, w + 16, 5);
  return finish(c);
}

// 1 : mur-rideau vitré
function curtain() {
  const S = 128;
  const [c, g] = canvas(S);
  const gr = g.createLinearGradient(0, 0, S, S);
  gr.addColorStop(0, '#e8f1f7');
  gr.addColorStop(1, '#b9cbd8');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // reflets
  g.fillStyle = 'rgba(255,255,255,.28)';
  g.beginPath();
  g.moveTo(0, S * 0.7); g.lineTo(S * 0.5, 0); g.lineTo(S * 0.7, 0); g.lineTo(0, S * 0.95);
  g.fill();
  // allège
  g.fillStyle = '#8fa0ab';
  g.fillRect(0, S * 0.82, S, S * 0.18);
  // meneaux
  g.fillStyle = '#58656e';
  g.fillRect(0, 0, 3, S);
  g.fillRect(S - 3, 0, 3, S);
  g.fillRect(0, S * 0.82 - 2, S, 3);
  g.fillRect(S / 2 - 1, 0, 2, S * 0.82);
  return finish(c);
}

// 2 : bardage industriel avec bandeau de fenêtres hautes
function industrial() {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = '#f0f0f0';
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 8) {
    g.fillStyle = 'rgba(0,0,0,.12)';
    g.fillRect(x, 0, 2, S);
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillRect(x + 2, 0, 1, S);
  }
  g.fillStyle = '#3a4952';
  g.fillRect(S * 0.12, S * 0.2, S * 0.76, S * 0.2);
  g.fillStyle = 'rgba(190,215,230,.35)';
  g.fillRect(S * 0.12, S * 0.2, S * 0.76, S * 0.07);
  g.fillStyle = '#d8d8d8';
  g.fillRect(S * 0.12 - 2, S * 0.2 - 2, S * 0.76 + 4, 2);
  g.fillRect(S * 0.12 - 2, S * 0.4, S * 0.76 + 4, 3);
  g.fillStyle = '#c9c9c9';
  g.fillRect(S * 0.12 + S * 0.38, S * 0.2, 3, S * 0.2);
  speckle(g, S, 0.06, 150);
  return finish(c);
}

// 3 : devanture (grande vitrine)
function shopfront() {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, S, S);
  speckle(g, S, 0.05, 150);
  const x = S * 0.08, y = S * 0.2, w = S * 0.84, h = S * 0.6;
  g.fillStyle = '#ffffff';
  g.fillRect(x - 4, y - 4, w + 8, h + 8);
  g.fillStyle = '#2b3b45';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(210,230,240,.3)';
  g.beginPath();
  g.moveTo(x, y + h); g.lineTo(x + w * 0.4, y); g.lineTo(x + w * 0.55, y); g.lineTo(x + w * 0.15, y + h);
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillRect(x + w / 3 - 2, y, 4, h);
  g.fillRect(x + (2 * w) / 3 - 2, y, 4, h);
  g.fillStyle = '#cfcfcf';
  g.fillRect(0, S * 0.9, S, S * 0.1);
  return finish(c);
}

export function makeWallTextures() {
  return [residential(), curtain(), industrial(), shopfront()];
}

export function makeWaterTexture() {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = '#9fc4d8';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    g.strokeStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random();
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 6, y - 2 - Math.random() * 3, x + 14 + Math.random() * 10, y);
    g.stroke();
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(40,90,120,${Math.random() * 0.12})`;
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, 3 + Math.random() * 8, 0, Math.PI * 2);
    g.fill();
  }
  // le motif doit boucler : on duplique les bords
  const t = finish(c);
  return t;
}
