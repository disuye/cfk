// The environment shell: wet road + markings, gutters, dusk sky, lighting rig. Assembles every module.
import {
  BackSide, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, Vector3,
} from '../vendor/three.module.js';
import { STREET, VENDING, POLES } from './layout.js';
import { mesh, at, worldUV, mergeStatic } from './parts.js';
import { createLibrary, tex, glow } from './materials.js';
import { roadMask, sky as paintSky, JP } from './textures.js';
import { buildings, TEE } from './buildings.js';
import { vending } from './subject.js';
import { dressing } from './dressing.js';
import { wetRoad } from './reflect.js';
import { flicker } from './motion.js';

export const LIGHTING = {
  hemi: { sky: 0xb890d8, ground: 0x24182e, intensity: 0.5 },
};
export const SKY = { radius: 130, gain: 1.25 };
const PPM = 40;   // road mask pixels per metre
const GROUND = { width: 140, beyond: 60 };   // under-everything ground plane
export const WET = { strength: 0.42 };   // road reflectivity: 1 = full mirror strength, lower = drier

// Road paint: edge lines, the stop line and 止まれ before the junction.
const paintMarks = (x, { W, H, ppm }) => {
  const zy = (z) => H - (STREET.near - z) * ppm;
  const xx = (wx) => (wx + STREET.half) * ppm;
  x.fillStyle = 'rgb(255 0 0)';
  const { z1 } = STREET.junction;
  for (const side of [-1, 1]) {
    const cx = xx(side * (STREET.half - 0.3));
    x.fillRect(cx - 0.075 * ppm, zy(STREET.stopLine), 0.15 * ppm, zy(STREET.near) - zy(STREET.stopLine));
    x.fillRect(cx - 0.075 * ppm, zy(STREET.far), 0.15 * ppm, zy(z1 - 0.5) - zy(STREET.far));
  }
  x.fillRect(0.3 * ppm, zy(STREET.stopLine) - 0.45 * ppm, W - 0.6 * ppm, 0.45 * ppm);
  // elongated lettering: read from the approaching side, first character farthest
  x.save();
  x.font = `800 ${Math.round(1.1 * ppm)}px ${JP}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  [...'止まれ'].forEach((ch, i) => {
    x.save();
    x.translate(xx(0), zy(STREET.stopLine + 2.4 + i * 2.6));
    x.scale(1.25, 2.4);
    x.fillText(ch, 0, 0);
    x.restore();
  });
  x.restore();
  // a few faded, worn patches
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i += 1) {
    x.fillStyle = `rgb(0 0 0 / ${0.2 + (i % 5) * 0.08})`;
    x.fillRect((i * 37) % W, (i * 977) % H, 6 + (i % 7) * 3, 6 + (i % 4) * 5);
  }
  x.globalCompositeOperation = 'source-over';
};

export const buildSet = ({ rand, tier, mirror, taps, surfaces }) => {
  const root = new Group();
  const lib = createLibrary(rand, { size: surfaces });

  // ---------- sky (follows the camera, so it is never clipped) ----------
  const skyMat = new MeshBasicMaterial({ map: tex(paintSky(rand), { repeat: false }), side: BackSide, fog: false, depthWrite: false });
  skyMat.color.setScalar(SKY.gain);
  const sky = new Mesh(new SphereGeometry(SKY.radius, 48, 24), skyMat);
  sky.renderOrder = -1;
  sky.userData.sky = true;   // hidden by the ?debug&holes check
  root.add(sky);

  // ---------- wet road ----------
  const length = STREET.near - STREET.far;
  const mask = tex(roadMask(rand, { width: STREET.half * 2, length, ppm: PPM, marks: paintMarks }), { srgb: false, repeat: false });
  const roadMat = new MeshStandardMaterial({ ...lib.sets.asphalt, roughness: 1, metalness: 0, envMapIntensity: 0.25 });
  roadMat.normalScale.set(0.6, 0.6);
  wetRoad(roadMat, mirror, { mask, rect: [-STREET.half, STREET.near, STREET.half * 2, length], taps, strength: WET.strength });
  const roadGeo = new PlaneGeometry(STREET.half * 2, length);
  roadGeo.rotateX(-Math.PI / 2);
  worldUV(roadGeo, 4);
  const road = mesh(roadGeo, roadMat);
  at(road, 0, 0, (STREET.near + STREET.far) / 2);
  road.userData.dynamic = true;
  root.add(road);

  const { z0, z1 } = STREET.junction;
  // cross street: two arms either side of the main road, so nothing overlaps the intersection
  const cross = new Group();
  for (const s of [-1, 1]) {
    const g = new PlaneGeometry(45 - STREET.half, z0 - z1);
    g.rotateX(-Math.PI / 2);
    worldUV(g, 4);
    cross.add(at(mesh(g, roadMat), s * (STREET.half + (45 - STREET.half) / 2), 0, (z0 + z1) / 2));
  }
  cross.userData.dynamic = true;
  cross.children.forEach((m) => { m.userData.dynamic = true; });
  root.add(cross);

  const b = buildings(lib, rand, { tier });
  const { tee } = b;

  // road on past the mask's far edge to the T, then the T's cross street
  const extGeo = new PlaneGeometry(STREET.half * 2, STREET.far - tee.z0);
  extGeo.rotateX(-Math.PI / 2);
  worldUV(extGeo, 4);
  cross.add(at(mesh(extGeo, roadMat), 0, 0, (STREET.far + tee.z0) / 2));
  const teeGeo = new PlaneGeometry(2 * (TEE.span + 6), tee.z0 - tee.z1);
  teeGeo.rotateX(-Math.PI / 2);
  worldUV(teeGeo, 4);
  cross.add(at(mesh(teeGeo, roadMat), 0, 0, (tee.z0 + tee.z1) / 2));
  cross.children.forEach((m) => { m.userData.dynamic = true; });

  // grated side channels (2 cm wider on the road side, lifted, so the road edge has no seam)
  for (const s of [-1, 1]) {
    for (const [a, c] of [[STREET.near, z0], [z1, tee.z0]]) {
      const g = new PlaneGeometry(STREET.gutter + 0.02, a - c);
      g.rotateX(-Math.PI / 2);
      worldUV(g, 0.5, [0.5, 0]);
      root.add(at(mesh(g, lib.grate), s * (STREET.half + STREET.gutter / 2 - 0.01), 0.008, (a + c) / 2));
    }
  }

  // ground under the whole set: yards, lots and gaps never show the sky
  const groundGeo = new PlaneGeometry(GROUND.width, STREET.near - tee.z1 + GROUND.beyond);
  groundGeo.rotateX(-Math.PI / 2);
  worldUV(groundGeo, 3.6);
  root.add(at(mesh(groundGeo, lib.apron), 0, -0.02, (STREET.near + tee.z1 - GROUND.beyond) / 2));

  // ---------- light rig ----------
  const hemi = new HemisphereLight(LIGHTING.hemi.sky, LIGHTING.hemi.ground, LIGHTING.hemi.intensity);
  root.add(hemi);

  const v = vending(lib, rand, { tier, paint: lib.paint });
  const d = dressing(lib, rand, { tier, facades: b.facades });
  root.add(b.group, v.group, d.group);

  // aviation beacons on the far towers
  const beaconMat = glow(0xff2a1a, 8, { fog: false });
  const beaconGeo = new SphereGeometry(0.6, 8, 6);
  for (const p of b.beacons) root.add(at(new Mesh(beaconGeo, beaconMat), p.x, p.y, p.z));

  mergeStatic(b.group);
  mergeStatic(v.group);
  mergeStatic(d.group);

  const hotspots = [
    ...POLES.filter((p) => p.lamp).map((p) => new Vector3(p.side * 1.5, 6, p.z)),
    ...VENDING.map((s) => new Vector3(s.side * 3, 2.2, s.z)),
  ];

  const update = (t) => {
    v.update(t);
    d.update(t);
    beaconMat.color.copy(beaconMat.userData.base).multiplyScalar(0.05 + flicker.beacon(t));
  };

  return { root, sky, road, cross, lib, hotspots, update };
};
