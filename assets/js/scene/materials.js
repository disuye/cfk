import {
  CanvasTexture, Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace,
} from '../vendor/three.module.js';
import * as T from './textures.js';

// Two shared temperatures keep the light cohesive: cool fluorescent practicals, warm tungsten interiors.
export const COOL = 7200;
export const WARM = 2900;
export const LAMP = 5200;

// Tanner Helland fit, 1000–40000 K, normalised to full brightness.
export const kelvin = (k) => {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const rgb = [r, g, b].map((v) => Math.min(Math.max(v, 0), 255));
  const peak = Math.max(...rgb);
  return new Color().setRGB(...rgb.map((v) => v / peak), SRGBColorSpace);
};

let ANISO = 4;
export const setAnisotropy = (n) => { ANISO = n; };

export const tex = (canvas, { srgb = true, repeat = true } = {}) => {
  const t = new CanvasTexture(canvas);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = ANISO;
  return t;
};

// Height ("depth map", darker = recessed) → tangent-space normal map.
export const normalFrom = (canvas, strength = 3) => {
  const { width: w, height: h } = canvas;
  const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const [out, ctx] = T.canvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const lum = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = (lum(x - 1, y) - lum(x + 1, y)) * strength;
      const ny = (lum(x, y + 1) - lum(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      d[i] = (nx / len + 1) * 127.5; d[i + 1] = (ny / len + 1) * 127.5; d[i + 2] = (1 / len + 1) * 127.5; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(out, { srgb: false });
};

// Painter set → shared textures. Materials built from it share images, so variants cost no extra memory.
const textureSet = (set, strength) => ({
  map: tex(set.albedo),
  normalMap: normalFrom(set.height, strength),
  roughnessMap: tex(set.rough, { srgb: false }),
});

const surface = (textures, { color = 0xffffff, roughness = 1, metalness = 0, normal = 1, env = 1, side } = {}) => {
  const m = new MeshStandardMaterial({ ...textures, color: new Color(color), roughness, metalness, envMapIntensity: env });
  m.normalScale.set(normal, normal);
  if (side) m.side = side;
  return m;
};

export const glow = (color, intensity = 1, opts = {}) => {
  const m = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), ...opts });
  m.userData.base = m.color.clone();
  return m;
};

