// Canvas painters. Everything is drawn once at boot: no image downloads.
// Each material painter returns { albedo, height, rough } canvases; materials.js turns them into textures.
import { range, pick, chance } from './parts.js';

export const JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic", sans-serif';
export const LATIN = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export const canvas = (w, h = w) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
};

const rgb = (r, g, b, a = 1) => `rgb(${r | 0} ${g | 0} ${b | 0} / ${a})`;
const grey = (v, a = 1) => rgb(v, v, v, a);
const jitter = (rand, [r, g, b], amt) => {
  const k = 1 + (rand() - 0.5) * amt;
  return [r * k, g * k, b * k];
};

// Seamless value noise: random cells, tiled 3×3, bilinear upscaled, centre cropped.
export const noise = (size, cells, rand, h = size, cellsY = cells) => {
  const [s, sx] = canvas(cells, cellsY);
  const img = sx.createImageData(cells, cellsY);
  for (let i = 0; i < cells * cellsY; i += 1) {
    const v = rand() * 255;
    img.data.set([v, v, v, 255], i * 4);
  }
  sx.putImageData(img, 0, 0);
  const [t, tx] = canvas(cells * 3, cellsY * 3);
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) tx.drawImage(s, x * cells, y * cellsY);
  const [o, ox] = canvas(size, h);
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(t, -size, -h, size * 3, h * 3);
  return o;
};

// Fractal noise on a mid-grey base.
export const fbm = (size, rand, octaves = [[4, 0.6], [8, 0.4], [16, 0.3], [48, 0.2], [128, 0.12]], h = size) => {
  const [c, x] = canvas(size, h);
  x.fillStyle = grey(128);
  x.fillRect(0, 0, size, h);
  x.globalCompositeOperation = 'overlay';
  for (const [cells, alpha] of octaves) {
    x.globalAlpha = alpha;
    x.drawImage(noise(size, cells, rand, h, Math.max(1, Math.round(cells * h / size))), 0, 0);
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  return c;
};

const speckle = (ctx, rand, w, h, count, [lo, hi], size = [1, 2], alpha = 1) => {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = grey(range(rand, lo, hi), alpha);
    const s = range(rand, size[0], size[1]);
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
};

// Vertical grime: dark streaks running down from sills and parapets.
const streaks = (ctx, rand, w, h, count, alpha = 0.18, colour = [40, 36, 32]) => {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * w;
    const y = rand() * h * 0.9;
    const len = range(rand, h * 0.1, h * 0.6);
    const sw = range(rand, 3, 26);
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, rgb(...colour, alpha * range(rand, 0.4, 1)));
    g.addColorStop(1, rgb(...colour, 0));
    ctx.fillStyle = g;
    for (const dx of [0, -w, w]) ctx.fillRect(x + dx, y, sw, len);
  }
};

