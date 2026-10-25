import {
  BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3,
} from '../vendor/three.module.js';
import { STREET, PARKING, LOT_WEIGHTS, VENDING, reserved } from './layout.js';
import { rng, range, pick, chance, mesh, at, plate, worldUV, faceUV, merge } from './parts.js';
import { kelvin, WARM, COOL } from './materials.js';

const UP = new Vector3(0, 1, 0);
const VENDING_W = 1.0;   // machine width along the cluster (subject.js)
export const TEE = { width: 7, apron: 1.6, span: 34, seed: 1987 };   // T-junction at the far end: road width, far-side paving, frontage half-width
const v3 = new Vector3();
const s3 = new Vector3();
const q = new Quaternion();
export const M = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => new Matrix4().compose(v3.set(x, y, z), q.setFromAxisAngle(UP, ry), s3.set(sx, sy, sz));

// Collects instance transforms per (geometry, material) and emits one InstancedMesh per bin.
export const instancer = () => {
  const bins = new Map();
  return {
    add(key, geometry, material, matrix, color = null, { cast = false, receive = true } = {}) {
      if (!bins.has(key)) bins.set(key, { geometry, material, matrices: [], colors: [], cast, receive });
      const bin = bins.get(key);
      bin.matrices.push(matrix);
      bin.colors.push(color);
    },
    build(parent) {
      for (const { geometry, material, matrices, colors, cast, receive } of bins.values()) {
        const im = new InstancedMesh(geometry, material, matrices.length);
        matrices.forEach((m, i) => im.setMatrixAt(i, m));
        if (colors.some(Boolean)) colors.forEach((c, i) => im.setColorAt(i, c ?? new Color(1, 1, 1)));
        im.castShadow = cast; im.receiveShadow = receive;
        im.computeBoundingSphere();
        parent.add(im);
      }
    },
  };
};

