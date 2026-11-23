import type { Vec3 } from "./schema";

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x >= e1 ? 1 : 0;
  return smooth((x - e0) / (e1 - e0));
}

export const easeInOut = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};

/** 0 -> 1 -> 0 bell over [a, b] with smooth ramps of width r. */
export function window01(t: number, a: number, b: number, r: number): number {
  if (t <= a || t >= b) return 0;
  return Math.min(smooth((t - a) / r), smooth((b - t) / r));
}

export function wrapAngle(rad: number): number {
  let a = (rad + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

/** Interpolate angles along the shortest arc (a spin's 2pi end blends to 0 without unwinding). */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}