const crack = (ctx, rand, x, y, steps, len = 6) => {
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rand() * Math.PI * 2;
  for (let i = 0; i < steps; i += 1) {
    a += (rand() - 0.5) * 1.2;
    x += Math.cos(a) * len; y += Math.sin(a) * len;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
};

const set3 = (w, h = w) => {
  const [albedo, a] = canvas(w, h);
  const [height, hgt] = canvas(w, h);
  const [rough, r] = canvas(w, h);
  return { albedo, height, rough, a, h: hgt, r, w, hh: h };
};

const overlay = (ctx, src, op, alpha) => {
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = alpha;
  ctx.drawImage(src, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};

// 二丁掛 facing tiles (227 × 60 mm + joint), staggered. 1024 px ≈ 2.4 m.
export const tiles = (rand, base = [196, 178, 150], size = 1024) => {
  const t = set3(size);
  const cols = 10; const rows = 34;
  const tw = size / cols; const th = size / rows; const joint = 3;
  t.a.fillStyle = rgb(...base.map((v) => v * 0.78)); t.a.fillRect(0, 0, size, size);
  t.h.fillStyle = grey(70); t.h.fillRect(0, 0, size, size);
  t.r.fillStyle = grey(235); t.r.fillRect(0, 0, size, size);
  for (let row = 0; row < rows; row += 1) {
    const off = (row % 2) * tw / 2;
    for (let col = -1; col < cols; col += 1) {
      const x = col * tw + off + joint / 2; const y = row * th + joint / 2;
      t.a.fillStyle = rgb(...jitter(rand, base, 0.22));
      t.a.fillRect(x, y, tw - joint, th - joint);
      t.h.fillStyle = grey(range(rand, 190, 215));
      t.h.fillRect(x, y, tw - joint, th - joint);
      t.r.fillStyle = grey(range(rand, 120, 165));
      t.r.fillRect(x, y, tw - joint, th - joint);
    }
  }
  speckle(t.a, rand, size, size, 9000, [60, 210], [1, 2], 0.12);
  speckle(t.h, rand, size, size, 6000, [150, 230], [1, 2], 0.5);
  overlay(t.a, fbm(size, rand), 'multiply', 0.35);
  streaks(t.a, rand, size, size, 30, 0.2);
  return t;
};

// 打ち放し exposed concrete: 1800 × 900 form panels with tie holes. 1024 px ≈ 3.6 m.
export const concrete = (rand, size = 1024) => {
  const t = set3(size);
  const pw = size / 2; const ph = size / 4;
  t.a.fillStyle = rgb(160, 158, 152); t.a.fillRect(0, 0, size, size);
  t.h.fillStyle = grey(180); t.h.fillRect(0, 0, size, size);
  t.r.fillStyle = grey(225); t.r.fillRect(0, 0, size, size);
  for (let py = 0; py < 4; py += 1) {
    for (let px = 0; px < 2; px += 1) {
      const v = range(rand, -14, 14);
      t.a.fillStyle = rgb(160 + v, 158 + v, 152 + v * 0.8);
      t.a.fillRect(px * pw, py * ph, pw, ph);
    }
  }
  overlay(t.a, fbm(size, rand), 'overlay', 0.55);
  overlay(t.h, fbm(size, rand, [[32, 0.4], [128, 0.3]]), 'overlay', 0.5);
  t.a.strokeStyle = grey(95, 0.7); t.h.strokeStyle = grey(60); t.a.lineWidth = 2; t.h.lineWidth = 2;
  for (let py = 0; py <= 4; py += 1) for (const c of [t.a, t.h]) { c.beginPath(); c.moveTo(0, py * ph); c.lineTo(size, py * ph); c.stroke(); }
  for (let px = 0; px <= 2; px += 1) for (const c of [t.a, t.h]) { c.beginPath(); c.moveTo(px * pw, 0); c.lineTo(px * pw, size); c.stroke(); }
  for (let py = 0; py < 4; py += 1) {
    for (let px = 0; px < 2; px += 1) {
      for (const fx of [0.17, 0.5, 0.83]) {
        for (const fy of [0.25, 0.75]) {
          const x = px * pw + fx * pw; const y = py * ph + fy * ph;
          t.a.fillStyle = grey(70); t.a.beginPath(); t.a.arc(x, y, 6, 0, 7); t.a.fill();
          t.h.fillStyle = grey(20); t.h.beginPath(); t.h.arc(x, y, 6, 0, 7); t.h.fill();
          t.a.fillStyle = rgb(80, 60, 40, 0.18); t.a.fillRect(x - 3, y, 6, range(rand, 20, 90));
        }
      }
    }
  }
  streaks(t.a, rand, size, size, 45, 0.22);
  speckle(t.a, rand, size, size, 5000, [40, 120], [1, 3], 0.25);
  return t;
};

// ALC / fibre-cement siding, 600 mm horizontal panels. 1024 px ≈ 2.4 m.
export const siding = (rand, size = 1024) => {
  const t = set3(size);
  const ph = size / 4;
  t.a.fillStyle = grey(225); t.a.fillRect(0, 0, size, size);
  t.h.fillStyle = grey(190); t.h.fillRect(0, 0, size, size);
  t.r.fillStyle = grey(210); t.r.fillRect(0, 0, size, size);
  for (let i = 0; i < 4; i += 1) {
    const y = i * ph;
    for (let k = 1; k < 6; k += 1) {
      t.h.fillStyle = grey(165); t.h.fillRect(0, y + k * ph / 6, size, 2);
    }
    t.a.fillStyle = grey(120, 0.8); t.a.fillRect(0, y, size, 5);
    t.h.fillStyle = grey(40); t.h.fillRect(0, y, size, 6);
    t.a.fillStyle = grey(255, 0.5); t.a.fillRect(0, y + 6, size, 2);
  }
  overlay(t.a, fbm(size, rand), 'multiply', 0.25);
  streaks(t.a, rand, size, size, 26, 0.15);
  return t;
};

// Corrugated steel sheet, vertical ribs. 512 px ≈ 0.76 m.
export const corrugated = (rand, size = 512, horizontal = false) => {
  const t = set3(size);
  const period = 32;
  for (let i = 0; i < size; i += 1) {
    const s = 0.5 + 0.5 * Math.sin((i / period) * Math.PI * 2);
    const draw = (ctx, v) => {
      ctx.fillStyle = grey(v);
      if (horizontal) ctx.fillRect(0, i, size, 1); else ctx.fillRect(i, 0, 1, size);
    };
    draw(t.a, 150 + s * 70);
    draw(t.h, 40 + s * 200);
    draw(t.r, 150 - s * 40);
  }
  overlay(t.a, fbm(size, rand), 'multiply', 0.3);
  streaks(t.a, rand, size, size, 22, 0.35, [110, 60, 30]);
  return t;
};

// Mortar render / stucco with hairline cracks. 1024 px ≈ 3 m.
export const render = (rand, size = 1024) => {
  const t = set3(size);
  t.a.fillStyle = grey(205); t.a.fillRect(0, 0, size, size);
  t.h.fillStyle = grey(128); t.h.fillRect(0, 0, size, size);
  t.r.fillStyle = grey(240); t.r.fillRect(0, 0, size, size);
  overlay(t.a, fbm(size, rand), 'overlay', 0.5);
  overlay(t.h, fbm(size, rand, [[64, 0.5], [256, 0.5]]), 'overlay', 0.9);
  speckle(t.h, rand, size, size, 16000, [60, 220], [1, 2], 0.6);
  t.a.strokeStyle = grey(90, 0.55); t.h.strokeStyle = grey(30); t.a.lineWidth = 1.2; t.h.lineWidth = 1.5;
  for (let i = 0; i < 7; i += 1) {
    const x = rand() * size; const y = rand() * size; const steps = 10 + rand() * 30;
    const seed = rand() * 1e6;
    for (const c of [t.a, t.h]) {
      let s = seed;
      const local = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      crack(c, local, x, y, steps);
    }
  }
  streaks(t.a, rand, size, size, 30, 0.2);
  return t;
};

// Concrete block wall, 390 × 190 mm. 512 px ≈ 1.6 m.
export const blocks = (rand, size = 512) => {
  const t = set3(size);
  const bw = size / 4; const bh = size / 8; const j = 3;
  t.a.fillStyle = grey(120); t.a.fillRect(0, 0, size, size);
  t.h.fillStyle = grey(50); t.h.fillRect(0, 0, size, size);
  t.r.fillStyle = grey(240); t.r.fillRect(0, 0, size, size);
  for (let row = 0; row < 8; row += 1) {
    for (let col = -1; col < 4; col += 1) {
      const x = col * bw + (row % 2) * bw / 2;
      const v = range(rand, 138, 170);
      t.a.fillStyle = rgb(v, v * 0.99, v * 0.95);
      t.a.fillRect(x + j, row * bh + j, bw - j * 2, bh - j * 2);
      t.h.fillStyle = grey(200);
      t.h.fillRect(x + j, row * bh + j, bw - j * 2, bh - j * 2);
    }
  }
  overlay(t.a, fbm(size, rand), 'multiply', 0.4);
  speckle(t.h, rand, size, size, 9000, [120, 255], [1, 2], 0.5);
  const g = t.a.createLinearGradient(0, size * 0.6, 0, size);
  g.addColorStop(0, rgb(40, 50, 30, 0)); g.addColorStop(1, rgb(40, 50, 30, 0.35));
  t.a.fillStyle = g; t.a.fillRect(0, 0, size, size);
  streaks(t.a, rand, size, size, 14, 0.25);
  return t;
};

// Kawara roof tiles: curved rows. 512 px ≈ 1.2 m.
export const roofTiles = (rand, size = 512) => {
  const t = set3(size);
  const period = 40; const rows = 12;
  for (let x = 0; x < size; x += 1) {
    const s = 0.5 + 0.5 * Math.cos((x / period) * Math.PI * 2);
    t.a.fillStyle = rgb(62 + s * 40, 68 + s * 42, 80 + s * 44); t.a.fillRect(x, 0, 1, size);
    t.h.fillStyle = grey(60 + s * 160); t.h.fillRect(x, 0, 1, size);
  }
  for (let r = 0; r < rows; r += 1) {
    const y = r * size / rows;
    const g = t.h.createLinearGradient(0, y, 0, y + size / rows);
    g.addColorStop(0, grey(0, 0.6)); g.addColorStop(0.15, grey(0, 0)); g.addColorStop(1, grey(255, 0.15));
    t.h.fillStyle = g; t.h.fillRect(0, y, size, size / rows);
    t.a.fillStyle = grey(20, 0.5); t.a.fillRect(0, y, size, 3);
  }
  t.r.fillStyle = grey(140); t.r.fillRect(0, 0, size, size);
  overlay(t.a, fbm(size, rand), 'multiply', 0.3);
  return t;
};

// Wet asphalt: aggregate, patch repairs, sealed cracks. 1024 px ≈ 4 m.
export const asphalt = (rand, size = 1024) => {
  const t = set3(size);
  t.a.fillStyle = rgb(58, 57, 60); t.a.fillRect(0, 0, size, size);
  t.h.fillStyle = grey(128); t.h.fillRect(0, 0, size, size);
  t.r.fillStyle = grey(115); t.r.fillRect(0, 0, size, size);
  overlay(t.a, fbm(size, rand), 'overlay', 0.35);
  for (let i = 0; i < 5; i += 1) {
    const x = rand() * size; const y = rand() * size; const w = range(rand, 80, 360); const h = range(rand, 60, 260);
    t.a.fillStyle = rgb(40, 40, 43, 0.7); t.a.fillRect(x, y, w, h);
    t.r.fillStyle = grey(70, 0.8); t.r.fillRect(x, y, w, h);
    t.h.strokeStyle = grey(60); t.h.lineWidth = 2; t.h.strokeRect(x, y, w, h);
  }
  speckle(t.a, rand, size, size, 60000, [30, 150], [1, 2.5], 0.55);
  speckle(t.h, rand, size, size, 50000, [60, 255], [1, 3], 0.7);
  speckle(t.r, rand, size, size, 20000, [60, 180], [1, 3], 0.5);
  t.a.strokeStyle = rgb(18, 18, 20, 0.9); t.r.strokeStyle = grey(25); t.h.strokeStyle = grey(70);
  for (let i = 0; i < 9; i += 1) {
    const x = rand() * size; const y = rand() * size; const steps = 20 + rand() * 50; const lw = range(rand, 2, 6);
    const seed = rand() * 1e6;
    for (const c of [t.a, t.r, t.h]) {
      c.lineWidth = lw;
      let s = seed;
      const local = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      crack(c, local, x, y, steps, 9);
    }
  }
  return t;
};

// Steel gutter grating. 256 px ≈ 0.5 m.
export const grate = (rand, size = 256) => {
  const t = set3(size);
  t.a.fillStyle = grey(14); t.a.fillRect(0, 0, size, size);
  t.h.fillStyle = grey(0); t.h.fillRect(0, 0, size, size);
  t.r.fillStyle = grey(200); t.r.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 16) {
    t.a.fillStyle = grey(78); t.a.fillRect(x, 0, 6, size);
    t.h.fillStyle = grey(255); t.h.fillRect(x, 0, 6, size);
    t.r.fillStyle = grey(110); t.r.fillRect(x, 0, 6, size);
  }
  for (let y = 0; y < size; y += 64) {
    t.a.fillStyle = grey(70); t.a.fillRect(0, y, size, 4);
    t.h.fillStyle = grey(220); t.h.fillRect(0, y, size, 4);
  }
  overlay(t.a, fbm(size, rand), 'multiply', 0.5);
  streaks(t.a, rand, size, size, 10, 0.4, [120, 70, 35]);
  return t;
};

// Road markings + puddle mask over the whole road. R = paint, G = puddle. px per metre fixed by caller.
export const roadMask = (rand, { width, length, ppm, marks }) => {
  const W = Math.round(width * ppm); const H = Math.round(length * ppm);
  const [c, x] = canvas(W, H);
  x.fillStyle = 'rgb(0 0 0)'; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < length * 1.6; i += 1) {
    const px = range(rand, 0.1, 0.9) * W; const py = rand() * H;
    const r = range(rand, 0.3, 1.8) * ppm;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgb(0 200 0)'); g.addColorStop(0.55, 'rgb(0 120 0)'); g.addColorStop(1, 'rgb(0 0 0)');
    x.fillStyle = g;
    x.save(); x.translate(px, py); x.scale(1, range(rand, 1.2, 3)); x.translate(-px, -py);
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); x.restore();
  }
  // wetter along the gutters, where water collects
  for (const side of [0, 1]) {
    const g = x.createLinearGradient(side ? W : 0, 0, side ? W - 0.9 * ppm : 0.9 * ppm, 0);
    g.addColorStop(0, 'rgb(0 140 0)'); g.addColorStop(1, 'rgb(0 0 0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  x.globalCompositeOperation = 'source-over';
  marks(x, { W, H, ppm });
  return c;
};

// Window interiors: curtains, blinds, bare room, frosted. Grey so instance colour tints them.
export const interiors = (rand) => {
  const out = [];
  const S = 128;
  {
    const [c, x] = canvas(S);
    for (let i = 0; i < S; i += 1) {
      const s = 0.5 + 0.5 * Math.sin(i * 0.55 + Math.sin(i * 0.13) * 2);
      x.fillStyle = grey(140 + s * 115); x.fillRect(i, 0, 1, S);
    }
    const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, grey(0, 0.25)); g.addColorStop(0.4, grey(0, 0)); g.addColorStop(1, grey(0, 0.35));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.fillStyle = grey(30, 0.8); x.fillRect(S * 0.48, 0, S * 0.04, S);
    out.push(c);
  }
  {
    const [c, x] = canvas(S);
    x.fillStyle = grey(240); x.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 6) { x.fillStyle = grey(150); x.fillRect(0, y, S, 2); }
    const g = x.createRadialGradient(S * 0.3, S * 0.2, 0, S * 0.3, S * 0.2, S); g.addColorStop(0, grey(255, 0)); g.addColorStop(1, grey(0, 0.45));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    out.push(c);
  }
  {
    const [c, x] = canvas(S);
    const g = x.createRadialGradient(S * 0.5, S * 0.05, 0, S * 0.5, S * 0.3, S * 0.9);
    g.addColorStop(0, grey(255)); g.addColorStop(0.5, grey(150)); g.addColorStop(1, grey(40));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.fillStyle = grey(25, 0.85);
    x.fillRect(S * 0.08, S * 0.55, S * 0.3, S * 0.45);
    x.fillRect(S * 0.62, S * 0.35, S * 0.22, S * 0.65);
    x.fillRect(S * 0.42, S * 0.72, S * 0.18, S * 0.06);
    out.push(c);
  }
  {
    const [c, x] = canvas(S);
    x.fillStyle = grey(220); x.fillRect(0, 0, S, S);
    x.globalAlpha = 0.4; x.drawImage(noise(S, 16, rand), 0, 0); x.globalAlpha = 1;
    x.fillStyle = grey(80, 0.6); x.fillRect(S * 0.2, S * 0.3, S * 0.18, S * 0.5);
    out.push(c);
  }
  return out;
};

