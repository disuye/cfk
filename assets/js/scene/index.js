// Entry: detection, tiers, renderer, haze, env capture, camera rig, loop.
import {
  Color, FogExp2, NeutralToneMapping, PCFShadowMap, PMREMGenerator, PerspectiveCamera, RectAreaLightUniformsLib,
  RoomEnvironment, SRGBColorSpace, Scene, Vector3, WebGLRenderer,
} from '../vendor/three.module.js';
import { rng } from './parts.js';
import { damp } from './motion.js';
import { buildSet } from './set.js';
import { createMirror } from './reflect.js';
import { createDust } from './dust.js';
import { createPost } from './post.js';
import { SUBJECT, STREET } from './layout.js';

const canvas = document.querySelector('[data-is="scene"]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowSpec = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');   // test hooks: debug.js, see tooling-spec.md

const FPS = 30;
const STEP = 1 / FPS;
const SEED = 1984;
// surfaces: px size of the tiling surface textures (facades, asphalt, concrete; secondary sets get half).
// Power of two. Sign / neon atlases are fixed size, so lettering stays sharp on every tier.
const TIERS = {
  high: { ratio: 1.5, dust: 1400, mirror: 0.5, taps: 12, surfaces: 512 },
  low: { ratio: 1, dust: 600, mirror: 0.33, taps: 7, surfaces: 512 },
};
const HAZE = { density: 0.0095, mix: 0.5, horizon: [0.62, 0.4, 0.58] };   // ground mixed toward the dusk horizon
const EXPOSURE = 0.9;
const ENV = { probe: new Vector3(0, 2.2, -6), intensity: 0.45 };
const FOV = { landscape: 54, portrait: 70 };
const CLIP = { near: 0.2, far: 340 };   // far covers the off-axis towers from every dolly position
const PARALLAX = { x: 1.35, y: 0.3, lookX: 2.4, lookY: 0.8 };
const IDLE = { after: 2.5, radius: 0.35, speed: 0.12, fadeIn: 0.4, fadeOut: 2 };   // pointer-idle orbit, normalized pointer units
const EYE_HEIGHT = 1.25;
const DOLLY = { from: 11.5, travel: 17, lookY: 6.2, ahead: 22 };

const pickTier = () => {
  if (DEBUG && TIERS[params.get('tier')]) return params.get('tier');
  const coarse = matchMedia('(pointer: coarse)').matches;
  return coarse || (navigator.hardwareConcurrency ?? 4) < 8 ? 'low' : 'high';
};

// Single source of truth for the ground colour: the CSS token.
const pageTint = () => getComputedStyle(document.documentElement)
  .getPropertyValue('--ground-rgb').trim().split(/\s+/).map((v) => Number(v) / 255);

const scrollProgress = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
};

const createRig = (camera) => {
  const goal = { p: scrollProgress(), x: 0, y: 0 };
  const now = { ...goal };
  const look = new Vector3();
  let lastMove = -Infinity;
  let idle = 0;
  addEventListener('scroll', () => { goal.p = scrollProgress(); }, { passive: true });
  addEventListener('pointermove', (e) => {
    goal.x = e.clientX / innerWidth * 2 - 1;
    goal.y = e.clientY / innerHeight * 2 - 1;
    lastMove = e.timeStamp / 1000;
  }, { passive: true });

  return (time, dt) => {
    now.p = damp(now.p, goal.p, 3, dt);
    now.x = damp(now.x, goal.x, 2, dt);
    now.y = damp(now.y, goal.y, 2, dt);
    const resting = time - lastMove > IDLE.after;
    idle = damp(idle, resting ? 1 : 0, resting ? IDLE.fadeIn : IDLE.fadeOut, dt);
    const x = now.x + Math.cos(time * IDLE.speed) * IDLE.radius * idle;
    const y = now.y + Math.sin(time * IDLE.speed) * IDLE.radius * 0.6 * idle;
    const drift = Math.sin(time * 0.05) * 0.2;
    const z = DOLLY.from - now.p * DOLLY.travel;
    camera.position.set(0.35 + drift + x * PARALLAX.x, EYE_HEIGHT - y * PARALLAX.y, z);
    look.set(x * PARALLAX.lookX + now.p * 0.6, DOLLY.lookY - y * PARALLAX.lookY, z - DOLLY.ahead);
    camera.lookAt(look);
    return Math.max(4, camera.position.z - SUBJECT.z);   // → depth-of-field focus distance
  };
};