const unit = () => {
  const bar = (w, h, d, x, y) => ({ geometry: new BoxGeometry(w, h, d), matrix: new Matrix4().makeTranslation(x, y, 0) });
  const frame = merge([
    bar(1, 0.05, 0.07, 0, 0.475), bar(1, 0.05, 0.07, 0, -0.475),
    bar(0.05, 1, 0.07, -0.475, 0), bar(0.05, 1, 0.07, 0.475, 0), bar(0.03, 1, 0.05, 0, 0),
  ]);
  const ac = new BoxGeometry(0.8, 0.6, 0.28);
  faceUV(ac, 'z', 1, [0, 0.1, 1, 1]);
  for (const [axis, sign] of [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', -1]]) faceUV(ac, axis, sign, [0.02, 0.86, 0.04, 0.9]);
  return {
    frame,
    plane: new PlaneGeometry(1, 1),
    box: new BoxGeometry(1, 1, 1),
    pipe: new CylinderGeometry(1, 1, 1, 6),
    tank: new CylinderGeometry(1, 1, 1, 14),
    ac,
  };
};

// Warm / cool interior light colours, slightly randomised.
const interiorColour = (rand) => {
  const c = kelvin(rand() < 0.65 ? WARM + range(rand, -300, 500) : COOL - range(rand, 0, 1500));
  return c.multiplyScalar(range(rand, 0.55, 1.15));
};

export const buildings = (lib, rand, { tier }) => {
  const group = new Group();
  const inst = instancer();
  const G = unit();
  const facades = [];
  const glassLit = lib.interiors.map((t, i) => lib.window(true, i));
  const shopLit = lib.shop.map((map) => { const m = lib.window(true, 0); m.map = map; return m; });
  const glassDark = lib.glass;

  const facadeMat = (kinds) => pick(rand, lib.facades.filter((f) => kinds.includes(f.set)));

  // Window: frame + glass + sill on the facade plane, facing the street.
  const window = (s, xf, zc, yc, w, h, { lit = rand() < 0.42, frosted = false, dark = rand() < 0.3 } = {}) => {
    const ry = -s * Math.PI / 2;
    const out = -s;
    if (lit) {
      const variant = frosted ? 3 : Math.floor(rand() * 3);
      inst.add(`glassLit${variant}`, G.plane, glassLit[variant], M(xf + out * 0.012, yc, zc, ry, w * 0.96, h * 0.96), interiorColour(rand));
    } else {
      inst.add(frosted ? 'frosted' : 'glass', G.plane, frosted ? lib.frosted : glassDark, M(xf + out * 0.012, yc, zc, ry, w * 0.96, h * 0.96));
    }
    inst.add(dark ? 'frameDark' : 'frame', G.frame, dark ? lib.frameDark : lib.frame, M(xf + out * 0.035, yc, zc, ry, w, h, 1), null, { cast: tier === 'high' });
    inst.add('sill', G.box, lib.trim, M(xf + out * 0.06, yc - h / 2 - 0.03, zc, ry, w + 0.1, 0.05, 0.12));
  };

  // AC outdoor unit, grille facing the street (or away from it on roofs).
  const ac = (s, x, y, z, away = false) => inst.add('ac', G.ac, lib.ac, M(x, y, z, (away ? s : -s) * Math.PI / 2), null, { cast: tier === 'high' });

  const pipe = (x, z, y0, y1, r = 0.05) => inst.add('pipe', G.pipe, lib.galv, M(x, (y0 + y1) / 2, z, 0, r, y1 - y0, r));

  const box = (material, w, h, d, x, y, z, { metres = 2.4, cast = true, receive = true, offset = null } = {}) => {
    const g = new BoxGeometry(d, h, w);
    g.translate(0, h / 2, 0);
    worldUV(g, metres, [offset ?? rand() * 10, 0]);
    const m = mesh(g, material, { cast, receive });
    at(m, x, y, z);
    group.add(m);
    return m;
  };

  // Rooftop clutter for flat roofs.
  const rooftop = (s, xc, zc, w, d, top) => {
    const parapetH = range(rand, 0.5, 1.0);
    box(lib.parapet, w, parapetH, 0.15, xc - s * (d / 2 - 0.075), top, zc, { metres: 3.6 });
    box(lib.parapet, w, parapetH, 0.15, xc + s * (d / 2 - 0.075), top, zc, { metres: 3.6 });
    box(lib.parapet, 0.15, parapetH, d - 0.3, xc, top, zc + w / 2 - 0.075, { metres: 3.6 });
    box(lib.parapet, 0.15, parapetH, d - 0.3, xc, top, zc - w / 2 + 0.075, { metres: 3.6 });
    inst.add('coping', G.box, lib.trim, M(xc - s * (d / 2 - 0.075), top + parapetH + 0.03, zc, 0, 0.22, 0.06, w + 0.04));
    if (chance(rand, 0.55)) {
      const tx = xc + s * range(rand, 0, d * 0.3); const tz = zc + range(rand, -w * 0.3, w * 0.3); const r = range(rand, 0.5, 0.85);
      inst.add('tank', G.tank, lib.trim, M(tx, top + 1.2 + 0.6, tz, 0, r, 1.2, r), null, { cast: true });
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) inst.add('leg', G.box, lib.steel, M(tx + dx * r * 0.6, top + 0.6, tz + dz * r * 0.6, 0, 0.06, 1.2, 0.06));
    }
    if (chance(rand, 0.5)) box(lib.parapet, range(rand, 2.2, 3.2), range(rand, 2.4, 3), range(rand, 2.4, 3.4), xc + s * range(rand, 0, d * 0.25), top, zc + range(rand, -w * 0.25, w * 0.25), { metres: 3.6 });
    const nAc = Math.floor(range(rand, 0, 4));
    for (let i = 0; i < nAc; i += 1) ac(s, xc - s * range(rand, d * 0.1, d * 0.4), top + 0.3, zc + range(rand, -w * 0.4, w * 0.4), true);
    if (chance(rand, 0.6)) antenna(xc + s * range(rand, -d * 0.3, d * 0.3), top, zc + range(rand, -w * 0.35, w * 0.35));
  };

  // TV antenna mast with Yagi crossbars: thin silhouettes against the sky.
  const antenna = (x, y, z) => {
    const h = range(rand, 2.2, 4.2);
    inst.add('mast', G.pipe, lib.steel, M(x, y + h / 2, z, 0, 0.025, h, 0.025), null, { cast: true });
    const boom = range(rand, 1.4, 2.4); const ry = range(rand, 0, Math.PI);
    inst.add('boom', G.box, lib.steel, M(x, y + h - 0.2, z, ry, boom, 0.025, 0.025));
    for (let i = 0; i < 7; i += 1) {
      const t = (i / 6 - 0.5) * boom;
      const len = 0.9 - i * 0.07;
      inst.add('element', G.box, lib.steel, M(x + Math.cos(ry) * t, y + h - 0.2, z - Math.sin(ry) * t, ry + Math.PI / 2, len, 0.015, 0.015));
    }
    if (chance(rand, 0.5)) inst.add('dish', G.tank, lib.trim, M(x, y + h * 0.55, z, ry, 0.3, 0.05, 0.3));
  };

  // Gable roof with tiles; ridge along z (parallel to street) or x.
  const gable = (s, xc, zc, w, d, top, alongStreet, wallMat) => {
    const pitch = range(rand, 0.38, 0.55);
    const span = alongStreet ? d : w;
    const len = (alongStreet ? w : d) + 0.7;
    const rise = Math.tan(pitch) * span / 2;
    const slab = span / 2 / Math.cos(pitch) + 0.45;
    for (const k of [-1, 1]) {
      const g = new BoxGeometry(alongStreet ? slab : len, 0.14, alongStreet ? len : slab);
      worldUV(g, 1.2, [rand() * 4, 0]);
      const m = mesh(g, lib.roof, { cast: true, receive: true });
      if (alongStreet) at(m, xc + k * (Math.cos(pitch) * slab / 2 - 0.2), top + rise / 2 - 0.1, zc, 0, 0, -k * pitch);
      else at(m, xc, top + rise / 2 - 0.1, zc + k * (Math.cos(pitch) * slab / 2 - 0.2), k * pitch, 0, 0);
      group.add(m);
    }
    const tri = plate([[-span / 2, 0], [span / 2, 0], [0, rise]], 0.12, 0);
    worldUV(tri, 2.4);
    for (const k of [-1, 1]) {
      const m = mesh(tri, wallMat, { cast: true, receive: true });
      if (alongStreet) at(m, xc, top, zc + k * (w / 2 - 0.06));
      else at(m, xc + k * (d / 2 - 0.06), top, zc, 0, Math.PI / 2, 0);
      group.add(m);
    }
    inst.add('ridge', G.box, lib.darkTrim, alongStreet ? M(xc, top + rise + 0.02, zc, 0, 0.22, 0.14, len) : M(xc, top + rise + 0.02, zc, 0, len, 0.14, 0.22));
    if (chance(rand, 0.7)) antenna(xc, top + rise * 0.8, zc + range(rand, -w * 0.3, w * 0.3));
  };

  // ---------- lot types ----------

  const house = (s, z0, z1, setback, { frontWall = true } = {}) => {
    const w = z0 - z1 - range(rand, 0.3, 0.8); const zc = (z0 + z1) / 2;
    const d = range(rand, 7.5, 10); const floors = 2; const fh = 2.8; const H = floors * fh + 0.3;
    const xf = s * (STREET.lot + setback); const xc = xf + s * d / 2;
    const f = facadeMat(['render', 'siding', 'tiles']);
    box(f.material, w, H, d, xc, 0, zc, { metres: f.metres });
    gable(s, xc, zc, w, d, H, chance(rand, 0.6), f.material);
    // ground floor: door + window; upper: two windows
    const door = range(rand, -w * 0.3, w * 0.3);
    inst.add('door', G.box, lib.frameDark, M(xf - s * 0.03, 1.0, zc + door, 0, 0.06, 2.0, 0.85));
    inst.add('canopy', G.box, lib.trim, M(xf - s * 0.35, 2.3, zc + door, 0, 0.7, 0.06, 1.3));
    window(s, xf, zc + (door > 0 ? -w * 0.25 : w * 0.25), 1.35, 1.5, 1.05);
    for (const k of [-0.25, 0.25]) window(s, xf, zc + k * w, fh + 1.4, range(rand, 1.2, 1.7), range(rand, 0.9, 1.15));
    if (chance(rand, 0.5)) window(s, xf, zc + range(rand, -0.1, 0.1) * w, fh + 1.6, 0.55, 0.45, { frosted: true });
    pipe(xf - s * 0.08, zc + w / 2 - 0.12, 0, H);
    if (chance(rand, 0.6)) ac(s, xf - s * 0.2, 0.3, zc + (door > 0 ? w * 0.38 : -w * 0.38));
    if (setback > 1.2 && chance(rand, 0.7)) wall(s, z0, z1, STREET.lot + 0.1, range(rand, 1.1, 1.6), door, { draw: frontWall });
    facades.push({ side: s, z0: zc + w / 2, z1: zc - w / 2, xf, height: H, kind: 'house' });
  };

  const mansion = (s, z0, z1, setback) => {
    const w = z0 - z1 - range(rand, 0.2, 0.6); const zc = (z0 + z1) / 2;
    const d = range(rand, 10, 14); const floors = Math.floor(range(rand, 3, z0 < -18 ? 6 : 4.4)); const fh = 3.0; const g0 = 3.2; const H = g0 + (floors - 1) * fh;
    const xf = s * (STREET.lot + setback); const xc = xf + s * d / 2;
    const f = facadeMat(['tiles', 'concrete', 'tiles']);
    box(f.material, w, H, d, xc, 0, zc, { metres: f.metres });
    rooftop(s, xc, zc, w, d, H);
    const bays = Math.max(2, Math.round(w / 3.2)); const bw = w / bays;
    const balconies = chance(rand, 0.7);
    for (let fl = 1; fl < floors; fl += 1) {
      const y = g0 + (fl - 1) * fh;
      for (let b = 0; b < bays; b += 1) {
        const bz = zc - w / 2 + bw * (b + 0.5);
        if (balconies) {
          const depth = 1.1;
          inst.add('slab', G.box, lib.parapet, M(xf - s * depth / 2, y, bz, 0, depth, 0.16, bw), null, { cast: true });
          inst.add('parapetPanel', G.box, b % 2 ? lib.parapet : lib.trim, M(xf - s * (depth - 0.05), y + 0.55, bz, 0, 0.1, 0.95, bw - 0.02), null, { cast: true });
          inst.add('rail', G.box, lib.frame, M(xf - s * (depth - 0.05), y + 1.08, bz, 0, 0.08, 0.05, bw));
          if (b > 0) inst.add('divider', G.box, lib.frosted, M(xf - s * depth / 2, y + 1.05, bz - bw / 2, 0, depth, 1.9, 0.03));
          window(s, xf, bz - bw * 0.05, y + 1.15, bw * 0.62, 2.0, { lit: rand() < 0.48 });
          if (chance(rand, 0.7)) ac(s, xf - s * 0.7, y + 0.4, bz + bw * 0.32);
        } else {
          window(s, xf, bz, y + 1.5, Math.min(bw * 0.6, 1.8), 1.2);
          if (chance(rand, 0.35)) ac(s, xf - s * 0.2, y + 0.4, bz + bw * 0.38);
        }
      }
    }
    // ground floor: lobby + small windows
    const lobby = range(rand, -w * 0.25, w * 0.25);
    inst.add('glassLit2', G.plane, glassLit[2], M(xf - s * 0.012, 1.25, zc + lobby, -s * Math.PI / 2, 1.6, 2.4), kelvin(WARM).multiplyScalar(0.9));
    inst.add('frameDark', G.frame, lib.frameDark, M(xf - s * 0.035, 1.25, zc + lobby, -s * Math.PI / 2, 1.7, 2.5));
    inst.add('canopy', G.box, lib.trim, M(xf - s * 0.6, 2.75, zc + lobby, 0, 1.2, 0.12, 2.6), null, { cast: true });
    for (const k of [-0.38, 0.38]) if (Math.abs(k * w - lobby) > 1.6) window(s, xf, zc + k * w, 1.7, 1.2, 0.9, { frosted: chance(rand, 0.5) });
    pipe(xf - s * 0.08, zc - w / 2 + 0.12, 0, H);
    facades.push({ side: s, z0: zc + w / 2, z1: zc - w / 2, xf, height: H, kind: 'mansion', floors });
  };

  const shop = (s, z0, z1, setback) => {
    const w = z0 - z1 - range(rand, 0.2, 0.5); const zc = (z0 + z1) / 2;
    const d = range(rand, 8, 12); const floors = Math.floor(range(rand, 2, z0 < -18 ? 5 : 3.6)); const g0 = 3.4; const fh = 2.9; const H = g0 + (floors - 1) * fh;
    const xf = s * (STREET.lot + setback); const xc = xf + s * d / 2;
    const f = facadeMat(['tiles', 'siding', 'render', 'corrugated', 'concrete']);
    box(f.material, w, H, d, xc, 0, zc, { metres: f.metres });
    if (floors > 2 || chance(rand, 0.5)) rooftop(s, xc, zc, w, d, H); else gable(s, xc, zc, w, d, H, true, f.material);
    const ry = -s * Math.PI / 2;
    const open = chance(rand, 0.6);
    const sw = w - 0.8;
    if (open) {
      const k = Math.floor(rand() * 3);
      inst.add(`shop${k}`, G.plane, shopLit[k], M(xf - s * 0.01, 1.35, zc, ry, sw, 2.5), interiorColour(rand).multiplyScalar(0.85));
      inst.add('frame', G.frame, lib.frame, M(xf - s * 0.035, 1.35, zc, ry, sw, 2.6));
    } else {
      const g = new BoxGeometry(0.06, 2.6, sw);
      worldUV(g, 1);
      const m = mesh(g, lib.shutter, { receive: true });
      at(m, xf - s * 0.04, 1.3, zc);
      group.add(m);
    }
    // fascia sign
    const name = `fascia${Math.floor(rand() * 8)}`;
    const fg = new BoxGeometry(0.16, 0.62, sw + 0.2);
    faceUV(fg, 'x', -s, lib.signs[name]);
    for (const [axis, sign] of [['x', s], ['y', 1], ['y', -1], ['z', 1], ['z', -1]]) faceUV(fg, axis, sign, [0.999, 0, 1, 0.001]);
    const fm = mesh(fg, open || chance(rand, 0.5) ? lib.signsLit : lib.signsDim);
    at(fm, xf - s * 0.1, g0 - 0.15, zc);
    group.add(fm);
    if (chance(rand, 0.4)) inst.add('awning', G.box, lib.darkTrim, M(xf - s * 0.55, g0 - 0.55, zc, 0, 1.1, 0.05, sw), null, { cast: true });
    for (let fl = 1; fl < floors; fl += 1) {
      const y = g0 + (fl - 1) * fh;
      const n = Math.max(1, Math.round(w / 2.6));
      for (let k = 0; k < n; k += 1) window(s, xf, zc - w / 2 + w / n * (k + 0.5), y + 1.45, Math.min(1.6, w / n - 0.6), 1.1);
      if (chance(rand, 0.4)) ac(s, xf - s * 0.2, y + 0.35, zc + w / 2 - 0.6);
    }
    pipe(xf - s * 0.08, zc + w / 2 - 0.1, 0, H, 0.045);
    facades.push({ side: s, z0: zc + w / 2, z1: zc - w / 2, xf, height: H, kind: 'shop', floors, signY: g0 });
  };

  // Concrete block garden wall along the property line, with an optional gate gap.
  // z-ranges [high, low] kept clear of property-line walls and garden trees: each vending cluster plus its bins.
  const vendingClear = (s) => VENDING.filter((v) => v.side === s && !v.dx)
    .map((v) => { const half = (v.count * (VENDING_W + 0.06)) / 2 + 1.1; return [v.z + half, v.z - half]; });
  const clearOf = (s, z) => vendingClear(s).every(([g0, g1]) => z > g0 || z < g1);
  const cut = (segs, gaps) => gaps.reduce((acc, [g0, g1]) => acc.flatMap(([a, b]) => (g1 >= a || g0 <= b
    ? [[a, b]]
    : [[a, Math.max(g0, b)], [Math.min(g1, a), b]].filter(([p, q]) => p - q >= 0.3))), segs);

  const wall = (s, z0, z1, xAbs, h, gap = null, { draw = true } = {}) => {
    const segs = gap === null ? [[z0, z1]] : [[z0, (z0 + z1) / 2 + gap + 0.6], [(z0 + z1) / 2 + gap - 0.6, z1]];
    const onLine = xAbs < STREET.lot + 1;
    for (const [a, b] of segs) {
      if (a - b < 0.3) continue;
      const offset = rand() * 10;   // one draw per original segment keeps the seeded layout unchanged
      if (!draw) continue;
      for (const [p, q] of onLine ? cut([[a, b]], vendingClear(s)) : [[a, b]]) {
        box(lib.blocks, p - q, h, 0.15, s * (xAbs + 0.075), 0, (p + q) / 2, { metres: 1.6, offset });
        inst.add('cap', G.box, lib.trim, M(s * (xAbs + 0.075), h + 0.03, (p + q) / 2, 0, 0.2, 0.06, p - q));
      }
    }
  };

  const garden = (s, z0, z1) => {
    wall(s, z0, z1, STREET.lot + 0.1, range(rand, 1.3, 1.8));
    const n = Math.floor(range(rand, 1, 3));
    for (let i = 0; i < n; i += 1) {
      const x = s * (STREET.lot + range(rand, 1.2, 2.5)); const z = range(rand, z1 + 0.8, z0 - 0.8); const h = range(rand, 2.5, 4.5);
      const keep = clearOf(s, z);
      if (keep) inst.add('trunk', G.pipe, lib.frameDark, M(x, h / 2, z, 0, 0.08, h, 0.08));
      for (let k = 0; k < 5; k += 1) {
        const leaf = M(x + range(rand, -0.6, 0.6), h + range(rand, -0.6, 0.5), z + range(rand, -0.6, 0.6), rand() * 3, range(rand, 0.6, 1.1), range(rand, 0.6, 1.0), range(rand, 0.6, 1.1));
        if (keep) inst.add('canopyLeaf', G.tank, lib.leaf, leaf, null, { cast: true });
      }
    }
    house(s, z0, z1, range(rand, 4, 6), { frontWall: false });
  };

  const parking = (s, z0, z1) => {
    const w = z0 - z1; const zc = (z0 + z1) / 2; const back = 9.5;
    const lot = new PlaneGeometry(back, w);
    worldUV(lot, 4);
    const lm = mesh(lot, lib.apron);
    at(lm, s * (STREET.lot + back / 2), 0.03, zc, -Math.PI / 2, 0, 0);
    group.add(lm);
    const bays = Math.floor(w / 2.5);
    for (let i = 0; i <= bays; i += 1) {
      inst.add('lotLine', G.box, lib.trim, M(s * (STREET.lot + 3.5), 0.038, z0 - 0.4 - i * 2.5, 0, 5, 0.01, 0.12));
      if (i < bays) {
        inst.add('stop', G.box, lib.trim, M(s * (STREET.lot + 5.2), 0.06, z0 - 0.4 - i * 2.5 - 1.25, 0, 0.15, 0.12, 1.4));
        inst.add('flap', G.box, lib.darkTrim, M(s * (STREET.lot + 3.2), 0.05, z0 - 0.4 - i * 2.5 - 1.25, 0, 0.6, 0.08, 0.3));
      }
    }
    wall(s, z0, z1, STREET.lot + back, 1.6);
    mansion(s, z0 + 1, z1 - 1, back + 0.6);
    facades.pop();
    facades.push({ side: s, z0, z1, xf: s * STREET.lot, height: 0, kind: 'parking' });
  };

  // ---------- street sides ----------

  const weighted = (weights) => {
    let r = rand() * Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) return k; }
    return 'house';
  };

  for (const s of [-1, 1]) {
    let z = STREET.near;
    const lots = PARKING.filter((p) => p.side === s);
    while (z > STREET.far) {
      const { z0: j0, z1: j1 } = STREET.junction;
      if (z > j1 && z - 4 < j0 && z > j0 - 0.01) { z = j1 - (s < 0 ? 4.2 : 1.2); continue; }
      const lot = lots.find((p) => z > p.z1 && z - 3 < p.z0);
      if (lot) {
        if (z - lot.z0 > 3.5) mansion(s, z, lot.z0, 0.4);
        parking(s, lot.z0, lot.z1);
        z = lot.z1;
        continue;
      }
      const kind = weighted(LOT_WEIGHTS(z));
      let w = kind === 'house' ? range(rand, 6.5, 9) : kind === 'mansion' ? range(rand, 8, 14) : kind === 'shop' ? range(rand, 5.5, 9) : range(rand, 5, 8);
      let z1 = z - w;
      if (z > j0 && z1 < j0) z1 = j0;
      const next = lots.find((p) => z > p.z0 && z1 < p.z0);
      if (next) z1 = next.z0;
      w = z - z1;
      if (w < 3.5) { z = z1; continue; }
      const setback = Math.max(reserved(s, z, z1), kind === 'house' ? range(rand, 0.3, 2.2) : range(rand, 0, 0.6));
      ({ house, mansion, shop, garden })[kind](s, z, z1, setback);
      z = z1 - range(rand, 0, 0.5);
    }
  }

  // T-junction at the far end: just past the last side lot on either side.
  const tee = { z0: Math.min(STREET.far, ...facades.map((f) => f.z1)) - 0.3 };
  tee.z1 = tee.z0 - TEE.width;

  // Apron between gutter and property line (overlaps the grating edge by 3 cm, slightly higher, so no seam).
  for (const s of [-1, 1]) {
    for (const [a, b] of [[STREET.near, STREET.junction.z0], [STREET.junction.z1, tee.z0]]) {
      const g = new PlaneGeometry(4.13, a - b);
      worldUV(g, 3.6);
      const m = mesh(g, lib.apron);
      at(m, s * (STREET.half + STREET.gutter - 0.03 + 2.065), 0.015, (a + b) / 2, -Math.PI / 2, 0, 0);
      group.add(m);
    }
  }

  // ---------- terminus: low-rise frontage closing the T, facing down the street ----------
  // Own seeded stream, so adding it doesn't reshuffle anything built from the main one.
  {
    const r = rng(TEE.seed);
    const zFront = tee.z1 - TEE.apron;
    const winZ = (x, zf, y, w, h, lit) => {
      if (lit) {
        const v = Math.floor(r() * 3);
        inst.add(`glassLit${v}`, G.plane, glassLit[v], M(x, y, zf + 0.012, 0, w * 0.96, h * 0.96), interiorColour(r));
      } else {
        inst.add('glass', G.plane, glassDark, M(x, y, zf + 0.012, 0, w * 0.96, h * 0.96));
      }
      inst.add('frame', G.frame, lib.frame, M(x, y, zf + 0.035, 0, w, h, 1));
      inst.add('sill', G.box, lib.trim, M(x, y - h / 2 - 0.03, zf + 0.06, 0, w + 0.1, 0.05, 0.12));
    };
    let x = -TEE.span;
    while (x < TEE.span) {
      const W = range(r, 6, 11); const xc = x + W / 2; x += W;
      range(r, 0, 0.4);   // former gap width: draw kept so the frontage keeps its seeded layout
      const floors = r() < 0.55 ? 2 : 3; const H = 3.3 + (floors - 1) * 2.9; const Dp = range(r, 9, 12);
      const zf = zFront - range(r, 0, 1.2);
      const f = pick(r, lib.facades.filter((q) => ['tiles', 'siding', 'render', 'concrete'].includes(q.set)));
      box(f.material, Dp, H, W, xc, 0, zf - Dp / 2, { metres: f.metres, offset: r() * 10 });
      // parapet + coping, a tank or a mast on some roofs
      const ph = range(r, 0.5, 0.9);
      box(lib.parapet, 0.15, ph, W, xc, H, zf - 0.075, { metres: 3.6, offset: r() * 10 });
      inst.add('coping', G.box, lib.trim, M(xc, H + ph + 0.03, zf - 0.075, 0, W + 0.04, 0.06, 0.22));
      if (r() < 0.5) inst.add('tank', G.tank, lib.trim, M(xc + range(r, -W / 3, W / 3), H + 0.9, zf - Dp / 2, 0, 0.7, 1.2, 0.7), null, { cast: true });
      if (r() < 0.6) {
        const mh = range(r, 2.2, 3.8); const mx = xc + range(r, -W / 3, W / 3); const mz = zf - range(r, 2, Dp - 2);
        inst.add('mast', G.pipe, lib.steel, M(mx, H + mh / 2, mz, 0, 0.025, mh, 0.025));
        inst.add('boom', G.box, lib.steel, M(mx, H + mh - 0.2, mz, range(r, 0, 3), range(r, 1.4, 2.2), 0.025, 0.025));
      }
      // ground floor: lit shopfront + fascia, or a door and a window
      if (r() < 0.45) {
        const sw = W - 0.8; const k = Math.floor(r() * 3);
        inst.add(`shop${k}`, G.plane, shopLit[k], M(xc, 1.35, zf + 0.01, 0, sw, 2.5), interiorColour(r).multiplyScalar(0.85));
        inst.add('frame', G.frame, lib.frame, M(xc, 1.35, zf + 0.035, 0, sw, 2.6));
        const fg = new BoxGeometry(sw + 0.2, 0.62, 0.16);
        faceUV(fg, 'z', 1, lib.signs[`fascia${Math.floor(r() * 8)}`]);
        for (const [axis, sign] of [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', -1]]) faceUV(fg, axis, sign, [0.999, 0, 1, 0.001]);
        group.add(at(mesh(fg, lib.signsLit), xc, 3.15, zf + 0.1));
      } else {
        inst.add('door', G.box, lib.frameDark, M(xc - W * 0.25, 1.0, zf + 0.03, 0, 0.85, 2.0, 0.06));
        winZ(xc + W * 0.2, zf, 1.4, 1.5, 1.05, r() < 0.4);
      }
      for (let fl = 1; fl < floors; fl += 1) {
        const n = Math.max(1, Math.round(W / 2.8));
        for (let k = 0; k < n; k += 1) winZ(xc - W / 2 + W / n * (k + 0.5), zf, 3.3 + (fl - 1) * 2.9 + 1.45, Math.min(1.6, W / n - 0.6), 1.1, r() < 0.45);
      }
      inst.add('pipe', G.pipe, lib.galv, M(xc + W / 2 - 0.12, H / 2, zf + 0.08, 0, 0.05, H, 0.05));
    }
    // continuous back row, taller than the frontage: no daylight at street level through the T
    let bx = -TEE.span - 6;
    while (bx < TEE.span + 6) {
      const W = range(r, 10, 18); const H = range(r, 11, 17); const D = range(r, 10, 14);
      const g = new BoxGeometry(W + 0.2, H, D);
      g.translate(0, H / 2, 0);
      worldUV(g, [24, 48], [r(), r() * 0.2]);
      group.add(at(mesh(g, pick(r, lib.skyline), { receive: false }), bx + W / 2, 0, zFront - 13.5 - D / 2 - range(r, 0, 2)));
      bx += W;
    }
  }

  // ---------- second row + skyline ----------

  for (const s of [-1, 1]) {
    let z = STREET.near;
    while (z > STREET.far - 30) {
      const w = range(rand, 8, 18); const h = range(rand, 6, 13) + Math.max(0, -z - 30) * 0.22; const d = range(rand, 10, 16);
      const x = s * range(rand, 19, 30);
      const g = new BoxGeometry(d, h, w);
      g.translate(0, h / 2, 0);
      worldUV(g, [24, 48], [rand(), rand() * 0.2]);
      const m = mesh(g, pick(rand, lib.skyline), { receive: false });
      at(m, x, 0, z - w / 2);
      group.add(m);
      if (chance(rand, 0.6)) antenna(x, h, z - w / 2 + range(rand, -2, 2));
      if (chance(rand, 0.25)) inst.add('tank', G.tank, lib.trim, M(x, h + 0.8, z - w / 2, 0, 0.9, 1.4, 0.9));
      z -= w + range(rand, 0, 3);
    }
  }

  // Far towers, off the street axis, carrying red aviation beacons.
  const beacons = [];
  for (const [x, z, h, w] of [[-58, -150, 92, 22], [64, -170, 120, 24], [-90, -190, 70, 26]]) {
    const g = new BoxGeometry(w, h, w);
    g.translate(0, h / 2, 0);
    worldUV(g, [24, 48]);
    const m = mesh(g, lib.skyline[0], { receive: false });
    at(m, x, 0, z);
    group.add(m);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beacons.push(new Vector3(x + dx * w * 0.45, h + 0.5, z + dz * w * 0.45));
  }

  inst.build(group);

  return { group, facades, beacons, tee };
};