// Shop interiors: shelving silhouettes against a bright back wall.
export const shopInterior = (rand, w = 512, h = 256) => {
  const [c, x] = canvas(w, h);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, grey(255)); g.addColorStop(0.6, grey(215)); g.addColorStop(1, grey(150));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i += 1) {
    const sx = range(rand, 0, w); const sw = range(rand, 30, 90); const sh = range(rand, h * 0.3, h * 0.75);
    x.fillStyle = grey(range(rand, 40, 110), 0.85); x.fillRect(sx, h - sh, sw, sh);
    for (let k = 0; k < 6; k += 1) {
      x.fillStyle = rgb(range(rand, 60, 255), range(rand, 60, 255), range(rand, 60, 255), 0.5);
      x.fillRect(sx + 3, h - sh + k * sh / 6 + 4, sw - 6, sh / 6 - 8);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    x.fillStyle = grey(255); x.fillRect(range(rand, 0, w), 4, range(rand, 60, 140), 5);
  }
  return c;
};

// AC outdoor unit face: fan grille + louvres.
export const acFace = () => {
  const [c, x] = canvas(256, 192);
  x.fillStyle = grey(212); x.fillRect(0, 0, 256, 192);
  const cx = 96; const cy = 96;
  x.fillStyle = grey(55); x.beginPath(); x.arc(cx, cy, 78, 0, 7); x.fill();
  x.strokeStyle = grey(200); x.lineWidth = 2;
  for (let r = 12; r < 78; r += 8) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
  for (let a = 0; a < 8; a += 1) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a * 0.785) * 78, cy + Math.sin(a * 0.785) * 78); x.stroke(); }
  for (let y = 20; y < 180; y += 9) { x.fillStyle = grey(150); x.fillRect(190, y, 54, 4); }
  x.fillStyle = grey(120, 0.35); x.fillRect(0, 170, 256, 22);
  return c;
};

