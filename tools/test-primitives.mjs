import { Geo, box, wallBox, prism, hip, pyramid, cylinder, dome, sawtooth, rock } from '../src/meshbuilder.js';
const W = [1, 1, 1];
function stat(name, g, convex = true, center) {
  const p = g.pos, n = g.nor;
  let minx=1e9,miny=1e9,minz=1e9,maxx=-1e9,maxy=-1e9,maxz=-1e9;
  for (let i = 0; i < p.length; i += 3) { minx=Math.min(minx,p[i]);maxx=Math.max(maxx,p[i]);miny=Math.min(miny,p[i+1]);maxy=Math.max(maxy,p[i+1]);minz=Math.min(minz,p[i+2]);maxz=Math.max(maxz,p[i+2]); }
  // centre intérieur : barycentre des sommets (convexe) -> les normales doivent s'en éloigner
  let cx=0,cy=0,cz=0; for (let i = 0; i < p.length; i += 3) { cx+=p[i];cy+=p[i+1];cz+=p[i+2]; } const m=p.length/3; cx/=m;cy/=m;cz/=m;
  if (center) [cx,cy,cz]=center;
  let bad=0,t=0;
  for (let i = 0; i < p.length; i += 9) {
    const mx=(p[i]+p[i+3]+p[i+6])/3-cx,my=(p[i+1]+p[i+4]+p[i+7])/3-cy,mz=(p[i+2]+p[i+5]+p[i+8])/3-cz;
    const d=n[i]*mx+n[i+1]*my+n[i+2]*mz; t++; if (d < -1e-6) bad++;
  }
  console.log((bad ? 'ÉCHEC ' : 'ok    ') + name.padEnd(28), bad + '/' + t);
}
let g;
g = new Geo(); box(g, -2, 0, -3, 2, 4, 3, W, W, false); stat('box', g);
g = new Geo(true); wallBox(g, -2, 0, -3, 2, 4, 3, W); stat('wallBox (4 faces)', g, true, [0,2,0]);
for (const axis of ['x', 'z']) {
  g = new Geo(); prism(g, [[3, 0], [0, 2], [-3, 0]], -5, 5, axis, 0, W, W); stat('gable ' + axis, g, true, [0,0.6,0]);
  g = new Geo(); prism(g, [[3, 0], [-3, 2], [-3, 0]], -5, 5, axis, 0, W, W); stat('shed ' + axis, g, true, [0,0.5,0]);
  g = new Geo(); prism(g, [[3, 0], [1.7, 1.4], [0, 2], [-1.7, 1.4], [-3, 0]], -5, 5, axis, 0, W, W); stat('gambrel ' + axis, g, true, [0,0.6,0]);
  const pts = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; pts.push([Math.cos(a) * 3, Math.sin(a) * 2]); }
  g = new Geo(); prism(g, pts, -5, 5, axis, 0, W, W); stat('barrel ' + axis, g, true, [0,0.8,0]);
}
g = new Geo(); hip(g, -4, 0, -2, 4, 2, 2, W, 0); stat('hip long x', g, true, [0,0.5,0]);
g = new Geo(); hip(g, -2, 0, -4, 2, 4, 2, W, 0); stat('hip long z', g, true, [0,0.5,0]);
g = new Geo(); pyramid(g, 0, 0, 0, 4, 6, 3, W); stat('pyramid', g, true, [0,0.5,0]);
g = new Geo(); cylinder(g, 0, 0, 0, 2, 1.5, 4, 12, W, W); stat('cylinder', g);
g = new Geo(); cylinder(g, 0, 0, 0, 2, 0.01, 4, 12, W, null); stat('cône', g, true, [0,1,0]);
g = new Geo(); dome(g, 0, 0, 0, 3, 2, 12, W); stat('dome', g, true, [0,-1,0]);
g = new Geo(); sawtooth(g, -4, 0, -4, 4, 4, 2, W, W, 2);
{ // vérification directe : pente vers le haut (ny>0 ou face verticale nz>0)
  let bad = 0; for (let i = 0; i < g.nor.length; i += 9) { const ny = g.nor[i+1], nz = g.nor[i+2], nx = g.nor[i]; if (!(ny > 0 || nz > 0.99 || Math.abs(nx) > 0.99)) bad++; }
  console.log((bad ? 'ÉCHEC ' : 'ok    ') + 'sawtooth'.padEnd(28), bad + '/' + g.nor.length / 9);
}
g = new Geo(); rock(g, 0, 0, 0, 2, 1.5, 2, W, 42); stat('rock', g, true, [0, 0.3, 0]);
// transformation : rotation 90° ne doit pas retourner les normales
g = new Geo(); g.setXform(0, 1, 10, 5, 20); box(g, -1, 0, -1, 1, 2, 1, W, W); g.clearXform(); stat('box + xform 90°', g);
