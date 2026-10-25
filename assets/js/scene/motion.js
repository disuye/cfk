export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Frame-rate-independent easing toward a target.
export const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Light patterns, each returning a 0–1 multiplier at time t (seconds). Phase/period desync copies.
export const flicker = {
  // Healthy fluorescent: tiny mains shimmer.
  steady: (t, phase = 0) => 0.97 + 0.03 * Math.sin(t * 6.1 + phase * 9) * Math.sin(t * 2.3 + phase),

  // Breathing neon transformer.
  breathe: (t, phase = 0, period = 5) => 0.85 + 0.15 * (0.5 + 0.5 * Math.sin((t / period + phase) * Math.PI * 2)),

  // Failing tube: mostly on, with irregular bursts of stutter and short blackouts.
  failing: (t, phase = 0, period = 7) => {
    const cycle = t / period + phase;
    const k = Math.floor(cycle);
    const f = cycle - k;
    const burstAt = 0.2 + hash(k) * 0.6;
    const burstLen = 0.04 + hash(k + 13) * 0.08;
    if (f < burstAt || f > burstAt + burstLen) return 0.96 + 0.04 * Math.sin(t * 50 + phase);
    const step = Math.floor(t * 24);
    return hash(step + k * 7) > 0.45 ? 0.15 + hash(step) * 0.5 : 0.95;
  },

  // Red aviation beacon: slow on/off fade.
  beacon: (t, phase = 0, period = 2.4) => {
    const f = (t / period + phase) % 1;
    return f < 0.5 ? smootherstep(clamp01(f * 6)) : smootherstep(clamp01((1 - f) * 6 - 2));
  },
};