// ---------- signage ----------

const fitText = (x, text, maxW, size, family, weight = 700) => {
  let s = size;
  do { x.font = `${weight} ${s}px ${family}`; s -= 2; } while (x.measureText(text).width > maxW && s > 8);
};

const verticalText = (x, text, cx, top, step, size, family, weight = 800) => {
  x.font = `${weight} ${size}px ${family}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  [...text].forEach((ch, i) => x.fillText(ch, cx, top + step * (i + 0.5)));
};

// Atlas of painted signs. Returns { canvas, uv: { name: [u0, v0, u1, v1] } } with v up.
export const signAtlas = (rand) => {
  const W = 2048; const H = 2048;
  const [c, x] = canvas(W, H);
  x.fillStyle = grey(0); x.fillRect(0, 0, W, H);
  const uv = {};
  const slot = (name, sx, sy, sw, sh, paint) => {
    x.save(); x.translate(sx, sy); x.beginPath(); x.rect(0, 0, sw, sh); x.clip(); paint(sw, sh); x.restore();
    uv[name] = [sx / W, 1 - (sy + sh) / H, (sx + sw) / W, 1 - sy / H];
  };

  // vertical pole signs (clinic / dentist / tutoring), blue or green with white text
  const poleSigns = [
    ['みどり内科クリニック', [22, 120, 190], 'この先 50m'],
    ['さくら歯科', [30, 140, 110], '右折 30m'],
    ['ひかり整骨院', [200, 60, 50], 'この先'],
    ['学習塾 明星', [40, 70, 160], '2F'],
  ];
  poleSigns.forEach(([name, col, sub], i) => slot(`pole${i}`, i * 160, 0, 150, 900, (w, h) => {
    x.fillStyle = grey(245); x.fillRect(0, 0, w, h);
    x.fillStyle = rgb(...col); x.fillRect(8, 8, w - 16, h * 0.72);
    x.fillStyle = grey(255);
    const n = [...name].length;
    verticalText(x, name, w / 2, 24, (h * 0.72 - 40) / n, Math.min(96, (h * 0.72 - 40) / n * 0.92), JP);
    x.fillStyle = rgb(...col);
    fitText(x, sub, w - 20, 34, JP);
    x.textAlign = 'center'; x.fillText(sub, w / 2, h * 0.8);
    x.fillStyle = grey(30); x.font = `700 30px ${LATIN}`; x.fillText(`03-${3400 + (i * 137) % 600}-${1000 + i * 2311 % 8999}`, w / 2, h * 0.9);
  }));

  // address plates 神宮前 x-y
  for (let i = 0; i < 4; i += 1) {
    slot(`addr${i}`, 660 + i * 110, 0, 100, 240, (w, h) => {
      x.fillStyle = rgb(30, 60, 120); x.fillRect(0, 0, w, h);
      x.fillStyle = grey(255); verticalText(x, '神宮前', w / 2, 10, 44, 38, JP);
      x.font = `700 40px ${LATIN}`; x.fillText(`${1 + i}-${3 + i * 4}`, w / 2, h - 40);
    });
  }

  // shop fascias
  const fascias = [
    ['クリーニング', rgb(20, 90, 170), grey(255)],
    ['たばこ', rgb(200, 30, 40), grey(255)],
    ['酒 SAKE', rgb(240, 236, 220), rgb(20, 20, 20)],
    ['COFFEE', rgb(30, 30, 30), rgb(245, 220, 170)],
    ['理容 ヤマダ', rgb(240, 240, 240), rgb(30, 60, 150)],
    ['らーめん', rgb(180, 20, 20), rgb(255, 230, 120)],
    ['薬 ドラッグ', rgb(250, 210, 40), rgb(20, 40, 120)],
    ['不動産', rgb(30, 120, 70), grey(255)],
  ];
  fascias.forEach(([text, bg, fg], i) => slot(`fascia${i}`, (i % 4) * 512, 920 + Math.floor(i / 4) * 140, 500, 130, (w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = fg; fitText(x, text, w - 50, 92, JP, 800);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 4);
    x.fillStyle = grey(0, 0.12); x.fillRect(0, h - 10, w, 10);
  }));

  // coin parking board
  slot('parking', 0, 1220, 300, 420, (w, h) => {
    x.fillStyle = rgb(250, 200, 20); x.fillRect(0, 0, w, h);
    x.fillStyle = rgb(20, 60, 160); x.beginPath(); x.arc(w / 2, 140, 110, 0, 7); x.fill();
    x.fillStyle = grey(255); x.font = `900 170px ${LATIN}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', w / 2, 150);
    x.fillStyle = rgb(20, 20, 20); fitText(x, '24H 駐車場', w - 30, 54, JP, 800); x.fillText('24H 駐車場', w / 2, 300);
    x.fillStyle = rgb(220, 20, 30); x.fillRect(30, 345, w - 60, 56);
    x.fillStyle = grey(255); x.font = `800 40px ${JP}`; x.fillText('空 VACANT', w / 2, 375);
  });

  // 止まれ inverted triangle
  slot('stop', 320, 1220, 300, 270, (w, h) => {
    x.fillStyle = grey(255);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w / 2, h); x.closePath(); x.fill();
    x.fillStyle = rgb(210, 20, 30);
    x.beginPath(); x.moveTo(16, 10); x.lineTo(w - 16, 10); x.lineTo(w / 2, h - 18); x.closePath(); x.fill();
    x.fillStyle = grey(255); x.font = `800 58px ${JP}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('止まれ', w / 2, 80);
  });

  // no parking circle
  slot('noparking', 640, 1220, 260, 260, (w, h) => {
    x.fillStyle = grey(255); x.beginPath(); x.arc(w / 2, h / 2, w / 2, 0, 7); x.fill();
    x.fillStyle = rgb(210, 20, 30); x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 6, 0, 7); x.fill();
    x.fillStyle = rgb(20, 70, 170); x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 34, 0, 7); x.fill();
    x.strokeStyle = rgb(210, 20, 30); x.lineWidth = 26; x.beginPath(); x.moveTo(w * 0.25, h * 0.25); x.lineTo(w * 0.75, h * 0.75); x.stroke();
  });

  // pole safety sleeve (yellow / black chevrons)
  slot('sleeve', 920, 1220, 256, 512, (w, h) => {
    x.fillStyle = rgb(240, 200, 20); x.fillRect(0, 0, w, h);
    x.fillStyle = grey(20);
    for (let k = -h; k < h * 2; k += 80) { x.beginPath(); x.moveTo(0, k); x.lineTo(w, k + 120); x.lineTo(w, k + 160); x.lineTo(0, k + 40); x.fill(); }
    x.globalAlpha = 0.35; x.drawImage(noise(w, 16, rand, h, 32), 0, 0); x.globalAlpha = 1;
  });

  // licence plate (kei: yellow)
  slot('plate', 1200, 1220, 330, 165, (w, h) => {
    x.fillStyle = rgb(250, 215, 40); x.fillRect(0, 0, w, h);
    x.strokeStyle = grey(30); x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = grey(25); x.font = `700 34px ${JP}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('品川 480 な', w / 2, 40);
    x.font = `800 74px ${LATIN}`; x.fillText('12-34', w / 2, 110);
  });

  // carbon dioxide / generic poster on walls
  slot('poster', 1560, 1220, 300, 420, (w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgb(250, 90, 40)); g.addColorStop(1, rgb(120, 30, 160));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = grey(255); verticalText(x, '夏祭り', w * 0.75, 30, 90, 80, JP, 900);
    x.font = `800 34px ${LATIN}`; x.textAlign = 'left'; x.fillText('8.24 SAT', 20, h - 40);
    x.fillStyle = rgb(255, 230, 60); x.beginPath(); x.arc(w * 0.3, h * 0.4, 70, 0, 7); x.fill();
  });
  return { canvas: c, uv };
};

