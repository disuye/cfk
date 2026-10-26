// Bonus: every 60–70 s a kaiju head rises behind the far towers, looks down the street, and sinks again.
// One textured card (the client's cut-out photo), lit in-shader to sit in the dusk: lilac fill on the face,
// sky-coloured rim on the silhouette, aerial haze, and HDR eyes that feed bloom + halation.
//
// Placement is set in "anchor" space: the plane of the near tower's front face (x −58, z −139, 92 m tall),
// where the head reads at its intended size right in the corner above the lower far tower's roof.
// The card itself stands DEPTH times further out along the line of sight, so the far tower (−90, −190)
// genuinely occludes the neck, and haze / depth of field treat it as distant. The line of sight is taken
// from the scroll dolly only, so pointer parallax stays real while scrolling never slides him off the corner.
import {
  CanvasTexture, Color, DoubleSide, Group, Mesh, PlaneGeometry, SRGBColorSpace, ShaderMaterial, Vector2, Vector3,
} from '../vendor/three.module.js';
import { rng } from './parts.js';
import { clamp01, smootherstep } from './motion.js';

export const KAIJU = {
  enabled: true,
  seed: 1954,
  period: [60, 70],               // s from one appearance to the next (and before the first)
  // anchor space (metres on the near tower's front plane)
  anchor: new Vector3(-72.8, 50.5, -139),   // bottom-centre of the card at full height
  width: 8.4,                     // card width; height follows the image aspect
  hidden: 13,                     // how far below full height it waits (fully behind the roof)
  depth: 1.65,                    // distance multiplier: how far behind the anchor plane it really stands
  // timeline, s from the start of an appearance
  rise: 7,
  hold: 9,
  sink: 5,
  // look
  light: [0.62, 0.5, 0.72],       // fill on the face (dusk, backlit)
  rim: [1, 0.6, 0.72],            // sky glow wrapping the silhouette
  rimGain: 1.5,
  haze: 0.48,                     // share of the haze colour mixed over the card
  eyes: [1, 0.62, 0.3],           // eye glow colour
  eyeGain: 6,                     // > 1 so bloom and halation catch it
  eyeHaze: 0.25,
};

// Eye centres in image pixels, image size: from the source photo.
const IMAGE = { url: new URL('../../img/godzilla.webp', import.meta.url).href, size: [300, 448] };
const EYES = [[91, 57], [207, 64]];

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uSize;
  uniform vec2 uEyeL, uEyeR;
  uniform vec3 uLight, uRim, uHaze, uEyeColor;
  uniform float uRimGain, uHazeMix, uEyes, uEyeHaze;
  varying vec2 vUv;

  float alphaAt(vec2 o) { return texture2D(uMap, vUv + o / uSize).a; }

  float eye(vec2 c) {
    vec2 d = vUv * uSize - c;
    float r2 = dot(d, d);
    return exp(-r2 / 26.0) + 0.3 * exp(-r2 / 320.0);
  }

  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = smoothstep(0.35, 0.9, t.a);
    if (a < 0.01) discard;

    // backlight: strongest where the silhouette faces up, softer on the flanks
    float up = alphaAt(vec2(0.0, 4.0));
    float side = min(alphaAt(vec2(-4.0, 1.5)), alphaAt(vec2(4.0, 1.5)));
    float rim = max(1.0 - up, (1.0 - side) * 0.55);

    vec3 col = t.rgb * uLight + uRim * rim * uRimGain * (0.4 + 0.6 * vUv.y);
    col = mix(col, uHaze, uHazeMix);

    float glow = (eye(uEyeL) + eye(uEyeR)) * uEyes;
    col += uEyeColor * glow * (1.0 - uEyeHaze);
    gl_FragColor = vec4(col, a);
  }
