// Accessoires : lampadaires, voitures, clôtures, poteaux, balles de foin, sacs de sable, etc.
// prop = [type, x, z, rot, scale, seed]
import { rgb, shade, box, prism, cylinder, dome, pyramid, rock } from './meshbuilder.js';

export const P = {
  LAMP: 0, CAR: 1, FENCE: 2, POLE: 3, HAY: 4, CRATE: 5, SANDBAG: 6, CONTAINER: 7, FUELTANK: 8, BILLBOARD: 9,
  BENCH: 10, ROCK: 11, HELIPAD: 12, WELL: 13, CAMPFIRE: 14, FLAG: 15, TENT: 16, LOGS: 17, PIER: 18, TRUCK: 19, BARREL: 20, STATUE: 21,
};

const CAR_COLS = [0xb02a2a, 0x2a4f8a, 0xd8d8d4, 0x1f1f22, 0x7a7e82, 0xc9a42a, 0x2f6a45, 0x8a4a2a];
const BARREL_COLS = [0xa8321f, 0x2f5f8a, 0x4a7a3a, 0x7a7a74];
const K = {
  metal: rgb(0x6e7478), dark: rgb(0x222428), wood: rgb(0x6b4a2e), woodL: rgb(0x8b6a44), white: rgb(0xeeeeea),
  glass: rgb(0x8fb4c8), stone: rgb(0x8a8880),
};