// Neon tube signs: glowing strokes on a dark backing. Returns atlas + uv.
export const neonAtlas = () => {
  const W = 1024; const H = 1024;
  const [c, x] = canvas(W, H);
  x.fillStyle = grey(0); x.fillRect(0, 0, W, H);
  const uv = {};
  const signs = [
    ['スナック蘭', [255, 60, 170], 'v'],
    ['カラオケ', [60, 220, 255], 'v'],
    ['BAR', [255, 120, 40], 'h'],
    ['喫茶', [120, 255, 140], 'v'],
    ['酒場', [255, 40, 60], 'v'],
    ['OPEN', [255, 70, 200], 'h'],
    ['麻雀', [80, 160, 255], 'v'],
  ];
  const glow = (col, paint) => {
    for (const [blur, width, alpha, white] of [[28, 10, 0.55, false], [10, 7, 0.9, false], [0, 3, 1, true]]) {
      x.shadowColor = rgb(...col, 1); x.shadowBlur = blur;
      x.strokeStyle = white ? rgb(255, 255 * 0.95, 255 * 0.95, alpha) : rgb(...col, alpha);
      x.fillStyle = x.strokeStyle;
      x.lineWidth = width;
      paint(width);
    }
    x.shadowBlur = 0;
  };
  let col = 0;
  signs.forEach(([text, colour, dir], i) => {
    const vertical = dir === 'v';
    const sw = vertical ? 140 : 360; const sh = vertical ? 520 : 150;
    const sx = vertical ? col : 0; const sy = vertical ? 0 : 540 + (i === 5 ? 170 : 0);
    if (vertical) col += 146;
    x.save(); x.translate(sx, sy);
    x.fillStyle = rgb(14, 10, 20); x.fillRect(0, 0, sw, sh);
    x.strokeStyle = rgb(...colour, 0.5); x.lineWidth = 3; x.strokeRect(10, 10, sw - 20, sh - 20);
    glow(colour, () => { x.strokeRect(16, 16, sw - 32, sh - 32); });
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (vertical) {
      const n = [...text].length; const step = (sh - 60) / n; const size = Math.min(110, step * 0.86);
      glow(colour, (lw) => {
        x.font = `500 ${size}px ${JP}`;
        x.lineWidth = lw * 0.6;
        [...text].forEach((ch, k) => x.strokeText(ch, sw / 2, 30 + step * (k + 0.5)));
      });
    } else {
      glow(colour, (lw) => {
        x.font = `500 96px ${LATIN}`; x.lineWidth = lw * 0.6;
        x.strokeText(text, sw / 2, sh / 2 + 4);
      });
    }
    x.restore();
    uv[`neon${i}`] = { rect: [sx / W, 1 - (sy + sh) / H, (sx + sw) / W, 1 - sy / H], vertical, colour };
  });
  return { canvas: c, uv };
};

