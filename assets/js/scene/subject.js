// Subject: clusters of vending machines — the focal light sources of the street.
// Each cluster is a group: machines line up along local z, fronts facing local −x·side, then the group yaws toward camera.
import {
  AdditiveBlending, BoxGeometry, Group, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RectAreaLight,
} from '../vendor/three.module.js';
import { STREET, VENDING } from './layout.js';
import { mesh, at, plate, range, pick } from './parts.js';
import { kelvin, COOL, tex } from './materials.js';
import { vendingFront } from './textures.js';
import { flicker } from './motion.js';

const W = 1.0;     // along the cluster
const H = 1.83;
const D = 0.75;    // depth
const GAP = 0.06;

const BODIES = [
  { body: [238, 238, 234], accent: [30, 110, 220], paint: 0xf0f0ec },
  { body: [200, 30, 38], accent: [255, 200, 40], paint: 0xc8222a },
  { body: [24, 80, 190], accent: [255, 255, 255], paint: 0x1c50be },
  { body: [235, 235, 230], accent: [230, 40, 40], paint: 0xeeeeea },
  { body: [30, 30, 34], accent: [240, 170, 40], paint: 0x1e1e22 },
  { body: [40, 140, 90], accent: [255, 240, 200], paint: 0x288c5a },
];

// Most healthy; one failing per hero cluster plus a couple elsewhere: the flicker that reads from a distance.
const PATTERNS = ['steady', 'steady', 'breathe', 'steady', 'failing', 'steady', 'steady'];

export const vending = (lib, rand, { tier, paint }) => {
  const group = new Group();
  const machines = [];
  const clusters = [];
  const cool = kelvin(COOL);
  const fronts = BODIES.map((b) => {
    const f = vendingFront(rand, { body: b.body, accent: b.accent, hot: rand() * 0.5 });
    return { map: tex(f.map, { repeat: false }), emissive: tex(f.emissive, { repeat: false }), paint: b.paint };
  });
  const bodyMats = new Map();
  const bodyMat = (c) => { if (!bodyMats.has(c)) bodyMats.set(c, paint(c, 0.32)); return bodyMats.get(c); };

  const glassMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 1, transparent: true, opacity: 0.16, depthWrite: false });
  const profile = [[-D / 2, 0.06], [D / 2, 0.06], [D / 2, H], [-D / 2 + 0.05, H], [-D / 2, H - 0.04]];
  const bodyGeo = plate(profile, W, 0.014);
  const faceGeo = new PlaneGeometry(W - 0.04, H - 0.08);
  const glassGeo = new PlaneGeometry(W - 0.12, 0.66);
  const hoodGeo = new BoxGeometry(D + 0.06, 0.05, W + 0.02);
  const plinthGeo = new BoxGeometry(D - 0.04, 0.07, W - 0.04);
  const binGeo = new BoxGeometry(0.4, 0.8, 0.44);
  const poolGeo = new PlaneGeometry(1, 1);
  const rectBudget = { n: tier === 'high' ? 6 : 2 };

  VENDING.forEach((spot, ci) => {
    const s = spot.side;
    const width = spot.count * (W + GAP) - GAP;
    const cg = new Group();
    cg.position.set(s * (STREET.lot + D / 2 + 0.08 + (spot.dx ?? 0)), 0, spot.z);
    cg.rotation.y = s * spot.yaw;
    group.add(cg);
    // front of the machines in local space faces −x·s
    const fx = -s;
    const cluster = { members: [], light: null, pool: null, base: 0 };

    for (let i = 0; i < spot.count; i += 1) {
      const z = width / 2 - W / 2 - i * (W + GAP);
      const look = ci === 0 ? fronts[0] : pick(rand, fronts);
      const body = mesh(bodyGeo, bodyMat(look.paint), { cast: true, receive: true });
      at(body, 0, 0, z, 0, s < 0 ? Math.PI : 0, 0);
      cg.add(body);

      // Front panel: own material so each machine flickers independently.
      const face = new MeshStandardMaterial({
        map: look.map, emissiveMap: look.emissive, emissive: cool.clone(), emissiveIntensity: 1.35, roughness: 0.35, metalness: 0.05,
      });
      const fm = mesh(faceGeo, face, { receive: true });
      fm.userData.dynamic = true;
      at(fm, fx * (D / 2 + 0.022), H / 2 + 0.02, z, 0, fx * Math.PI / 2, 0);
      cg.add(fm);
      cg.add(at(mesh(glassGeo, glassMat), fx * (D / 2 + 0.05), 1.3, z, 0, fx * Math.PI / 2, 0));
      cg.add(at(mesh(hoodGeo, bodyMat(look.paint), { cast: true }), fx * 0.02, H + 0.02, z));
      cg.add(at(mesh(plinthGeo, lib.darkTrim), -fx * 0.02, 0.035, z));

      const kind = spot.hero && i === spot.count - 1 ? 'failing' : PATTERNS[(ci * 3 + i) % PATTERNS.length];
      const m = { face, kind, phase: rand(), period: range(rand, 5, 11), base: 1.35, level: 1 };
      machines.push(m);
      cluster.members.push(m);
    }

    // Recycling bins at the cluster end.
    for (let b = 0; b < (spot.count > 1 ? 2 : 1); b += 1) {
      const bin = mesh(binGeo, b ? lib.paint(0x2050a0, 0.5) : lib.trim, { cast: true });
      at(bin, fx * 0.1, 0.4, -width / 2 - 0.3 - b * 0.46);
      cg.add(bin);
    }

    // Light spill: rect lights on the nearest clusters, an additive pool on every cluster.
    if (rectBudget.n > 0 && spot.z > -48) {
      const light = new RectAreaLight(cool, spot.hero ? 8 : 5.5, width + 0.2, 1.4);
      light.position.set(fx * (D / 2 + 0.05), 1.05, 0);
      light.rotation.y = s * Math.PI / 2;
      cg.add(light);
      cluster.light = light;
      cluster.base = light.intensity;
      rectBudget.n -= 1;
    }
    const poolMat = new MeshBasicMaterial({
      map: lib.pool, color: cool.clone().multiplyScalar(0.12 * Math.exp(-Math.max(0, -spot.z) * 0.01)), blending: AdditiveBlending,
      transparent: true, depthWrite: false, fog: false,
    });
    poolMat.userData.base = poolMat.color.clone();
    const pm = mesh(poolGeo, poolMat, { receive: false });
    pm.scale.set(2.8, width + 1.2, 1);
    pm.userData.dynamic = true;
    pm.renderOrder = 2;
    at(pm, fx * (D / 2 + 1.1), 0.03, 0, -Math.PI / 2, 0, 0);
    cg.add(pm);
    cluster.pool = poolMat;
    clusters.push(cluster);
  });

  const update = (t) => {
    for (const m of machines) {
      m.level = flicker[m.kind](t, m.phase, m.period);
      m.face.emissiveIntensity = m.base * m.level;
    }
    for (const c of clusters) {
      const avg = c.members.reduce((a, m) => a + m.level, 0) / c.members.length;
      if (c.light) c.light.intensity = c.base * avg;
      c.pool.color.copy(c.pool.userData.base).multiplyScalar(avg);
    }
  };

  return { group, update };
};
