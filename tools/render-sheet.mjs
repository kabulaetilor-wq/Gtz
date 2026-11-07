// Planche contact : un exemplaire de chaque type de bâtiment, rendu isométrique (peintre) via Chromium.
import fs from 'node:fs';
import { parseChunk } from '../src/mapformat.js';
import { makeSink, buildBuilding, K } from '../src/buildings.js';
const out = process.argv[2];
const names = Object.fromEntries(Object.entries(K).map(([k, v]) => [v, k]));
const found = {};
for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) {
  const buf = fs.readFileSync(`public/map/chunk_${cx}_${cz}.bin`);
  const ch = parseChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  for (const b of ch.objects.b) { const k = b[0]; if (!found[k] || (b[5] > found[k][5] && (k === 4 || k === 5 || k === 2))) found[k] = b; }
}
const items = [];
for (const k of Object.keys(found).map(Number).sort((a, b) => a - b)) {
  const b = [...found[k]]; const [x, z, y] = [b[1], b[2], b[12]];
  const sink = makeSink(); buildBuilding(b, sink);
  const tris = [];
  for (const g of [sink.s, ...sink.w]) for (let i = 0; i < g.pos.length; i += 9) {
    tris.push([...g.pos.slice(i, i + 9).map((v, j) => j % 3 === 0 ? v - x : j % 3 === 1 ? v - y : v - z), g.col[i], g.col[i + 1], g.col[i + 2], g.nor[i], g.nor[i + 1], g.nor[i + 2]]);
  }
  items.push({ name: names[k] + ' ' + b[3].toFixed(0) + 'x' + b[4].toFixed(0) + ' ' + b[5] + 'et.', tris });
}
const html = `<html><body style="margin:0;background:#cfd8dc"><canvas id=c width=2000 height=1300></canvas><script>
const items=${JSON.stringify(items)};
const c=document.getElementById('c'),g=c.getContext('2d');g.fillStyle='#cfd8dc';g.fillRect(0,0,2000,1300);
const cols=8,cw=250,ch=320,SS=2;const yaw=0.62,pit=0.5;const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pit),sp=Math.sin(pit);
const L=[0.5,0.8,0.35];const ll=Math.hypot(...L);L[0]/=ll;L[1]/=ll;L[2]/=ll;
const toCam=[-sy*cp,sp,-cy*cp];
function proj(x,y,z){const X=x*cy-z*sy,Z=x*sy+z*cy;return[X,y*cp+Z*sp,Z*cp-y*sp];}
items.forEach((it,n)=>{
  const W=cw*SS,H=(ch-30)*SS;
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const cx=cv.getContext('2d');
  const img=cx.createImageData(W,H);const zb=new Float32Array(W*H).fill(1e9);
  for(let i=0;i<W*H;i++){img.data[i*4]=0xcf;img.data[i*4+1]=0xd8;img.data[i*4+2]=0xdc;img.data[i*4+3]=255;}
  let mx=1;for(const t of it.tris)for(let i=0;i<9;i+=3)mx=Math.max(mx,Math.abs(t[i]),Math.abs(t[i+1])*0.8,Math.abs(t[i+2]));
  const s=Math.min(5,105/Math.max(mx,8))*SS;const ox=W/2,oy=H*0.86;
  // sol : disque à y=0 avec profondeur réelle (masque les fondations enterrées)
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const X=(x-ox)/s,sy2=(oy-y)/s;const Z=sy2/sp;if(X*X+Z*Z<55*55){const i=y*W+x;zb[i]=Z*cp;const sh=0.9+0.1*Math.sin(X*0.4)*Math.sin(Z*0.4);img.data[i*4]=0x8a*sh;img.data[i*4+1]=0x9a*sh;img.data[i*4+2]=0x60*sh;}}
  let culled=0;
  for(const t of it.tris){
    const nx=t[12],ny=t[13],nz=t[14];
    if(nx*toCam[0]+ny*toCam[1]+nz*toCam[2]<=0){culled++;continue;}
    const A=proj(t[0],t[1],t[2]),B=proj(t[3],t[4],t[5]),C=proj(t[6],t[7],t[8]);
    const ax=ox+A[0]*s,ay=oy-A[1]*s,bx=ox+B[0]*s,by=oy-B[1]*s,qx=ox+C[0]*s,qy=oy-C[1]*s;
    const minx=Math.max(0,Math.floor(Math.min(ax,bx,qx))),maxx=Math.min(W-1,Math.ceil(Math.max(ax,bx,qx)));
    const miny=Math.max(0,Math.floor(Math.min(ay,by,qy))),maxy=Math.min(H-1,Math.ceil(Math.max(ay,by,qy)));
    const den=(by-qy)*(ax-qx)+(qx-bx)*(ay-qy);if(Math.abs(den)<1e-9)continue;
    const lam=Math.max(0,nx*L[0]+ny*L[1]+nz*L[2]);const k=0.5+0.75*lam;
    const f=v=>Math.min(255,Math.round(255*Math.pow(Math.min(1,v*k),1/2.2)));
    const R=f(t[9]),G=f(t[10]),Bc=f(t[11]);
    for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
      const w1=((by-qy)*(x+.5-qx)+(qx-bx)*(y+.5-qy))/den,w2=((qy-ay)*(x+.5-qx)+(ax-qx)*(y+.5-qy))/den,w3=1-w1-w2;
      if(w1<-0.001||w2<-0.001||w3<-0.001)continue;
      const z=w1*A[2]+w2*B[2]+w3*C[2];const i=y*W+x;
      if(z<zb[i]-1e-4){zb[i]=z;img.data[i*4]=R;img.data[i*4+1]=G;img.data[i*4+2]=Bc;}
    }
  }
  cx.putImageData(img,0,0);
  const px=(n%cols)*cw,py=Math.floor(n/cols)*ch;
  g.drawImage(cv,px,py+26,cw,ch-30);
  g.fillStyle='#000';g.font='14px sans-serif';g.textAlign='center';g.fillText(it.name,px+cw/2,py+18);
});
</script></body></html>`;
fs.writeFileSync(out + '/sheet.html', html);
console.log(items.length, 'types');