// ---------- vending machines ----------

const PALETTES = [
  [[220, 40, 40], [255, 255, 255]], [[30, 90, 200], [240, 240, 240]], [[20, 140, 80], [250, 240, 200]],
  [[250, 190, 30], [140, 40, 20]], [[240, 240, 240], [20, 120, 200]], [[90, 50, 30], [230, 200, 150]],
  [[20, 20, 20], [230, 180, 60]], [[250, 120, 30], [255, 255, 255]], [[160, 200, 60], [255, 255, 255]],
  [[120, 60, 170], [255, 220, 255]], [[240, 230, 220], [200, 30, 30]], [[60, 170, 220], [255, 255, 255]],
];

const product = (x, rand, cx, base, w, h) => {
  const [body, label] = pick(rand, PALETTES);
  const kind = rand();
  x.save(); x.translate(cx, base);
  if (kind < 0.45) {
    // PET bottle
    const bw = w * 0.62; const bh = h;
    x.fillStyle = rgb(...body.map((v) => v * 0.5 + 120), 0.85);
    x.beginPath();
    x.moveTo(-bw * 0.18, -bh); x.lineTo(bw * 0.18, -bh); x.lineTo(bw * 0.2, -bh * 0.82);
    x.quadraticCurveTo(bw * 0.5, -bh * 0.7, bw * 0.5, -bh * 0.55); x.lineTo(bw * 0.5, 0); x.lineTo(-bw * 0.5, 0); x.lineTo(-bw * 0.5, -bh * 0.55);
    x.quadraticCurveTo(-bw * 0.5, -bh * 0.7, -bw * 0.2, -bh * 0.82); x.closePath(); x.fill();
    x.fillStyle = rgb(...label); x.fillRect(-bw * 0.5, -bh * 0.5, bw, bh * 0.28);
    x.fillStyle = rgb(...body); x.fillRect(-bw * 0.5, -bh * 0.42, bw, bh * 0.1);
    x.fillStyle = rgb(...pick(rand, PALETTES)[0]); x.fillRect(-bw * 0.2, -bh * 1.04, bw * 0.4, bh * 0.07);
    x.fillStyle = grey(255, 0.5); x.fillRect(-bw * 0.32, -bh * 0.7, bw * 0.08, bh * 0.6);
  } else {
    // can
    const cw = w * 0.66; const ch = h * (kind < 0.75 ? 0.72 : 0.56);
    x.fillStyle = rgb(...body); x.fillRect(-cw / 2, -ch, cw, ch);
    x.fillStyle = rgb(...label); x.fillRect(-cw / 2, -ch * 0.66, cw, ch * 0.3);
    x.fillStyle = rgb(...body.map((v) => 255 - v), 0.8); x.fillRect(-cw * 0.3, -ch * 0.58, cw * 0.6, ch * 0.08);
    x.fillStyle = grey(190); x.fillRect(-cw / 2, -ch - 4, cw, 5); x.fillRect(-cw / 2, -3, cw, 3);
    const g = x.createLinearGradient(-cw / 2, 0, cw / 2, 0);
    g.addColorStop(0, grey(0, 0.35)); g.addColorStop(0.3, grey(255, 0.3)); g.addColorStop(0.45, grey(255, 0)); g.addColorStop(1, grey(0, 0.4));
    x.fillStyle = g; x.fillRect(-cw / 2, -ch, cw, ch);
  }
  x.restore();
};

