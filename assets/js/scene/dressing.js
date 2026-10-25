// Dressing: utility poles, the overhead wire web, street lamps, the parked car, neon, signs and clutter. Seeded.
import {
  BoxGeometry, Color, CylinderGeometry, Group, MeshBasicMaterial, PlaneGeometry, PointLight, SphereGeometry, SpotLight,
  TorusGeometry, Vector3,
} from '../vendor/three.module.js';
import { STREET, POLES, CAR, PARKING, VENDING } from './layout.js';
import { mesh, at, plate, range, pick, chance, wire, hose, merge, faceUV, atlasUV } from './parts.js';
import { kelvin, LAMP, glow } from './materials.js';
import { instancer, M } from './buildings.js';
import { flicker } from './motion.js';

export const dressing = (lib, rand, { tier, facades }) => {
  const group = new Group();
  const inst = instancer();
  const wires = [];
  const lights = [];
  const animated = [];
  const box = new BoxGeometry(1, 1, 1);
  const cyl = new CylinderGeometry(1, 1, 1, 10);
  const torus = new TorusGeometry(1, 0.12, 4, 14);
  const sphere = new SphereGeometry(1, 7, 5);
  const lampHot = kelvin(LAMP);
  let shadowBudget = tier === 'high' ? 2 : 1;

  // ---------- utility poles ----------
  const poles = POLES.map((p) => {
    const s = p.side;
    const x = s * (STREET.half + 0.12);
    const h = p.height;
    const g = new CylinderGeometry(0.14, 0.2, h, 14);
    g.translate(0, h / 2, 0);
    const shaft = mesh(g, lib.poleConcrete, { cast: true, receive: true });
    at(shaft, x, 0, p.z);
    group.add(shaft);

    const sleeve = atlasUV(new CylinderGeometry(0.205, 0.205, 1.8, 14, 1, true, Math.PI), lib.signs.sleeve);   // UV seam faces away (-z)
    group.add(at(mesh(sleeve, lib.signsDim), x, 0.9, p.z));

    // crossarms: HV on top, LV below; arms run across the street axis (x)
    const arms = [h - 0.35, h - 1.35];
    arms.forEach((y, k) => {
      const len = k === 0 ? 1.9 : 1.3;
      inst.add('arm', box, lib.galv, M(x - s * 0.15, y, p.z, 0, len, 0.09, 0.09), null, { cast: true });
      inst.add('brace', box, lib.galv, M(x - s * 0.15, y - 0.28, p.z, 0, 0.04, 0.6, 0.04));
      const n = k === 0 ? 3 : 2;
      for (let i = 0; i < n; i += 1) {
        const ox = (i - (n - 1) / 2) * (len * 0.8) / Math.max(1, n - 1) * (n > 1 ? 1 : 0);
        inst.add('insulator', cyl, lib.insulator, M(x - s * 0.15 + ox, y + 0.12, p.z, 0, 0.05, 0.16, 0.05));
      }
    });
    if (p.transformer) {
      for (let i = 0; i < 2; i += 1) {
        const tz = p.z + (i - 0.5) * 0.7;
        inst.add('trans', cyl, lib.transformer, M(x + s * 0.42, h - 3.3, tz, 0, 0.3, 0.95, 0.3), null, { cast: true });
        inst.add('transCap', cyl, lib.transformer, M(x + s * 0.42, h - 2.78, tz, 0, 0.33, 0.06, 0.33));
        inst.add('bushing', cyl, lib.insulator, M(x + s * 0.42, h - 2.65, tz, 0, 0.04, 0.2, 0.04));
        wires.push({ a: new Vector3(x + s * 0.42, h - 2.55, tz), b: new Vector3(x - s * 0.15 + s * 0.52, h - 1.23, p.z), sag: 0.1, r: 0.008 });
      }
      inst.add('bracket', box, lib.galv, M(x + s * 0.2, h - 3.3, p.z, 0, 0.5, 0.12, 0.12));
    }
    // telecom brackets (the side-run cables terminate on these), closure + step bolts
    inst.add('telecomArm', box, lib.galv, M(x - s * 0.27, h - 4.72, p.z, 0, 0.54, 0.05, 0.05));
    inst.add('telecomArm', box, lib.galv, M(x - s * 0.32, h - 5.22, p.z, 0, 0.64, 0.05, 0.05));
    inst.add('closure', cyl, lib.rubber, M(x - s * 0.5, h - 4.9, p.z + 0.6, 0, 0.13, 0.75, 0.13));
    for (let i = 0; i < 14; i += 1) {
      const a = i * 2.2;
      inst.add('step', box, lib.galv, M(x + Math.cos(a) * 0.2, 2.6 + i * 0.42, p.z + Math.sin(a) * 0.2, -a, 0.22, 0.025, 0.025));
    }
    // vertical sign strapped to the pole, facing oncoming view (+z), and an address plate
    if (chance(rand, 0.75)) {
      const name = `pole${Math.floor(rand() * 4)}`;
      const sg = new BoxGeometry(0.44, 2.6, 0.04);
      faceUV(sg, 'z', 1, lib.signs[name]);
      faceUV(sg, 'z', -1, lib.signs[`pole${(Number(name.slice(-1)) + 1) % 4}`]);
      for (const [axis, sign] of [['x', 1], ['x', -1], ['y', 1], ['y', -1]]) faceUV(sg, axis, sign, [0.0, 0.55, 0.004, 0.56]);
      const m = mesh(sg, lib.signsDim, { cast: true });
      at(m, x, 3.6, p.z + 0.22);
      group.add(m);
      for (const y of [2.5, 4.7]) inst.add('strap', cyl, lib.galv, M(x, y, p.z, 0, 0.215, 0.04, 0.215));
    }
    const addr = new BoxGeometry(0.2, 0.48, 0.02);
    faceUV(addr, 'z', 1, lib.signs[`addr${Math.floor(rand() * 4)}`]);
    group.add(at(mesh(addr, lib.signsDim), x, 1.95, p.z + 0.21));

    // street lamp on an arm reaching over the road
    if (p.lamp) {
      const y = 6.2; const reach = 1.7;
      const head = new Vector3(x - s * reach, y + 0.35, p.z);
      const arm = hose([new Vector3(x, y - 0.4, p.z), new Vector3(x - s * reach * 0.35, y + 0.25, p.z), head], 0.04, 16);
      group.add(mesh(arm, lib.galv, { cast: true }));
      group.add(at(mesh(new BoxGeometry(0.62, 0.1, 0.24), lib.galv, { cast: true }), head.x - s * 0.18, head.y, p.z));
      const lens = glow(lampHot, 3.2);
      group.add(at(mesh(new PlaneGeometry(0.5, 0.16), lens), head.x - s * 0.18, head.y - 0.052, p.z, Math.PI / 2, 0, 0));
      const spot = new SpotLight(lampHot, 70, 22, 0.95, 0.65, 2);
      spot.position.set(head.x - s * 0.18, head.y - 0.1, p.z);
      spot.target.position.set(head.x * 0.35, 0, p.z - 1.5);
      if (shadowBudget > 0 && Math.abs(p.z) < 20) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(tier === 'high' ? 1024 : 512, tier === 'high' ? 1024 : 512);
        spot.shadow.bias = -0.0004;
        spot.shadow.normalBias = 0.03;
        spot.shadow.camera.near = 0.5;
        spot.shadow.camera.far = 14;
        shadowBudget -= 1;
      }
      group.add(spot, spot.target);
      lights.push(spot);
      if (p.z < -45) animated.push({ kind: 'lamp', light: spot, mat: lens, base: spot.intensity, phase: rand() });
    }
    return { ...p, x, h, top: new Vector3(x - s * 0.15, h - 0.25, p.z) };
  });

  // ---------- wires ----------
  const sides = { [-1]: poles.filter((p) => p.side < 0), 1: poles.filter((p) => p.side > 0) };
  const pt = (p, dx, dy, dz = 0) => new Vector3(p.x - p.side * 0.15 + dx, p.h + dy, p.z + dz);
  // A point on the tapered pole surface at height y, facing toward world z `toZ` / across the street.
  const onPole = (p, y, toZ) => {
    const r = 0.2 - 0.06 * (y / p.h);
    const dir = new Vector3(-p.side * 3, 0, toZ - p.z).normalize();
    return new Vector3(p.x + dir.x * r, y, p.z + dir.z * r);
  };
  // A point on the facade covering z on that side (nearest facade if z falls in a gap), below its roofline.
  const onFacade = (side, z, y) => {
    const list = facades.filter((f) => f.side === side && f.height > 4);
    const f = list.find((q) => z <= q.z0 && z >= q.z1) ?? list.reduce((m, q) => (Math.abs((q.z0 + q.z1) / 2 - z) < Math.abs((m.z0 + m.z1) / 2 - z) ? q : m));
    const zz = Math.min(f.z0 - 0.2, Math.max(f.z1 + 0.2, z));
    const p = new Vector3(f.xf - f.side * 0.05, Math.min(y, f.height - 0.4), zz);
    inst.add('hook', box, lib.galv, M(p.x, p.y, p.z, 0, 0.12, 0.05, 0.05));
    return p;
  };

  // Along each side: 3 HV, 2 LV, 2 thick telecom bundles.
  for (const s of [-1, 1]) {
    const list = sides[s];
    for (let i = 0; i < list.length - 1; i += 1) {
      const a = list[i]; const b = list[i + 1];
      const span = Math.abs(a.z - b.z);
      for (const dx of [-0.76, 0, 0.76]) wires.push({ a: pt(a, dx, -0.23), b: pt(b, dx, -0.23), sag: span * 0.018, r: 0.011 });
      for (const dx of [-0.52, 0.52]) wires.push({ a: pt(a, dx, -1.23), b: pt(b, dx, -1.23), sag: span * 0.025, r: 0.014 });
      wires.push({ a: pt(a, -s * 0.35, -4.7), b: pt(b, -s * 0.35, -4.7), sag: span * 0.03, r: 0.03 });
      wires.push({ a: pt(a, -s * 0.45, -5.2), b: pt(b, -s * 0.45, -5.2), sag: span * 0.034, r: 0.022 });
      if (chance(rand, 0.6)) inst.add('coil', torus, lib.rubber, M(a.x - s * 0.5, a.h - 4.94, a.z - 1.2, Math.PI / 2, 0.22, 0.22, 0.22));
    }
  }

  // Zig-zag crossings: each pole feeds the next pole on the opposite side, criss-crossing the street.
  const ordered = [...poles].sort((p, q) => q.z - p.z);
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i]; const b = ordered[i + 1];
    if (a.side === b.side) continue;
    const span = a.top.distanceTo(b.top);
    wires.push({ a: pt(a, -a.side * 0.52, -1.23), b: pt(b, -b.side * 0.52, -1.23), sag: span * 0.03, r: 0.013 });
    wires.push({ a: pt(a, 0, -4.7), b: pt(b, 0, -5.2), sag: span * 0.04, r: 0.026 });
    if (chance(rand, 0.6)) wires.push({ a: pt(a, 0, -0.23), b: pt(b, 0, -0.23), sag: span * 0.02, r: 0.011 });
  }

  // Service drops from every pole to nearby facades on both sides, and a few facade-to-facade lines.
  for (const p of poles) {
    const near = facades.filter((f) => f.height > 4 && Math.abs((f.z0 + f.z1) / 2 - p.z) < 14);
    const n = Math.min(near.length, 3 + Math.floor(rand() * 3));
    for (let i = 0; i < n; i += 1) {
      const f = pick(rand, near);
      const z = range(rand, f.z1 + 0.5, f.z0 - 0.5);
      const y = range(rand, 4.4, Math.min(f.height - 0.4, 7));
      range(rand, -0.4, 0.4);   // keeps the seeded sequence identical
      const from = onPole(p, p.h - range(rand, 4.6, 5.4), z);
      const to = new Vector3(f.xf - f.side * 0.05, y, z);
      inst.add('hook', box, lib.galv, M(from.x, from.y, from.z, 0, 0.06, 0.06, 0.06));
      wires.push({ a: from, b: to, sag: from.distanceTo(to) * range(rand, 0.02, 0.05), r: range(rand, 0.006, 0.011) });
      inst.add('hook', box, lib.galv, M(to.x, to.y, to.z, 0, 0.12, 0.05, 0.05));
    }
  }
  const tall = facades.filter((f) => f.height > 6);
  for (let i = 0; i < 6; i += 1) {
    const a = pick(rand, tall.filter((f) => f.side < 0)); const b = pick(rand, tall.filter((f) => f.side > 0));
    if (!a || !b) continue;
    const za = range(rand, a.z1, a.z0); const zb = za + range(rand, -9, 9);
    const fa = new Vector3(a.xf, range(rand, 5.5, a.height - 0.5), za);
    const fb = new Vector3(b.xf, range(rand, 5.5, b.height - 0.5), zb);
    wires.push({ a: fa, b: fb, sag: fa.distanceTo(fb) * 0.035, r: 0.008 });
  }

  // Foreground lines on the camera path: the dolly travels under these first.
  const fore = poles.find((p) => p.z === 8.7); const back = poles.find((p) => p.z === 1.2);
  for (const [a, b, sag, r] of [
    [onFacade(-1, 16, 7.4), onPole(fore, 6.8, 16), 0.5, 0.02],
    [onFacade(-1, 13.5, 6.4), onPole(fore, 7.6, 13.5), 0.35, 0.012],
    [onFacade(-1, 11, 8.2), onPole(fore, 11.9, 11), 0.6, 0.011],
    [onPole(fore, 7.0, 4.5), onFacade(-1, 4.5, 5.6), 0.45, 0.016],
    [onPole(fore, 10.9, 1.2), onPole(back, 11.4, 8.7), 0.4, 0.011],
    [onFacade(-1, 18, 9.0), onFacade(1, 12, 8.4), 0.55, 0.014],
  ]) wires.push({ a, b, sag, r });

  const wireGeo = merge(wires.map(({ a, b, sag, r }) => ({ geometry: wire(a, b, sag, r, Math.max(8, Math.round(a.distanceTo(b) * 1.4))) })));
  const wireMesh = mesh(wireGeo, lib.wire, { receive: false });
  wireMesh.userData.dynamic = true;
  group.add(wireMesh);

  // ---------- traffic mirror at the junction ----------
  {
    const x = STREET.half + 0.35; const z = STREET.junction.z0 + 0.4;
    inst.add('mirrorPost', cyl, lib.orange, M(x, 1.7, z, 0, 0.04, 3.4, 0.04), null, { cast: true });
    for (const k of [-1, 1]) {
      const disc = new SphereGeometry(0.42, 20, 8, 0, Math.PI * 2, 0, 0.5);
      const m = mesh(disc, lib.mirror);
      at(m, x - 0.05, 3.15, z + k * 0.08, Math.PI / 2 * k, 0, 0);
      m.rotation.y = k > 0 ? -0.6 : 0.6;
      group.add(m);
      const rim = mesh(new TorusGeometry(0.42, 0.035, 6, 24), lib.orange, { cast: true });
      at(rim, x - 0.05, 3.15, z + k * 0.08 + k * 0.02, 0, k > 0 ? -0.6 : 0.6, 0);
      group.add(rim);
    }
  }

  // ---------- road signs ----------
  const PARK = PARKING[0];
  const signPost = (x, z, y, name, w, h, lit = false) => {
    inst.add('post', cyl, lib.galv, M(x, y / 2, z, 0, 0.035, y, 0.035), null, { cast: true });
    const g = new BoxGeometry(w, h, 0.03);
    faceUV(g, 'z', 1, lib.signs[name]);
    for (const [axis, sign] of [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', -1]]) faceUV(g, axis, sign, [0.0, 0.55, 0.004, 0.56]);
    group.add(at(mesh(g, lit ? lib.signsLit : lib.signsDim, { cast: true }), x, y, z + 0.05));
  };
  signPost(-(STREET.half + 0.25), STREET.stopLine + 0.6, 2.3, 'stop', 0.8, 0.72);
  signPost(STREET.half + 0.25, -21.5, 2.4, 'noparking', 0.6, 0.6);
  signPost(PARK.side * (STREET.lot + 0.3), PARK.z0 - 0.6, 2.2, 'parking', 0.72, 1.0, true);
  inst.add('payBox', box, lib.darkTrim, M(PARK.side * (STREET.lot + 1.0), 0.65, PARK.z0 - 1.6, 0, 0.36, 1.3, 0.5), null, { cast: true });
  group.add(at(mesh(new PlaneGeometry(0.3, 0.2), glow(0x60c0ff, 2)), PARK.side * (STREET.lot + 0.81), 1.0, PARK.z0 - 1.6, 0, PARK.side * -Math.PI / 2, 0));

  // ---------- neon: projecting signs on the taller facades ----------
  const neonHosts = facades.filter((f) => (f.kind === 'shop' || f.kind === 'mansion') && f.height > 6 && f.z0 - f.z1 > 4);
  const keys = Object.keys(lib.neon);
  const patterns = ['breathe', 'steady', 'failing', 'breathe', 'steady', 'steady', 'failing'];
  let neonLights = tier === 'high' ? 3 : 1;
  neonHosts.slice(0, 11).forEach((f, i) => {
    const key = keys[i % keys.length];
    const { rect, vertical, colour } = lib.neon[key];
    const w = vertical ? 0.46 : 1.2; const h = vertical ? 1.7 : 0.5;
    const g = new BoxGeometry(w, h, 0.14);
    faceUV(g, 'z', 1, rect); faceUV(g, 'z', -1, rect);
    for (const [axis, sign] of [['x', 1], ['x', -1], ['y', 1], ['y', -1]]) faceUV(g, axis, sign, [0, 0, 0.002, 0.002]);
    const col = new Color(...colour.map((c) => c / 255));
    const mat = new MeshBasicMaterial({ map: lib.neonTex, color: new Color(2.4, 2.4, 2.4) });
    mat.userData.base = mat.color.clone();
    const z = f.z0 - range(rand, 0.4, 1.4);
    const y = Math.min(f.height - h / 2 - 0.4, (f.signY ?? 3.2) + h / 2 + range(rand, 0.3, 1.4));
    const x = f.xf - f.side * (w / 2 + 0.22);
    const m = mesh(g, mat);
    m.userData.dynamic = true;
    at(m, x, y, z);
    group.add(m);
    inst.add('neonBracket', box, lib.darkTrim, M(f.xf - f.side * 0.11, y + h * 0.35, z, 0, 0.22, 0.05, 0.05));
    inst.add('neonBracket', box, lib.darkTrim, M(f.xf - f.side * 0.11, y - h * 0.35, z, 0, 0.22, 0.05, 0.05));
    let light = null;
    if (neonLights > 0 && f.z0 < 6 && f.z0 > -40) {
      light = new PointLight(col, 4, 7, 2);
      light.position.set(x - f.side * 0.3, y, z);
      group.add(light);
      lights.push(light);
      neonLights -= 1;
    }
    animated.push({ kind: patterns[i % patterns.length], mat, light, base: light?.intensity ?? 0, phase: rand(), period: range(rand, 4, 9) });
  });

  // ---------- parked kei van, tail lights toward camera ----------
  const car = new Group();
  {
    const profile = [[0, 0.32], [3.35, 0.32], [3.35, 0.95], [3.12, 1.42], [2.62, 1.86], [0.1, 1.9], [0, 1.84]];
    const body = mesh(plate(profile, 1.46, 0.05), lib.paint(0xe8e8e4, 0.28), { cast: true, receive: true });
    at(body, 0, 0, 0, 0, Math.PI / 2, 0);
    car.add(body);
    const glass = lib.glass;
    const rear = mesh(new PlaneGeometry(1.22, 0.62), glass);
    at(rear, 0, 1.5, 0.003, 0, 0, 0);
    car.add(rear);
    for (const k of [-1, 1]) {
      const side = mesh(new PlaneGeometry(2.3, 0.55), glass);
      at(side, k * 0.735, 1.5, -1.45, 0, k * Math.PI / 2, 0);
      car.add(side);
      for (const zz of [-0.55, -2.75]) {
        const wheel = mesh(new CylinderGeometry(0.29, 0.29, 0.18, 18), lib.rubber, { cast: true });
        at(wheel, k * 0.66, 0.29, zz, 0, 0, Math.PI / 2);
        car.add(wheel);
      }
      const tail = mesh(new BoxGeometry(0.13, 0.46, 0.04), glow(0xff1a10, 5));
      tail.userData.dynamic = true;
      at(tail, k * 0.62, 0.95, 0.072);
      car.add(tail);
    }
    car.add(at(mesh(new BoxGeometry(1.5, 0.22, 0.08), lib.darkTrim, { cast: true }), 0, 0.42, 0.04));
    const plateGeo = new BoxGeometry(0.33, 0.165, 0.01);
    faceUV(plateGeo, 'z', 1, lib.signs.plate);
    car.add(at(mesh(plateGeo, lib.signsDim), 0, 0.68, 0.06));
    for (const k of [-1, 1]) {
      const red = new PointLight(0xff2014, 1.8, 6, 2);
      red.position.set(k * 0.62, 0.8, 0.5);
      car.add(red);
      lights.push(red);
    }
    at(car, CAR.side * (STREET.half - 0.95), 0, CAR.z + 1.7, 0, 0.03, 0);
    group.add(car);
  }

  // ---------- clutter: pots, plants, bikes-less doorways ----------
  for (const f of facades.filter((q) => q.kind !== 'parking')) {
    if (!chance(rand, 0.5)) continue;
    const n = Math.floor(range(rand, 2, 6));
    const z0 = range(rand, f.z1 + 0.4, f.z0 - 0.4);
    for (let i = 0; i < n; i += 1) {
      const z = z0 + i * range(rand, 0.35, 0.5);
      const clear = VENDING.every((v) => v.side !== f.side || Math.abs(v.z - z) > v.count * 0.6 + 0.6);
      if (!clear || z > f.z0 || z < f.z1) continue;
      const r = range(rand, 0.14, 0.26); const x = f.xf - f.side * (r + 0.08);
      inst.add('pot', cyl, lib.pot, M(x, r * 0.8, z, 0, r, r * 1.6, r), null, { cast: true });
      inst.add('bush', sphere, lib.leaf, M(x, r * 1.6 + r * 0.7, z, rand() * 3, r * 1.3, r * range(rand, 1, 2.4), r * 1.3), null, { cast: true });
    }
  }

  inst.build(group);

  const update = (t) => {
    for (const a of animated) {
      const f = a.kind === 'lamp' ? flicker.failing(t, a.phase, 9) : flicker[a.kind](t, a.phase, a.period);
      if (a.mat) a.mat.color.copy(a.mat.userData.base).multiplyScalar(f);
      if (a.light) a.light.intensity = a.base * f;
    }
  };

  return { group, lights, update };
};