const boot = () => {
  const tierName = pickTier();
  let tier = TIERS[tierName];
  const renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, tier.ratio));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  RectAreaLightUniformsLib.init();

  const tint = pageTint();
  const haze = new Color().setRGB(...tint.map((c, i) => c + (HAZE.horizon[i] - c) * HAZE.mix), SRGBColorSpace);
  const scene = new Scene();
  scene.fog = new FogExp2(haze, HAZE.density);
  scene.background = haze;

  const camera = new PerspectiveCamera(FOV.landscape, 1, CLIP.near, CLIP.far);
  const rand = rng(SEED);
  const mirror = createMirror(renderer, { scale: tier.mirror });
  const surfaces = (DEBUG && Number(params.get('surfaces'))) || tier.surfaces;
  const set = buildSet({ rand, tier: tierName, mirror, taps: tier.taps, surfaces });
  scene.add(set.root);

  const dust = createDust(rand, set.lib.radial, new Color(1, 0.86, 0.95), {
    count: tier.dust,
    volume: { x: [-STREET.lot, STREET.lot], y: [0.2, 8], z: [-40, 14] },
    hotspots: set.hotspots,
  });
  dust.objects.forEach((o) => scene.add(o));
  mirror.hide(set.road, set.cross, ...dust.objects);

  // Reflections without an HDRI: seed with a generic room, then capture the street itself.
  renderer.shadowMap.needsUpdate = true;
  const pmrem = new PMREMGenerator(renderer);
  const seed = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = seed.texture;
  set.sky.position.copy(ENV.probe);
  const env = pmrem.fromScene(scene, 0.04, 0.1, 150, { position: ENV.probe });
  scene.environment = env.texture;
  scene.environmentIntensity = ENV.intensity;
  seed.dispose();
  pmrem.dispose();

  const rig = createRig(camera);
  let post = createPost(renderer, scene, camera, { tier: tierName, tint });

  const resize = () => {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, tier.ratio));
    renderer.setSize(w, h, false);
    post.setPixelRatio(renderer.getPixelRatio());
    post.setSize(w, h);
    mirror.setSize();
    camera.aspect = w / h;
    camera.fov = w < h ? FOV.portrait : FOV.landscape;
    camera.updateProjectionMatrix();
  };
  resize();

  const hooks = {};   // filled by debug.js only
  let lastZ = null;
  const draw = (time, dt) => {
    hooks.beforeFrame?.();
    const focus = rig(time, dt);
    hooks.afterRig?.();
    const speed = lastZ === null ? 0 : Math.abs(camera.position.z - lastZ) / dt;   // dolly m/s → scroll glitch
    lastZ = camera.position.z;
    set.update(time);
    dust.update(time);
    set.sky.position.copy(camera.position);
    mirror.update(scene, camera);
    post.render(time, focus, dt, speed);
    hooks.afterFrame?.();
    dispatchEvent(new Event('scene:frame'));   // grain.js keys its position jumps to this
  };

  // Watchdog: if the first 60 measured frames run slow, drop to the low post chain once.
  let frames = 0; let slow = 0; let downgraded = tierName === 'low';
  const watchFrameRate = (dt) => {
    if (downgraded) return;
    frames += 1;
    if (frames <= 15) return;
    slow += dt;
    if (frames < 75) return;
    if (slow / 60 > STEP * 1.35) {
      tier = TIERS.low;
      post.dispose();
      post = createPost(renderer, scene, camera, { tier: 'low', tint });
      resize();
      console.info('scene: dropped to low tier');
    }
    downgraded = true;
  };

  let last = performance.now();
  let pending = 0;
  const frame = (ms) => {
    pending += Math.min((ms - last) / 1000, 0.25);
    last = ms;
    if (pending < STEP * 0.95) return;
    const dt = pending;
    pending = 0;
    draw(ms / 1000, Math.min(dt, 0.1));
    watchFrameRate(dt);
  };

  draw(0, STEP);
  canvas.dataset.ready = '';
  const setLoop = (on) => renderer.setAnimationLoop(on ? frame : null);
  if (!reducedMotion) setLoop(true);
  if (DEBUG) {
    import('./debug.js')
      .then(({ attach }) => attach({ canvas, renderer, scene, camera, draw, hooks, setLoop, params, tier: tierName }))
      .catch((e) => console.warn('debug hooks:', e.message));
  }
  addEventListener('resize', () => { resize(); if (reducedMotion) draw(0, STEP); }, { passive: true });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
    delete canvas.dataset.ready;
  });
};

if (canvas && (!lowSpec || DEBUG)) {
  try { boot(); } catch (error) { console.warn('scene disabled:', error.message); }
}
