'use strict';

// Film grain over the whole page (scene + DOM). One procedural tile, generated once: no download, no per-frame JS.
// Luminance response comes from the CSS blend (soft-light around mid-grey): strongest in midtones,
// fading to nothing at black and white, like film. Motion: the tile jumps to a random offset every EVERY
// scene frames (event from scene/index.js), so it changes on the same display frame as the 3D scene. No loop.
(() => {
  const el = document.querySelector('[data-is="grain"]');
  if (!el) return;

  const TILE = 256;      // device px per tile edge; animation offsets are 1/8 multiples, so always whole pixels
  const SIGMA = 34;      // grain contrast around mid-grey (0–127); overall strength is --grain-opacity
  const CLUMP = 0.45;    // share of coarser, soft grain (film dye clouds) vs single-pixel noise
  const CHROMA = 0.18;   // per-channel colour grain, relative to the luminance grain
  const EVERY = 10;      // scene frames per grain jump: 10 = 3/s, 15 = 2/s, 20 = 1.5/s at the scene's 30 fps
  const STEP_MS = 1000 / 30;   // fallback clock when the scene doesn't run (low-spec skip, WebGL off)

  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;   // ≈ N(0, 1), bounded

  // Coarse layer: half-res grid, bilinear with wrap, so the tile stays seamless.
  const half = TILE / 2;
  const coarse = Float32Array.from({ length: half * half }, gauss);
  const at = (x, y) => coarse[((y + half) % half) * half + ((x + half) % half)];
  const soft = (x, y) => {
    const fx = x / 2; const fy = y / 2;
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const tx = fx - x0; const ty = fy - y0;
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };

  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(TILE, TILE);
  const px = image.data;
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const luma = gauss() * (1 - CLUMP) + soft(x, y) * CLUMP * 1.6;
      const i = (y * TILE + x) * 4;
      for (let c = 0; c < 3; c += 1) px[i + c] = 128 + SIGMA * (luma + gauss() * CHROMA);
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const root = document.documentElement.style;
  const size = () => root.setProperty('--grain-tile', `${TILE / (devicePixelRatio || 1)}px`);   // 1 tile px = 1 device px
  addEventListener('resize', size, { passive: true });   // zoom / screen change alters DPR
  size();
  // Random 1/8-tile offsets within ±1 tile (whole device px, so never resampled); never the same twice running.
  let cell = 0;
  const move = () => {
    let next;
    do next = Math.floor(Math.random() * 225); while (next === cell);
    cell = next;
    el.style.setProperty('--grain-x', `${(cell % 15 - 7) / 8}`);
    el.style.setProperty('--grain-y', `${(Math.floor(cell / 15) - 7) / 8}`);
  };

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let frames = 0;
    addEventListener('scene:frame', () => { frames += 1; if (frames % EVERY === 0) move(); });
    setInterval(() => { if (!frames) move(); }, EVERY * STEP_MS);
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    root.setProperty('--grain-image', `url(${URL.createObjectURL(blob)})`);
    el.dataset.ready = '';
  });
})();
