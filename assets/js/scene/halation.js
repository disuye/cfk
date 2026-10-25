// Film halation: bright light scatters through the film base and re-exposes the red layer, leaving a
// red/pink fringe around highlights. Done as a post pass on the linear HDR frame, before bloom:
//   1. extract bright, near-white pixels (lamps, vending displays; saturated neon and warm interiors are skipped)
//   2. blur twice at quarter resolution: a narrow and a wide falloff
//   3. ring = wide − narrow, so the colour sits outside the white bloom; add it tinted red/pink,
//      and never on pixels that are themselves bright cores, so cores stay white.
import { FullScreenQuad, HalfFloatType, Pass, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget } from '../vendor/three.module.js';

export const HALATION = {
  threshold: 1.1,    // linear HDR level where a source starts to halate (emitters only, not lit surfaces)
  knee: 0.5,         // soft ramp above the threshold
  whiteness: 0.28,   // max saturation counted as "white" (0 = pure grey only)
  radius: 2.2,       // blur step in quarter-res texels; wider = larger fringe
  ring: 0.55,         // how much of the narrow blur is removed: 0 = soft glow to the core, 1 = thin ring
  strength: 3.5,
  tint: [1.0, 0.12, 0.28],   // red-pink
  core: 1.0,         // tint fades out between core and 1.4 × core: brighter pixels stay white
};

const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const extract = new ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new Vector2() }, uThreshold: { value: 0 }, uKnee: { value: 0 }, uWhite: { value: 0 } },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uThreshold, uKnee, uWhite;
    varying vec2 vUv;
    float weight(vec3 c) {
      float hi = max(c.r, max(c.g, c.b));
      float lo = min(c.r, min(c.g, c.b));
      float sat = (hi - lo) / max(hi, 1e-4);
      float white = 1.0 - smoothstep(uWhite, uWhite + 0.2, sat);
      return smoothstep(uThreshold, uThreshold + uKnee, hi) * white * min(hi, 4.0);
    }
    void main() {
      // 4 bilinear taps = 16 full-res pixels per quarter-res texel
      float m = weight(texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb)
              + weight(texture2D(tDiffuse, vUv + uTexel * vec2( 1.0, -1.0)).rgb)
              + weight(texture2D(tDiffuse, vUv + uTexel * vec2(-1.0,  1.0)).rgb)
              + weight(texture2D(tDiffuse, vUv + uTexel * vec2( 1.0,  1.0)).rgb);
      gl_FragColor = vec4(vec3(m * 0.25), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});

const blur = new ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uStep: { value: new Vector2() } },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uStep;
    varying vec2 vUv;
    void main() {
      float w[5] = float[](0.2270, 0.1945, 0.1216, 0.0541, 0.0162);
      float s = texture2D(tDiffuse, vUv).r * w[0];
      for (int i = 1; i < 5; i++) {
        s += texture2D(tDiffuse, vUv + uStep * float(i)).r * w[i];
        s += texture2D(tDiffuse, vUv - uStep * float(i)).r * w[i];
      }
      gl_FragColor = vec4(vec3(s), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});

const composite = new ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, tWide: { value: null }, tNarrow: { value: null }, uTint: { value: new Vector3() }, uStrength: { value: 0 }, uRing: { value: 0 }, uCore: { value: 1 } },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tWide, tNarrow;
    uniform vec3 uTint;
    uniform float uStrength, uRing, uCore;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float hi = max(base.r, max(base.g, base.b));
      float fringe = 1.0 - smoothstep(uCore, uCore * 1.4, hi);
      float ring = max(texture2D(tWide, vUv).r - texture2D(tNarrow, vUv).r * uRing, 0.0);
      base.rgb += uTint * ring * uStrength * fringe;
      gl_FragColor = base;
    }`,
  depthTest: false,
  depthWrite: false,
});

export class HalationPass extends Pass {
  constructor(params = HALATION) {
    super();
    this.params = params;
    this.a = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    this.b = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    this.c = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    this.quad = new FullScreenQuad();
    this.size = new Vector2(1, 1);
  }

  setSize(width, height) {
    this.size.set(Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 4)));
    this.a.setSize(this.size.x, this.size.y);
    this.b.setSize(this.size.x, this.size.y);
    this.c.setSize(this.size.x, this.size.y);
    this.full = new Vector2(1 / width, 1 / height);
  }

  draw(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    const p = this.params;
    const tx = 1 / this.size.x; const ty = 1 / this.size.y;

    extract.uniforms.tDiffuse.value = readBuffer.texture;
    extract.uniforms.uTexel.value.copy(this.full);
    extract.uniforms.uThreshold.value = p.threshold;
    extract.uniforms.uKnee.value = p.knee;
    extract.uniforms.uWhite.value = p.whiteness;
    this.draw(renderer, extract, this.a);

    // separable blur: a → narrow (c), then narrow → wide (a) at triple step
    const pass = (src, dst, k) => {
      blur.uniforms.tDiffuse.value = src.texture;
      blur.uniforms.uStep.value.set(tx * p.radius * k, 0);
      this.draw(renderer, blur, this.b);
      blur.uniforms.tDiffuse.value = this.b.texture;
      blur.uniforms.uStep.value.set(0, ty * p.radius * k);
      this.draw(renderer, blur, dst);
    };
    pass(this.a, this.c, 1);
    pass(this.c, this.a, 3);

    composite.uniforms.tDiffuse.value = readBuffer.texture;
    composite.uniforms.tWide.value = this.a.texture;
    composite.uniforms.tNarrow.value = this.c.texture;
    composite.uniforms.uRing.value = p.ring;
    composite.uniforms.uTint.value.set(...p.tint);
    composite.uniforms.uStrength.value = p.strength;
    composite.uniforms.uCore.value = p.core;
    this.draw(renderer, composite, this.renderToScreen ? null : writeBuffer);
  }

  dispose() {
    this.a.dispose();
    this.b.dispose();
    this.c.dispose();
    this.quad.dispose();
  }
}
