// Airborne particles: three additive layers drifting at their own rates, so the dolly reads as parallax.
// Outdoors at dusk these read as damp air / midges, densest under the lamps and around the vending machines.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial } from '../vendor/three.module.js';

const LAYERS = [
  { share: 0.7, size: 0.022, opacity: 0.5, drift: [0.012, 0.03] },
  { share: 0.25, size: 0.04, opacity: 0.3, drift: [-0.02, 0.018] },
  { share: 0.05, size: 0.09, opacity: 0.12, drift: [0.008, -0.012] },
];
const NEAR_FADE = [0.8, 3.0];   // metres from the lens: particles closer than this fade out instead of filling the frame

const fadeNearLens = (material) => {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vNear;')
      .replace('#include <project_vertex>', `#include <project_vertex>\nvNear = smoothstep( ${NEAR_FADE[0].toFixed(2)}, ${NEAR_FADE[1].toFixed(2)}, -mvPosition.z );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNear;')
      .replace('#include <premultiplied_alpha_fragment>', 'diffuseColor.a *= vNear;\n#include <premultiplied_alpha_fragment>');
  };
  return material;
};

export const createDust = (rand, sprite, colour, { count, volume, hotspots = [] }) => {
  const layers = LAYERS.map(({ share, size, opacity, drift }) => {
    const n = Math.round(count * share);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const hot = hotspots.length && rand() < 0.6 ? hotspots[Math.floor(rand() * hotspots.length)] : null;
      if (hot) {
        pos[i * 3] = hot.x + (rand() - 0.5) * 3;
        pos[i * 3 + 1] = Math.max(0.2, hot.y - rand() * hot.y);
        pos[i * 3 + 2] = hot.z + (rand() - 0.5) * 4;
      } else {
        pos[i * 3] = volume.x[0] + rand() * (volume.x[1] - volume.x[0]);
        pos[i * 3 + 1] = volume.y[0] + rand() * (volume.y[1] - volume.y[0]);
        pos[i * 3 + 2] = volume.z[0] + rand() * (volume.z[1] - volume.z[0]);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    const m = new PointsMaterial({
      size, map: sprite, color: colour, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true,
    });
    fadeNearLens(m);
    const p = new Points(g, m);
    p.frustumCulled = false;
    return { points: p, drift };
  });

  return {
    objects: layers.map((l) => l.points),
    update: (t) => {
      for (const { points, drift } of layers) {
        points.position.x = Math.sin(t * 0.07) * 0.4 + t * drift[0] % 2;
        points.position.y = Math.sin(t * 0.11 + drift[1] * 40) * 0.25 + (t * drift[1]) % 1.5;
      }
    },
  };
};