// The full material library for the street. `size` = tiling surface texture px (TIERS.surfaces in index.js).
export const createLibrary = (rand, { size = 1024 } = {}) => {
  const half = size / 2;
  const sets = {
    tiles: textureSet(T.tiles(rand, [205, 190, 165], size), 3),
    concrete: textureSet(T.concrete(rand, size), 2.5),
    siding: textureSet(T.siding(rand, size), 2.5),
    render: textureSet(T.render(rand, size), 1.6),
    corrugated: textureSet(T.corrugated(rand, half), 3),
    shutter: textureSet(T.corrugated(rand, half, true), 2.5),
    blocks: textureSet(T.blocks(rand, half), 3),
    roof: textureSet(T.roofTiles(rand, half), 3),
    asphalt: textureSet(T.asphalt(rand, size), 2),
    grate: textureSet(T.grate(rand, 256), 4),
  };

  // Facade variants: texture × tint × gloss. metres = real-world size of one texture repeat.
  const facades = [
    { set: 'tiles', metres: 2.4, color: 0xe8d8bc, roughness: 1 },
    { set: 'tiles', metres: 2.4, color: 0xb98a6a, roughness: 1 },
    { set: 'tiles', metres: 2.4, color: 0x9a9a9e, roughness: 0.9 },
    { set: 'tiles', metres: 2.4, color: 0xd9cfc4, roughness: 0.95 },
    { set: 'concrete', metres: 3.6, color: 0xffffff, roughness: 1 },
    { set: 'concrete', metres: 3.6, color: 0xd8d4cc, roughness: 1 },
    { set: 'siding', metres: 2.4, color: 0xd8d2c8, roughness: 1 },
    { set: 'siding', metres: 2.4, color: 0x8f9aa0, roughness: 1 },
    { set: 'siding', metres: 2.4, color: 0x6f5a4a, roughness: 1 },
    { set: 'render', metres: 3, color: 0xf0e8dc, roughness: 1 },
    { set: 'render', metres: 3, color: 0xc9c2b4, roughness: 1 },
    { set: 'corrugated', metres: 0.76, color: 0x9aa3a8, roughness: 0.8, metalness: 0.45 },
  ].map((f) => ({ ...f, material: surface(sets[f.set], { color: f.color, roughness: f.roughness, metalness: f.metalness ?? 0, normal: 0.8 }) }));

  const interiors = T.interiors(rand).map((c) => tex(c, { repeat: false }));
  const shop = [0, 1, 2].map(() => tex(T.shopInterior(rand), { repeat: false }));
  const signs = T.signAtlas(rand);
  const signTex = tex(signs.canvas, { repeat: false });
  const neon = T.neonAtlas();
  const neonTex = tex(neon.canvas, { repeat: false });
  const skyline = [0, 1, 2].map(() => {
    const s = T.skylineFacade(rand);
    return new MeshStandardMaterial({
      map: tex(s.map), emissiveMap: tex(s.emissive), emissive: new Color(1, 1, 1), emissiveIntensity: 0.9, color: 0x4a4058, roughness: 0.9,
    });
  });

  const lib = {
    sets,
    facades,
    skyline,
    signs: signs.uv,
    neon: neon.uv,
    blocks: surface(sets.blocks, { color: 0xd0ccc4 }),
    roof: surface(sets.roof, { color: 0x8f96a6, roughness: 0.85 }),
    shutter: surface(sets.shutter, { color: 0xb8bcbf, metalness: 0.5, roughness: 0.6, normal: 0.35 }),
    apron: surface(sets.concrete, { color: 0x8a8580, roughness: 0.55, normal: 0.5 }),
    grate: surface(sets.grate, { color: 0xffffff, metalness: 0.7, roughness: 0.55 }),
    trim: new MeshStandardMaterial({ color: 0xcfcac2, roughness: 0.8 }),
    darkTrim: new MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.6, metalness: 0.3 }),
    frame: new MeshStandardMaterial({ color: 0xa8acb0, roughness: 0.35, metalness: 0.85 }),
    frameDark: new MeshStandardMaterial({ color: 0x4a4038, roughness: 0.4, metalness: 0.7 }),
    glass: new MeshPhysicalMaterial({ color: 0x0e1018, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.05 }),
    frosted: new MeshStandardMaterial({ color: 0x9da4b0, roughness: 0.35, metalness: 0, envMapIntensity: 0.8 }),
    parapet: surface(sets.concrete, { color: 0xc8c4bc, roughness: 1, normal: 0.5 }),
    steel: new MeshStandardMaterial({ color: 0x8c9196, roughness: 0.45, metalness: 0.8 }),
    galv: new MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.55, metalness: 0.6 }),
    poleConcrete: surface(sets.render, { color: 0xb4b2ac, roughness: 0.9, normal: 0.6 }),
    wire: new MeshStandardMaterial({ color: 0x141418, roughness: 0.45, metalness: 0.3 }),
    insulator: new MeshStandardMaterial({ color: 0xd8d4ce, roughness: 0.2, metalness: 0 }),
    transformer: new MeshStandardMaterial({ color: 0x8e968f, roughness: 0.5, metalness: 0.5 }),
    rubber: new MeshStandardMaterial({ color: 0x18181a, roughness: 0.8 }),
    leaf: new MeshStandardMaterial({ color: 0x2b3a26, roughness: 0.85 }),
    pot: new MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.7 }),
    orange: new MeshStandardMaterial({ color: 0xf06a1a, roughness: 0.5 }),
    mirror: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 1 }),
    paint: (c, roughness = 0.4, metalness = 0) => new MeshPhysicalMaterial({ color: c, roughness, metalness, clearcoat: 1, clearcoatRoughness: 0.08 }),
    ac: new MeshStandardMaterial({ map: tex(T.acFace(), { repeat: false }), roughness: 0.6, metalness: 0.2 }),
    signsDim: new MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: new Color(1, 1, 1), emissiveIntensity: 0.06, roughness: 0.4 }),
    signsLit: new MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: new Color(1, 1, 1), emissiveIntensity: 0.75, roughness: 0.3 }),
    lantern: new MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: new Color(1, 0.8, 0.7), emissiveIntensity: 1.4, roughness: 0.85 }),
    interiors,
    shop,
    signTex,
    neonTex,
    radial: tex(T.radial(128), { repeat: false, srgb: false }),
    pool: tex(T.radial(128, [[0, 1], [0.3, 0.55], [0.7, 0.12], [1, 0]]), { repeat: false, srgb: false }),
  };
  lib.window = (lit, variant, color) => {
    const m = new MeshBasicMaterial({ map: interiors[variant], color: lit ? new Color(color) : 0x000000, side: DoubleSide });
    return m;
  };
  return lib;
};
