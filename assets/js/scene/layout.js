import { Vector3 } from '../vendor/three.module.js';

// Scene composition in one place. Metres. The street runs down −z; side −1 = left, +1 = right.
export const STREET = {
  half: 3.6,          // asphalt half-width
  gutter: 0.42,       // grated side channel
  lot: 4.02,          // property line (|x|)
  near: 22,
  far: -132,
  junction: { z0: -33.5, z1: -39 },
  stopLine: -32.6,
};

// Vending clusters. yaw (radians) turns the fronts toward the camera; setback clears the building behind.
export const VENDING = [
  { side: 1, z: 6.3, count: 1, yaw: 0.25, setback: 1.2 },
  { side: -1, z: -3.6, count: 2, yaw: 0.32, setback: 1.6 },
  { side: 1, z: -10.4, count: 3, yaw: 0.42, setback: 2.6, hero: true },
  { side: -1, z: -22.2, count: 1, yaw: 0.2, setback: 1.0 },
  { side: 1, z: -27.6, count: 2, yaw: 0.15, setback: 1.2 },
  { side: -1, z: -40.6, count: 3, yaw: Math.PI / 2, dx: 2.4, setback: 0 },
  { side: 1, z: -46, count: 2, yaw: 0.3, setback: 1.6 },
  { side: -1, z: -58, count: 2, yaw: 0.2, setback: 1.2 },
  { side: 1, z: -71, count: 3, yaw: 0.25, setback: 1.6 },
];

export const SUBJECT = new Vector3(4.6, 1.15, -10.4);

export const POLES = [
  { side: 1, z: 8.7, height: 12.5 },
  { side: -1, z: 1.2, height: 12, lamp: true },
  { side: 1, z: -15.4, height: 12.5, lamp: true, transformer: true },
  { side: -1, z: -24.5, height: 13, lamp: true },
  { side: 1, z: -31.8, height: 12, lamp: true, mirror: true },
  { side: -1, z: -42.6, height: 12.5, transformer: true },
  { side: 1, z: -49.5, height: 13, lamp: true },
  { side: -1, z: -60, height: 12, lamp: true },
  { side: 1, z: -70, height: 12.5, lamp: true },
  { side: -1, z: -82, height: 12 },
  { side: 1, z: -94, height: 12.5, lamp: true },
  { side: -1, z: -108, height: 12 },
  { side: 1, z: -122, height: 12.5 },
];

export const CAR = { side: 1, z: -18.6 };
export const PARKING = [
  { side: -1, z0: -11.6, z1: -19.4 },
  { side: 1, z0: -53.5, z1: -61 },
];

// Lot kinds by distance: lower, more open near the camera so the dusk sky reads.
export const LOT_WEIGHTS = (z) => (z > -30
  ? { house: 0.42, mansion: 0.12, shop: 0.3, garden: 0.16 }
  : { house: 0.3, mansion: 0.3, shop: 0.3, garden: 0.1 });

// Minimum setback for a lot overlapping a vending cluster.
export const reserved = (side, z0, z1) => VENDING
  .filter((v) => v.side === side && !v.dx && v.z + v.count * 0.7 > z1 && v.z - v.count * 0.7 < z0)
  .reduce((m, v) => Math.max(m, v.setback), 0);
