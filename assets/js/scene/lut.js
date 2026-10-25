// 3D colour LUTs for the grade pass. A LUT maps every display-space RGB to a new RGB; the grade
// shader samples it as a 3D texture. Source: any 3D .cube file (Resolve, Photoshop, Premiere).
// Layout matches Data3DTexture: red varies fastest, then green, then blue.
import { Data3DTexture, LinearFilter } from '../vendor/three.module.js';

const toTexture = (data, size) => {
  const t = new Data3DTexture(data, size, size, size);
  t.minFilter = t.magFilter = LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return { texture: t, size };
};

// Parses a 3D .cube (LUT_3D_SIZE + rows of "r g b"). Assumes the standard 0–1 input domain.
export const parseCube = (text) => {
  let size = 0;
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('TITLE')) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === 'LUT_3D_SIZE') size = Number(rest[0]);
    else if (key === 'LUT_1D_SIZE') throw new Error('1D .cube files are not supported; export a 3D LUT');
    else if (!Number.isNaN(Number(key))) rows.push([Number(key), ...rest.map(Number)]);
  }
  if (!size || rows.length !== size ** 3) throw new Error(`malformed .cube (${rows.length} rows for size ${size})`);
  const data = new Uint8Array(size ** 3 * 4);
  rows.forEach((row, i) => {
    row.forEach((v, c) => { data[i * 4 + c] = Math.round(Math.min(1, Math.max(0, v)) * 255); });
    data[i * 4 + 3] = 255;
  });
  return toTexture(data, size);
};

export const loadCube = async (url) => parseCube(await (await fetch(url)).text());