`;

const ease = { in: (t) => t * t * t, out: (t) => 1 - (1 - t) ** 3 };

export const createKaiju = ({ haze }) => {
  const k = KAIJU;
  const [iw, ih] = IMAGE.size;
  const height = k.width * (ih / iw);
  const uv = ([x, y]) => new Vector2(x, ih - y);

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMap: { value: null },
      uSize: { value: new Vector2(iw, ih) },
      uEyeL: { value: uv(EYES[0]) },
      uEyeR: { value: uv(EYES[1]) },
      uLight: { value: new Color() },
      uRim: { value: new Color() },
      uRimGain: { value: 0 },
      uHaze: { value: haze },
      uHazeMix: { value: 0 },
      uEyeColor: { value: new Color() },
      uEyes: { value: 0 },
      uEyeHaze: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });

  const geometry = new PlaneGeometry(k.width, height);
  geometry.translate(0, height / 2, 0);   // pivot at the bottom: it rises from behind the roof
  const card = new Mesh(geometry, material);
  const root = new Group();
  root.add(card);
  root.visible = false;

  // Lazy: the photo arrives after boot and never blocks the first frame.
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    const map = new CanvasTexture(image);
    map.colorSpace = SRGBColorSpace;
    material.uniforms.uMap.value = map;
  };
  image.src = IMAGE.url;

  const rand = rng(k.seed);
  const gap = () => k.period[0] + (k.period[1] - k.period[0]) * rand();
  let start = gap();
  const length = k.rise + k.hold + k.sink;

  const eye = new Vector3();
  const anchor = new Vector3();

  // Pose at s seconds into an appearance: lift 0–1, eyes 0–1, plus small creature motion.
  const pose = (s) => {
    const { rise, hold, sink } = k;
    const lift = s < rise ? ease.out(clamp01(s / rise)) * 0.92 + smootherstep(clamp01(s / rise)) * 0.08
      : s < rise + hold ? 1
        : 1 - ease.in(clamp01((s - rise - hold) / sink));
    const awake = smootherstep(clamp01((s - rise * 0.75) / 1.6)) * (1 - smootherstep(clamp01((s - rise - hold + 0.5) / 2)));
    const blinkAt = rise + hold * 0.55;
    const blink = Math.abs(s - blinkAt) < 0.09 ? 0.05 : 1;
    const breathe = Math.sin(s * 1.3) * 0.18 * lift;
    const sway = Math.sin(s * 0.45 + 0.6) * 0.03 * lift;   // slow head roll, radians
    const turn = Math.sin(s * 0.3) * 0.35 * lift;            // lateral drift, metres (anchor space)
    return { lift, eyes: awake * blink, breathe, sway, turn };
  };

  const update = (time, camera) => {
    if (!k.enabled) { root.visible = false; return; }
    while (time > start + length) start += gap();
    const s = time - start;
    if (s < 0 || !material.uniforms.uMap.value) { root.visible = false; return; }
    const p = pose(s);
    root.visible = p.lift > 0.001;
    if (!root.visible) return;

    // dolly eye: camera z only, at the rig's resting x / y
    eye.set(0.35, 1.25, camera.position.z);
    anchor.copy(k.anchor);
    anchor.x += p.turn;
    anchor.y += (p.lift - 1) * k.hidden + p.breathe;
    root.position.copy(anchor).sub(eye).multiplyScalar(k.depth).add(eye);
    root.scale.setScalar(k.depth);
    root.rotation.set(0, Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z), 0);
    card.rotation.z = p.sway;

    const u = material.uniforms;   // read from KAIJU every frame, so it can be tuned live
    u.uLight.value.setRGB(...k.light);
    u.uRim.value.setRGB(...k.rim);
    u.uRimGain.value = k.rimGain;
    u.uHazeMix.value = k.haze;
    u.uEyeColor.value.setRGB(...k.eyes);
    u.uEyeHaze.value = k.eyeHaze;
    u.uEyes.value = p.eyes * k.eyeGain;
  };

  // debug: start an appearance at a given scene time
  const trigger = (at) => { start = at; };

  return { object: root, update, trigger };
};