export function buildProp(g, p, groundY) {
  const [type, x, z, rot, scale, seed] = p;
  let c = Math.cos(rot), s = Math.sin(rot);
  let y = groundY;
  if (type === P.POLE) { // traverse perpendiculaire à la route
    const a = Math.PI / 2 - rot;
    c = Math.cos(a); s = Math.sin(a);
  }
  g.setXform(c, s, x, y, z);
  const rnd = (() => { let t = seed | 0; return () => { t = (Math.imul(t, 1664525) + 1013904223) | 0; return ((t >>> 8) & 0xffff) / 65535; }; })();
  switch (type) {
    case P.LAMP: {
      box(g, -0.07, 0, -0.07, 0.07, 5.6, 0.07, K.metal);
      box(g, -0.05, 5.5, -0.05, 1.3, 5.6, 0.05, K.metal);
      box(g, 1.0, 5.35, -0.2, 1.5, 5.5, 0.2, rgb(0xf4ecc4));
      break;
    }
    case P.CAR: {
      const col = rgb(CAR_COLS[Math.floor(rnd() * CAR_COLS.length)]);
      box(g, -2.1, 0.35, -0.9, 2.1, 0.95, 0.9, col);
      box(g, -1.0, 0.95, -0.8, 1.1, 1.5, 0.8, col, shade(col, 0.9));
      // vitres
      g.quad([1.11, 0.98, 0.7], [1.11, 0.98, -0.7], [1.11, 1.45, -0.6], [1.11, 1.45, 0.6], K.glass);
      g.quad([-1.01, 0.98, -0.7], [-1.01, 0.98, 0.7], [-1.01, 1.45, 0.6], [-1.01, 1.45, -0.6], K.glass);
      for (const [wx, wz] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) box(g, wx - 0.35, 0, wz - 0.12, wx + 0.35, 0.7, wz + 0.12, K.dark);
      break;
    }
    case P.FENCE: {
      const L = scale || 4;
      const wood = K.woodL;
      for (let i = 0; i <= L; i += 2) box(g, i - L / 2 - 0.06, 0, -0.06, i - L / 2 + 0.06, 1.35, 0.06, wood);
      box(g, -L / 2, 0.45, -0.03, L / 2, 0.58, 0.03, wood);
      box(g, -L / 2, 0.95, -0.03, L / 2, 1.08, 0.03, wood);
      break;
    }
    case P.POLE: {
      box(g, -0.11, 0, -0.11, 0.11, 9, 0.11, K.wood);
      box(g, -0.07, 8.2, -1.4, 0.07, 8.35, 1.4, K.wood);
      for (const dz of [-1.2, 0, 1.2]) box(g, -0.04, 8.35, dz - 0.04, 0.04, 8.55, dz + 0.04, K.white);
      break;
    }
    case P.HAY: {
      cylinder(g, 0, 0, 0, 0.9, 0.9, 1.25, 10, rgb(0xc9a94a), rgb(0xb8983c));
      break;
    }
    case P.CRATE: {
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) box(g, i * 1.3 - 0.6, 0, -0.6, i * 1.3 + 0.6, 1.2, 0.6, K.woodL, rgb(0x9a7a50));
      if (rnd() < 0.5) box(g, -0.5, 1.2, -0.5, 0.5, 2.0, 0.5, K.wood);
      break;
    }
    case P.SANDBAG: {
      const bag = rgb(0xb5a679);
      for (let row = 0; row < 3; row++) for (let i = -2; i < 3 - (row % 2); i++) box(g, i * 0.62 - 0.3 + (row % 2) * 0.31, row * 0.34, -0.3, i * 0.62 + 0.3 + (row % 2) * 0.31, row * 0.34 + 0.34, 0.3, shade(bag, 0.9 + (i % 2) * 0.12));
      break;
    }
    case P.CONTAINER: {
      box(g, -3, 0, -1.25, 3, 2.6, 1.25, rgb(0x3a5f8a), rgb(0x2e4c6e));
      break;
    }
    case P.FUELTANK: {
      cylinder(g, 0, 0.5, 0, 1.4, 1.4, 2.6, 10, rgb(0x5a6a50), rgb(0x4a5a40));
      for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) box(g, lx - 0.1, 0, lz - 0.1, lx + 0.1, 0.5, lz + 0.1, K.metal);
      break;
    }
    case P.BILLBOARD: {
      box(g, -2.6, 0, -0.1, -2.4, 6, 0.1, K.metal);
      box(g, 2.4, 0, -0.1, 2.6, 6, 0.1, K.metal);
      box(g, -3.6, 5.2, -0.2, 3.6, 8.6, 0.2, rgb(0x6a6e72));
      box(g, -3.4, 5.4, 0.2, 3.4, 8.4, 0.25, rgb(0xd6b04a));
      break;
    }
    case P.BENCH: {
      box(g, -0.8, 0.4, -0.25, 0.8, 0.5, 0.25, K.woodL);
      box(g, -0.8, 0.5, -0.27, 0.8, 0.95, -0.2, K.woodL);
      box(g, -0.7, 0, -0.2, -0.6, 0.4, 0.2, K.metal);
      box(g, 0.6, 0, -0.2, 0.7, 0.4, 0.2, K.metal);
      break;
    }
    case P.ROCK: {
      rock(g, 0, 0.2, 0, 1.4 * (scale || 1), 1.0 * (scale || 1), 1.2 * (scale || 1), rgb(0x8a867c), seed);
      break;
    }
    case P.HELIPAD: {
      box(g, -9, 0, -9, 9, 0.15, 9, rgb(0x55595c));
      g.quad([-3.2, 0.16, -4], [-2.2, 0.16, -4], [-2.2, 0.16, 4], [-3.2, 0.16, 4], K.white);
      g.quad([2.2, 0.16, -4], [3.2, 0.16, -4], [3.2, 0.16, 4], [2.2, 0.16, 4], K.white);
      g.quad([-2.2, 0.16, -0.5], [2.2, 0.16, -0.5], [2.2, 0.16, 0.5], [-2.2, 0.16, 0.5], K.white);
      break;
    }
    case P.WELL: {
      cylinder(g, 0, 0, 0, 0.9, 0.9, 0.95, 10, K.stone, rgb(0x20262a));
      box(g, -0.95, 0.9, -0.08, -0.85, 2.4, 0.08, K.wood);
      box(g, 0.85, 0.9, -0.08, 0.95, 2.4, 0.08, K.wood);
      prism(g, [[0.8, 0], [0, 0.6], [-0.8, 0]], -1.1, 1.1, 'x', 2.4, rgb(0x5a4030), rgb(0x5a4030));
      break;
    }
    case P.CAMPFIRE: {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        box(g, Math.cos(a) * 0.7 - 0.16, 0, Math.sin(a) * 0.7 - 0.16, Math.cos(a) * 0.7 + 0.16, 0.25, Math.sin(a) * 0.7 + 0.16, K.stone);
      }
      box(g, -0.4, 0.05, -0.08, 0.4, 0.22, 0.08, K.wood);
      box(g, -0.08, 0.05, -0.4, 0.08, 0.22, 0.4, K.wood);
      pyramid(g, 0, 0.2, 0, 0.5, 0.5, 0.7, rgb(0xff8a2a));
      break;
    }
    case P.FLAG: {
      box(g, -0.07, 0, -0.07, 0.07, 9, 0.07, K.metal);
      g.quad([0.07, 7.2, 0], [1.9, 7.2, 0], [1.9, 8.8, 0], [0.07, 8.8, 0], rgb(0xb02a2a));
      g.quad([1.9, 7.2, 0], [0.07, 7.2, 0], [0.07, 8.8, 0], [1.9, 8.8, 0], rgb(0xb02a2a));
      break;
    }
    case P.TENT: {
      prism(g, [[1.5, 0], [0, 1.9], [-1.5, 0]], -2.2, 2.2, 'x', 0, rgb(0x5f6650), rgb(0x4f5642));
      break;
    }
    case P.LOGS: {
      for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) box(g, -1.4, r * 0.34, i * 0.36 + r * 0.18 - 0.5, 1.4, r * 0.34 + 0.34, i * 0.36 + r * 0.18 - 0.16, rgb(r % 2 ? 0x7a5a38 : 0x6a4a2c));
      break;
    }
    case P.PIER: {
      y = Math.max(groundY, 0) + 0.5;
      g.setXform(c, s, x, y, z);
      box(g, -1.3, 0, 0, 1.3, 0.2, 14, K.woodL);
      for (let i = 0; i <= 14; i += 3.5) {
        box(g, -1.25, -1.6, i, -1.1, 0.2, i + 0.15, K.wood);
        box(g, 1.1, -1.6, i, 1.25, 0.2, i + 0.15, K.wood);
      }
      break;
    }
    case P.TRUCK: {
      const gr = rgb(0x556044);
      box(g, -3.4, 0.7, -1.3, 1.6, 2.5, 1.3, gr);
      box(g, 1.6, 0.7, -1.3, 3.4, 2.1, 1.3, shade(gr, 0.92));
      g.quad([3.41, 1.2, 1.0], [3.41, 1.2, -1.0], [3.41, 2.0, -0.9], [3.41, 2.0, 0.9], K.glass);
      for (const wx of [-2.2, 2.4]) for (const sz of [-1.35, 1.35]) box(g, wx - 0.55, 0, sz - 0.18, wx + 0.55, 1.1, sz + 0.18, K.dark);
      break;
    }
    case P.BARREL: {
      cylinder(g, 0, 0, 0, 0.35, 0.35, 0.95, 8, rgb(BARREL_COLS[Math.floor(rnd() * BARREL_COLS.length)]), rgb(0x3a3e40));
      break;
    }
    case P.STATUE: {
      box(g, -0.9, 0, -0.9, 0.9, 1.2, 0.9, K.stone);
      box(g, -0.35, 1.2, -0.25, 0.35, 2.6, 0.25, rgb(0xa8a69c));
      cylinder(g, 0, 2.6, 0, 0.22, 0.22, 0.4, 8, rgb(0xa8a69c), rgb(0xa8a69c));
      break;
    }
    default:
      break;
  }
  g.clearXform();
}
