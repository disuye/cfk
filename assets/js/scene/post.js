import { loadCube } from './lut.js';
import { HalationPass } from './halation.js';
import { GLITCH, GlitchPass } from './glitch.js';
import {
  BokehPass, EffectComposer, GTAOPass, OutputPass, RenderPass, ShaderPass, UnrealBloomPass, Vector2, Vector3,
} from '../vendor/three.module.js';

export const FOCUS_RANGE = 9;

// Colour grade LUT, applied in display space at the end of the grade pass (before grain).
// cube: null → no grade (the stage is skipped via mix 0); or a 3D .cube path, e.g. 'assets/lut/cfk.cube'. mix: 0–1 strength.
export const GRADE = { cube: null, mix: 1 };
export const BLOOM = { strength: 0.62, radius: 0.55, threshold: 0.92 };

// Stock BokehPass blurs outward from the focus plane with no sharp band; this carves one out.
// Regex-guarded: if a three.js update changes the line, the pass falls back to stock behaviour.
const withFocusRange = (pass, range) => {
  const material = pass.materialBokeh;
  const blur = /float factor = \( focus \+ viewZ \);[^\n]*/;
  if (!blur.test(material.fragmentShader)) return;
  pass.uniforms.focusRange = { value: range };
  material.fragmentShader = `uniform float focusRange;\n${material.fragmentShader.replace(blur,
    'float factor = focus + viewZ;\n\t\t\tfactor = sign( factor ) * max( abs( factor ) - focusRange, 0.0 );')}`;
  material.needsUpdate = true;
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new Vector3() },
    uLift: { value: 0.04 },
    uVignette: { value: 0.42 },
    uAberration: { value: 0.0065 },
    uGrain: { value: 0.05 },
    uLut: { value: null },
    uLutSize: { value: 2 },
    uLutMix: { value: 0 },
    uVhs: { value: 0 },
    uScan: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uTint;
    uniform sampler3D uLut;
    uniform float uLift, uVignette, uAberration, uGrain, uVhs, uScan, uTime, uLutSize, uLutMix;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 uv = vUv;
      float band = 0.0;
      if (uVhs > 0.0) {
        float row = floor(gl_FragCoord.y / 2.0);
        uv.x += (hash(vec2(row, floor(uTime * 24.0))) - 0.5) * 0.0015 * uVhs;
        band = 1.0 - smoothstep(0.0, 0.04, abs(fract(uv.y + uTime * 0.07) - 0.5));
        uv.x += band * 0.006 * uVhs;
      }

      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec2 offset = c * uAberration * r2 * 4.0 + vec2(0.002 * uVhs, 0.0);
      vec3 col = vec3(
        texture2D(tDiffuse, uv + offset).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - offset).b
      );

      col = mix(col, uTint, uLift);
      col *= 1.0 - uVignette * smoothstep(0.08, 0.5, r2);
      col *= 1.0 - uScan * 0.25 * (1.0 + sin(gl_FragCoord.y * 3.14159265));

      // 3D LUT: half-texel inset so 0 and 1 land on the first and last lattice points
      vec3 uvw = clamp(col, 0.0, 1.0) * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
      col = mix(col, texture(uLut, uvw).rgb, uLutMix);

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float n = hash(gl_FragCoord.xy + fract(uTime) * 917.0) - 0.5;
      col += n * uGrain * mix(1.0, 0.35, luma);
      col += band * uVhs * abs(n) * 0.08;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

let lut = null;   // loaded once, shared if the watchdog rebuilds the chain

export const createPost = (renderer, scene, camera, { tier, tint }) => {
  const size = renderer.getDrawingBufferSize(new Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let bokeh = null;
  if (tier === 'high') {
    const ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1, scale: 1 });
    ao.blendIntensity = 0.8;
    composer.addPass(ao);
  }

  composer.addPass(new HalationPass());
  composer.addPass(new UnrealBloomPass(size.clone(), BLOOM.strength, BLOOM.radius, BLOOM.threshold));

  if (tier === 'high') {
    bokeh = new BokehPass(scene, camera, { focus: 14, aperture: 0.0007, maxblur: 0.0022 });
    withFocusRange(bokeh, FOCUS_RANGE);
    composer.addPass(bokeh);
  }

  composer.addPass(new OutputPass());
  const glitch = new GlitchPass(scene, camera);
  composer.addPass(glitch);
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uTint.value.set(...tint);
  composer.addPass(grade);
  const applyLut = ({ texture, size }) => {
    grade.uniforms.uLut.value = texture;
    grade.uniforms.uLutSize.value = size;
    grade.uniforms.uLutMix.value = GRADE.mix;
  };
  if (GRADE.cube) {
    lut ??= loadCube(GRADE.cube);
    lut.then(applyLut).catch((e) => console.warn('LUT not loaded:', e.message));
  }

  return {
    render: (time, focus, dt, speed) => {
      glitch.enabled = GLITCH.enabled;
      if (glitch.enabled) glitch.update(time, dt, speed);
      grade.uniforms.uTime.value = time;
      if (bokeh) bokeh.uniforms.focus.value = focus;
      composer.render();
    },
    setSize: (w, h) => composer.setSize(w, h),
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
    dispose: () => composer.dispose(),
  };
};
