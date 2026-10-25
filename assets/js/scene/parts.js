import {
  BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry,
  Matrix4, Mesh, Shape, TubeGeometry, Vector2, Vector3,
} from '../vendor/three.module.js';

// mulberry32: every layout decision goes through this, so every load is identical.
export const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const range = (rand, a, b) => a + (b - a) * rand();
export const pick = (rand, list) => list[Math.floor(rand() * list.length)];
export const chance = (rand, p) => rand() < p;

export const mesh = (geometry, material, { cast = false, receive = true } = {}) => {
  const m = new Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
};

export const at = (obj, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
};

export const block = (w, h, d) => new BoxGeometry(w, h, d);

export const prism = (radius, length, sides = 8, top = radius) => new CylinderGeometry(top, radius, length, sides);

// Extrudes a 2D side profile (array of [x, y]) along z, with a one-segment chamfer that catches a crisp highlight.
export const plate = (profile, depth, chamfer = 0.012) => {
  const shape = new Shape(profile.map(([x, y]) => new Vector2(x, y)));
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - chamfer * 2, bevelEnabled: chamfer > 0, bevelThickness: chamfer, bevelSize: chamfer, bevelSegments: 1, curveSegments: 6,
  });
  geometry.translate(0, 0, -depth / 2 + chamfer);
  return geometry;
};

// Rewrites UVs so textures tile at real-world scale (metres per texture repeat), projected by face normal.
export const worldUV = (geometry, metres = 1, offset = [0, 0]) => {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const [mu, mv] = Array.isArray(metres) ? metres : [metres, metres];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)); const ny = Math.abs(nor.getY(i)); const nz = Math.abs(nor.getZ(i));
    let u; let v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z * Math.sign(nor.getX(i)); v = y; } else { u = -x * Math.sign(nor.getZ(i)); v = y; }
    uv[i * 2] = u / mu + offset[0];
    uv[i * 2 + 1] = v / mv + offset[1];
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return geometry;
};

// Sets the UVs of one box face (by normal axis) to a sub-rectangle of an atlas.
// Remap a geometry's 0–1 UVs into an atlas rect.
export const atlasUV = (geometry, [u0, v0, u1, v1]) => {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true;
  return geometry;
};

// Oblong paper lantern body: open cylinder pinched toward the ends. UV u = 0.5 faces +z; ends close to `neck` × radius.
export const lanternBody = (radius, height, neck = 0.74) => {
  const g = new CylinderGeometry(radius, radius, height, 20, 14, true, Math.PI);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const t = p.getY(i) / (height / 2);
    const k = Math.sqrt(1 - (1 - neck * neck) * t ** 6);
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
};

export const faceUV = (geometry, axis, sign, [u0, v0, u1, v1]) => {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const idx = { x: 0, y: 1, z: 2 }[axis];
  const box = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
  for (let i = 0; i < pos.count; i += 1) {
    const p = new Vector3().fromBufferAttribute(pos, i);
    box.min.min(p); box.max.max(p);
  }
  for (let i = 0; i < pos.count; i += 1) {
    const n = [nor.getX(i), nor.getY(i), nor.getZ(i)];
    if (Math.abs(n[idx] - sign) > 0.01) continue;
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [a, b] = axis === 'x' ? [2, 1] : axis === 'z' ? [0, 1] : [0, 2];
    let s = (p[a] - box.min.getComponent(a)) / (box.max.getComponent(a) - box.min.getComponent(a));
    const t = (p[b] - box.min.getComponent(b)) / (box.max.getComponent(b) - box.min.getComponent(b));
    if ((axis === 'x' && sign > 0) || (axis === 'z' && sign < 0)) s = 1 - s;
    uv.setXY(i, u0 + (u1 - u0) * s, v0 + (v1 - v0) * t);
  }
  uv.needsUpdate = true;
  return geometry;
};

// Catenary-ish sag between two points, as a spline through n samples.
export const sagCurve = (a, b, sag, n = 10) => {
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const p = new Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new CatmullRomCurve3(pts);
};

export const wire = (a, b, sag, radius, segments = 20) => new TubeGeometry(sagCurve(a, b, sag), segments, radius, 4, false);

export const hose = (points, radius, segments = 32) => new TubeGeometry(new CatmullRomCurve3(points), segments, radius, 5, false);

// Concatenates geometries (non-indexed, position/normal/uv only) after baking a matrix into each.
export const merge = (items) => {
  const parts = items.map(({ geometry, matrix }) => {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone());
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  });
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new BufferAttribute(arr, size));
  }
  parts.forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return out;
};

// Merges every static mesh under root by material + shadow flags. Meshes flagged userData.dynamic are left alone.
export const mergeStatic = (root) => {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.dynamic || Array.isArray(o.material)) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, items: [] });
    groups.get(key).items.push({ geometry: o.geometry, matrix: o.matrixWorld.clone() });
    victims.push(o);
  });
  victims.forEach((o) => o.removeFromParent());
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  for (const { material, cast, receive, items } of groups.values()) {
    items.forEach((it) => it.matrix.premultiply(inverse));
    root.add(mesh(merge(items), material, { cast, receive }));
  }
  return groups.size;
};
