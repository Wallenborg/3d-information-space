export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const norm = (v, lo, hi) => clamp01((v - lo) / (hi - lo));
/** Push a 0..1 value away from the middle so articles don't all converge on 0.5. */
export const contrast = (v, k = 1.6) => clamp01(0.5 + (v - 0.5) * k);

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Direction for a heading (yaw about Y, where yaw 0 = +X) and pitch. */
export const direction = (yaw, pitch) => [
  Math.cos(pitch) * Math.cos(yaw),
  Math.sin(pitch),
  -Math.cos(pitch) * Math.sin(yaw),
];

/** Rotate a local point about Y by yaw (same convention as three.js rotation.y). */
export const rotateY = (p, yaw) => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};

/** Yaw that turns a panel's +Z normal toward direction (dx, dz). */
export const faceYaw = (dx, dz) => Math.atan2(dx, dz);