// Full machine front, 512 × 1024 for a 1.0 × 1.83 m face. Returns { map, emissive } canvases.
export const vendingFront = (rand, { body = [235, 235, 232], accent = [30, 90, 200], hot = 0.3 } = {}) => {
  const W = 512; const H = 1024;
  const [mc, m] = canvas(W, H);
  const [ec, e] = canvas(W, H);
  const Y = (metres) => H - (metres / 1.83) * H;   // metres from bottom → px from top
  m.fillStyle = rgb(...body); m.fillRect(0, 0, W, H);
  e.fillStyle = grey(0); e.fillRect(0, 0, W, H);

  // header sign
  const hy0 = Y(1.8); const hy1 = Y(1.64);
  const header = pick(rand, ['つめた〜い', 'おいしい水', 'HOT & COLD', 'いらっしゃいませ', 'ごくごく', 'Thank you']);
  for (const [ctx, k] of [[m, 1], [e, 0.9]]) {
    const g = ctx.createLinearGradient(0, hy0, W, hy1);
    g.addColorStop(0, rgb(...accent.map((v) => v * k))); g.addColorStop(1, rgb(...accent.map((v) => Math.min(255, v * 1.4) * k)));
    ctx.fillStyle = g; ctx.fillRect(14, hy0, W - 28, hy1 - hy0);
    ctx.fillStyle = grey(255 * k);
    fitText(ctx, header, W - 80, 64, JP, 900);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(header, W / 2, (hy0 + hy1) / 2);
  }

  // display window
  const dy0 = Y(1.62); const dy1 = Y(0.98);
  for (const ctx of [m, e]) {
    const g = ctx.createLinearGradient(0, dy0, 0, dy1);
    g.addColorStop(0, grey(255)); g.addColorStop(1, grey(225));
    ctx.fillStyle = g; ctx.fillRect(18, dy0, W - 36, dy1 - dy0);
  }
  const rows = 3; const rowH = (dy1 - dy0) / rows; const perRow = 8; const cellW = (W - 36) / perRow;
  for (let r = 0; r < rows; r += 1) {
    const base = dy0 + rowH * (r + 1) - rowH * 0.24;
    for (let k = 0; k < perRow; k += 1) {
      const cx = 18 + cellW * (k + 0.5);
      const seed = rand();
      for (const ctx of [m, e]) {
        let s = seed * 1e6;
        const local = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
        product(ctx, local, cx, base, cellW, rowH * 0.66);
      }
      // price strip + select button: blue (cold) or red (hot)
      const isHot = r === rows - 1 && rand() < hot * 2;
      const price = pick(rand, [100, 130, 150, 160, 180, 200]);
      for (const ctx of [m, e]) {
        ctx.fillStyle = isHot ? rgb(230, 40, 40) : rgb(30, 110, 230);
        ctx.fillRect(cx - cellW * 0.42, base + 3, cellW * 0.84, rowH * 0.09);
        ctx.fillStyle = grey(255); ctx.font = `700 ${Math.round(rowH * 0.07)}px ${LATIN}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`¥${price}`, cx, base + 3 + rowH * 0.045);
        ctx.fillStyle = rgb(120, 255, 160); ctx.fillRect(cx - 7, base + rowH * 0.13, 14, 8);
      }
    }
    for (const ctx of [m, e]) { ctx.fillStyle = grey(160); ctx.fillRect(18, dy0 + rowH * (r + 1) - 3, W - 36, 3); }
  }

  // lower ad panel (left) + money panel (right)
  const ly0 = Y(0.94); const ly1 = Y(0.34);
  {
    const [c1, c2] = [pick(rand, PALETTES)[0], pick(rand, PALETTES)[0]];
    for (const [ctx, k] of [[m, 1], [e, 0.35]]) {
      const g = ctx.createLinearGradient(0, ly0, 0, ly1);
      g.addColorStop(0, rgb(...c1.map((v) => v * k))); g.addColorStop(1, rgb(...c2.map((v) => v * k)));
      ctx.fillStyle = g; ctx.fillRect(18, ly0, W * 0.6, ly1 - ly0);
      ctx.fillStyle = grey(255 * k, 0.9); ctx.beginPath(); ctx.arc(18 + W * 0.3, (ly0 + ly1) / 2, 80, 0, 7); ctx.fill();
      ctx.fillStyle = rgb(...c1.map((v) => v * k));
      fitText(ctx, 'すっきり', 150, 50, JP, 900); ctx.textAlign = 'center'; ctx.fillText('すっきり', 18 + W * 0.3, (ly0 + ly1) / 2);
    }
  }
  m.fillStyle = grey(70); m.fillRect(W * 0.66, ly0, W * 0.3, ly1 - ly0);
  m.fillStyle = grey(25); m.fillRect(W * 0.7, ly0 + 30, W * 0.22, 40);
  e.fillStyle = rgb(40, 255, 120); e.fillRect(W * 0.72, ly0 + 36, W * 0.18, 28);
  m.fillStyle = rgb(40, 255, 120); m.fillRect(W * 0.72, ly0 + 36, W * 0.18, 28);
  for (const [ox, oy, ow, oh] of [[0.72, 100, 0.1, 50], [0.84, 100, 0.06, 18], [0.7, 190, 0.22, 26], [0.76, 260, 0.1, 60]]) {
    m.fillStyle = grey(15); m.fillRect(W * ox, ly0 + oy, W * ow, oh);
    e.fillStyle = rgb(255, 160, 40, 0.5); e.fillRect(W * ox, ly0 + oy, W * ow, 3);
  }
  // IC card reader glow
  e.fillStyle = rgb(60, 160, 255); e.fillRect(W * 0.7, ly0 + 350, W * 0.22, 60);
  m.fillStyle = rgb(60, 160, 255); m.fillRect(W * 0.7, ly0 + 350, W * 0.22, 60);

  // pick-up flap
  const py0 = Y(0.3); const py1 = Y(0.08);
  m.fillStyle = grey(30); m.fillRect(40, py0, W - 80, py1 - py0);
  m.fillStyle = grey(55); m.fillRect(46, py0 + 6, W - 92, (py1 - py0) * 0.5);
  m.fillStyle = grey(200); m.font = `700 26px ${JP}`; m.textAlign = 'center'; m.fillText('取出口', W / 2, py1 + 22);
  m.fillStyle = grey(0, 0.25); m.fillRect(0, Y(0.06), W, H);

  overlay(m, fbm(W, rand, [[8, 0.2], [64, 0.15]], H), 'multiply', 0.12);
  return { map: mc, emissive: ec };
};

// ---------- sky ----------

// Equirect dusk sky: u = azimuth (0.75 = −z, down the street), v = elevation (0.5 = horizon).
export const sky = (rand, W = 2048, H = 1024) => {
  const [c, x] = canvas(W, H);
  const stops = [
    [0.0, [26, 16, 44]], [0.44, [70, 40, 92]], [0.5, [255, 168, 150]], [0.53, [250, 150, 168]],
    [0.58, [226, 128, 186]], [0.65, [170, 110, 205]], [0.75, [110, 80, 185]], [0.88, [58, 42, 128]], [1, [30, 22, 76]],
  ];
  const g = x.createLinearGradient(0, H, 0, 0);
  stops.forEach(([s, col]) => g.addColorStop(s, rgb(...col)));
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // warm afterglow behind the far end of the street
  const sun = (u, k) => {
    x.save(); x.translate(u * W, H * 0.5); x.scale(2.6, 1);
    const r = x.createRadialGradient(0, 0, 0, 0, 0, H * 0.32);
    r.addColorStop(0, rgb(255, 196, 140, 0.95 * k)); r.addColorStop(0.35, rgb(255, 140, 150, 0.5 * k)); r.addColorStop(1, rgb(255, 120, 170, 0));
    x.fillStyle = r; x.fillRect(-H, -H, H * 2, H * 2); x.restore();
  };
  sun(0.75, 1); sun(0.75 - 1, 1); sun(0.25, 0.25);

  // altocumulus: mottled, lit pink from below the horizon
  const cloud = fbm(W, rand, [[6, 0.9], [14, 0.7], [40, 0.55], [110, 0.4], [300, 0.25]], H / 2);
  const [mc, mx] = canvas(W, H / 2);
  mx.drawImage(cloud, 0, 0);
  const img = mx.getImageData(0, 0, W, H / 2);
  const d = img.data;
  const [lc, lx] = canvas(W, H / 2);
  const out = lx.createImageData(W, H / 2);
  for (let i = 0; i < W * (H / 2); i += 1) {
    const row = Math.floor(i / W) / (H / 2);           // 0 = top of sky, 1 = horizon
    const v = d[i * 4] / 255;
    const density = Math.max(0, (v - 0.5 + row * 0.12) * 3.2) * (1 - Math.max(0, row - 0.85) * 6);
    const a = Math.min(1, density) * (0.55 + 0.35 * row);
    const lit = Math.min(1, row * 1.15 + (v - 0.5));
    out.data[i * 4] = 70 + lit * 185;
    out.data[i * 4 + 1] = 48 + lit * 100;
    out.data[i * 4 + 2] = 120 + lit * 60;
    out.data[i * 4 + 3] = Math.max(0, a) * 255;
  }
  lx.putImageData(out, 0, 0);
  x.drawImage(lc, 0, 0, W, H * 0.47);
  x.fillStyle = rgb(255, 160, 150, 0.12); x.fillRect(0, H * 0.46, W, H * 0.04);
  return c;
};

// Far city: dark facade with scattered lit windows (for the second row / skyline).
export const skylineFacade = (rand, w = 256, h = 512) => {
  const [mc, m] = canvas(w, h);
  const [ec, e] = canvas(w, h);
  m.fillStyle = grey(70); m.fillRect(0, 0, w, h);
  e.fillStyle = grey(0); e.fillRect(0, 0, w, h);
  overlay(m, fbm(w, rand, undefined, h), 'multiply', 0.5);
  const cols = 8; const rows = 16;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = c * w / cols + 5; const y0 = r * h / rows + 8; const ww = w / cols - 10; const hh = h / rows - 14;
      m.fillStyle = grey(30); m.fillRect(x0, y0, ww, hh);
      if (chance(rand, 0.16)) {
        const warm = rand() < 0.6;
        e.fillStyle = warm ? rgb(255, 190, 120, range(rand, 0.4, 1)) : rgb(200, 225, 255, range(rand, 0.4, 1));
        e.fillRect(x0, y0, ww, hh);
      }
    }
  }
  return { map: mc, emissive: ec };
};

// Soft radial sprite for dust, glows and light pools.
export const radial = (size = 64, stops = [[0, 1], [0.4, 0.35], [1, 0]]) => {
  const [c, x] = canvas(size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([s, a]) => g.addColorStop(s, grey(255, a)));
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return c;
};
