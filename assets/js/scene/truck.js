// Kei box truck (aluminium-framed dry van on a kei cab), parked with its tail toward the camera.
// Local frame: rear face of the box at z = 0, cab toward -z, street-centre side at -x.
// Detail is modelled on the faces the camera sees: the rear, the -x side and the top edges.
import { BoxGeometry, CylinderGeometry, Group, MeshStandardMaterial, PlaneGeometry, PointLight } from '../vendor/three.module.js';
import { mesh, at, plate, faceUV } from './parts.js';
import { glow } from './materials.js';

const BOX = { half: 0.74, y0: 0.74, y1: 1.98, length: 2.0 };   // cargo box
const CAB = { z: -2.04, length: 1.31, top: 1.78 };
const WHEEL = { r: 0.29, width: 0.17, x: 0.62, rear: -0.75, front: -2.85 };
const TAIL = { x: 0.58, y: 0.5, intensity: 5, light: 1.4, throw: 0.9 };   // glow strength; point light sits `throw` m behind the lamp

export const keiTruck = (lib) => {
  const group = new Group();
  const lights = [];
  const paint = lib.paint(0xe8e8e4, 0.28);
  const panel = new MeshStandardMaterial({ color: 0xe4e2de, roughness: 0.5 });
  const alu = lib.frame;
  const dark = lib.rubber;
  const amber = new MeshStandardMaterial({ color: 0xc8641a, emissive: 0xc8641a, emissiveIntensity: 0.15, roughness: 0.3 });
  const clear = new MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.15, metalness: 0.2 });
  const reflector = new MeshStandardMaterial({ color: 0x9a1810, emissive: 0x9a1810, emissiveIntensity: 0.4, roughness: 0.3 });
  const tailMat = glow(0xff1a10, TAIL.intensity);

  const add = (geometry, material, x, y, z, { rx = 0, ry = 0, rz = 0, cast = false, dynamic = false } = {}) => {
    const m = mesh(geometry, material, { cast });
    if (dynamic) m.userData.dynamic = true;
    group.add(at(m, x, y, z, rx, ry, rz));
    return m;
  };
  const box = (w, h, d, material, x, y, z, opts) => add(new BoxGeometry(w, h, d), material, x, y, z, opts);
  const bolt = new CylinderGeometry(0.012, 0.012, 0.02, 8);
  const { half, y0, y1, length } = BOX;
  const yc = (y0 + y1) / 2; const bh = y1 - y0;

  // ---------- cargo box: panels + aluminium extrusions on every visible edge ----------
  box(half * 2, bh, length, panel, 0, yc, -length / 2, { cast: true });
  for (const sx of [-1, 1]) {
    box(0.06, bh + 0.04, 0.06, alu, sx * (half - 0.02), yc, 0);              // rear corner posts
    box(0.06, bh + 0.04, 0.06, alu, sx * (half - 0.02), yc, -length);        // front corner posts
    box(0.06, 0.07, length + 0.02, alu, sx * (half - 0.02), y1 - 0.015, -length / 2);   // roof side rails
  }
  for (const z of [0, -length]) box(half * 2 + 0.02, 0.07, 0.06, alu, 0, y1 - 0.015, z);   // roof cross rails
  box(half * 2 + 0.02, 0.05, 0.06, alu, 0, y0 + 0.025, 0);                   // rear sill

  // rear barn doors: centre mullion, door frames, hinges, recessed handles
  const doorH = bh - 0.12;
  box(0.012, doorH, 0.02, dark, 0, yc, 0.006);
  for (const sx of [-1, 1]) {
    box(0.028, doorH, 0.04, alu, sx * 0.024, yc, 0);                          // meeting stiles
    for (const y of [y1 - 0.065, y0 + 0.065]) box(half - 0.09, 0.028, 0.03, alu, sx * half / 2, y, 0.002);
    for (const y of [y1 - 0.26, y0 + 0.24]) {
      box(0.13, 0.055, 0.012, alu, sx * (half - 0.085), y, 0.036);           // hinge leaf
      add(new CylinderGeometry(0.013, 0.013, 0.075, 8), alu, sx * (half + 0.005), y, 0.03);   // hinge knuckle
    }
    const hx = sx * 0.11; const hy = y0 + bh * 0.52;
    box(0.06, 0.16, 0.008, alu, hx, hy, 0.034);
    box(0.034, 0.12, 0.004, dark, hx, hy, 0.039);
    box(0.012, 0.09, 0.012, alu, hx, hy, 0.045);
  }

  // -x side: sliding panels (front one proud), divider, bottom track with bolts, handle + lock
  const sideX = -half;
  box(0.012, doorH, length / 2 - 0.04, panel, sideX - 0.006, yc, -length * 0.75);
  box(0.03, doorH, 0.03, alu, sideX - 0.01, yc, -length / 2 + 0.02);
  box(0.03, doorH, 0.03, alu, sideX - 0.01, yc, -length / 2 - 0.025);
  box(0.07, 0.06, length + 0.02, alu, sideX + 0.01, y0 + 0.03, -length / 2);
  box(0.02, 0.025, length, alu, sideX - 0.03, y0 + 0.005, -length / 2);   // track lip
  for (let z = -0.12; z > -length; z -= 0.3) add(bolt, alu, sideX - 0.04, y0 + 0.03, z, { rz: Math.PI / 2 });
  {
    const hz = -length + 0.17; const hy = y0 + bh * 0.48;
    box(0.008, 0.16, 0.06, alu, sideX - 0.016, hy, hz);
    box(0.004, 0.12, 0.034, dark, sideX - 0.021, hy, hz);
    box(0.012, 0.09, 0.012, alu, sideX - 0.027, hy, hz);
    add(new CylinderGeometry(0.014, 0.014, 0.02, 10), alu, sideX - 0.02, hy + 0.2, hz, { rz: Math.PI / 2 });
  }

  // ---------- bed + rear body (white steel) ----------
  for (const sx of [-1, 1]) box(0.03, 0.12, length, paint, sx * (half - 0.005), y0 - 0.06, -length / 2);   // bed side rails
  for (let z = -0.25; z > -length; z -= 0.55) box(0.02, 0.03, 0.05, alu, sideX - 0.03, y0 - 0.06, z);      // rope hooks
  box(half * 2 - 0.02, 0.07, length + 0.02, dark, 0, y0 - 0.035, -length / 2);   // bed floor: closes the box underside
  box(half * 2, 0.19, 0.1, paint, 0, y0 - 0.095, -0.03, { cast: true });     // rear crossmember, up to the box sill
  for (const sx of [-1, 1]) {
    box(0.34, 0.2, 0.1, paint, sx * 0.57, 0.465, -0.03, { cast: true });      // lamp lobes
    box(0.23, 0.15, 0.02, dark, sx * TAIL.x, 0.48, 0.022);                     // lamp bezel
    box(0.2, 0.085, 0.03, tailMat, sx * TAIL.x, TAIL.y, 0.028, { dynamic: true });
    box(0.2, 0.04, 0.03, amber, sx * TAIL.x, 0.435, 0.028);
    for (const y of [0.66, 0.4]) add(new CylinderGeometry(0.025, 0.025, 0.03, 10), dark, sx * (half - 0.05), y, 0.03, { rx: Math.PI / 2 });   // rubber stops
    box(0.18, 0.26, 0.01, dark, sx * WHEEL.x, 0.3, WHEEL.rear + 0.36);       // mud flaps
  }
  box(0.09, 0.05, 0.02, clear, -0.24, 0.65, 0.025);                           // reverse lamp
  add(new CylinderGeometry(0.022, 0.022, 0.015, 12), clear, -0.38, 0.65, 0.025, { rx: Math.PI / 2 });
  box(0.1, 0.025, 0.012, reflector, 0.3, 0.6, 0.025);
  // licence plate on a white hanger bracket below the crossmember
  box(0.38, 0.24, 0.012, paint, 0, 0.44, -0.002);
  const plateGeo = new BoxGeometry(0.33, 0.165, 0.01);
  faceUV(plateGeo, 'z', 1, lib.signs.plate);
  add(plateGeo, lib.signsDim, 0, 0.44, 0.01);
  for (const sx of [-1, 1]) box(0.03, 0.08, 0.04, dark, sx * 0.12, 0.555, -0.02);
  box(half * 2 - 0.3, 0.35, 3.2, dark, 0, 0.4, -1.65);                       // chassis / underbody

  // ---------- cab ----------
  const { z: cz, length: cl, top } = CAB;
  const profile = [[0, 0.35], [cl, 0.35], [cl, 1.05], [cl - 0.05, 1.25], [cl - 0.19, top - 0.06], [cl - 0.3, top], [0, top]];
  add(plate(profile, half * 2 - 0.02, 0.05), paint, 0, 0, cz, { ry: Math.PI / 2, cast: true });
  for (const sx of [-1, 1]) {
    const xs = sx * (half - 0.01);
    box(0.004, 0.56, 0.82, dark, xs + sx * 0.001, 1.42, cz - 0.52);           // window surround
    add(new PlaneGeometry(0.78, 0.5), lib.glass, xs + sx * 0.004, 1.42, cz - 0.52, { ry: sx * Math.PI / 2 });
  }
  for (const z of [cz - 0.08, cz - 0.98]) box(0.006, 0.66, 0.006, dark, -half + 0.008, 0.72, z);   // door seams
  box(0.012, 0.03, 0.12, dark, -half + 0.005, 1.02, cz - 0.2);                // door handle
  box(0.12, 0.02, 0.02, dark, -half - 0.05, 1.3, cz - 1.0);                   // mirror arm
  box(0.03, 0.2, 0.13, dark, -half - 0.11, 1.33, cz - 1.0);                   // mirror head

  // ---------- wheels: black tyre, painted steel disc ----------
  for (const sx of [-1, 1]) {
    for (const z of [WHEEL.rear, WHEEL.front]) {
      add(new CylinderGeometry(WHEEL.r, WHEEL.r, WHEEL.width, 18), lib.rubber, sx * WHEEL.x, WHEEL.r, z, { rz: Math.PI / 2, cast: true });
      add(new CylinderGeometry(0.17, 0.17, 0.01, 16), lib.galv, sx * (WHEEL.x + WHEEL.width / 2), WHEEL.r, z, { rz: Math.PI / 2 });
      add(new CylinderGeometry(0.05, 0.05, 0.02, 10), alu, sx * (WHEEL.x + WHEEL.width / 2 + 0.01), WHEEL.r, z, { rz: Math.PI / 2 });
    }
  }

  // ---------- tail lights stay on ----------
  for (const sx of [-1, 1]) {
    const red = new PointLight(0xff2014, TAIL.light, 6, 2);
    red.position.set(sx * TAIL.x, TAIL.y, TAIL.throw);
    group.add(red);
    lights.push(red);
  }
  return { group, lights };
};
