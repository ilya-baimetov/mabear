// Pose math and blending (spec §7.4): quaternion helpers, 0.2 s crossfades, additive layers
// (breathing, look-at). Pure functions over plain arrays — no Three.js, no React.
import type { Quat } from "../api";
import type { Emotion, Vec3, Viseme } from "../../shared/schema";

export type Pose = Record<string, Quat>;

/** One evaluated layer of motion: local bone rotations (identity rest), Hips translation, face hints. */
export interface PoseLayer {
  bones: Pose;
  /** extra Hips translation in metres */
  hipsOffset: Vec3;
  /** extra yaw (radians) added to the actor's facing (spin, sulk turn-away) */
  yawOffset?: number;
  face?: { emotion?: Emotion; lidClose?: number; browRaise?: number; viseme?: Viseme; visemeWeight?: number };
  /** secondary-motion driver hints 0..1 */
  sway?: number;
  /** extra height (m) added AFTER the ground lock (hops, jump flight) */
  lift?: number;
  /** "lock" = feet pinned to the ground (default for standing verbs); "floor" = only prevent sinking (runs with
   *  flight phases); "free" = no ground contact handling (lying, sitting, airborne) */
  ground?: "lock" | "floor" | "free";
  /** 0..1 how much of the ground lock applies (transitions between lying/sitting and standing) */
  groundW?: number;
}

export const IDENTITY: Quat = [0, 0, 0, 1];
export const CROSSFADE_S = 0.2;

// ---------- quaternion helpers ([x, y, z, w], Hamilton; mul(a, b) applies b first, like THREE) ----------

export function qmul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function qinv(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function qnorm(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function qaxis(axis: Vec3, angle: number): Quat {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(angle / 2) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** Euler XYZ (intrinsic, same order as THREE's default 'XYZ'). Angles in radians. */
export function qeuler(x: number, y: number, z: number): Quat {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

export function qslerp(a: Quat, b: Quat, t: number): Quat {
  if (t <= 0) return a;
  if (t >= 1) return b;
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (cos > 0.9995) {
    return qnorm([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/** Rotate vector v by quaternion q. */
export function qrot(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

/** Shortest-arc rotation taking unit vector a onto unit vector b. */
export function qfromTo(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    // opposite: rotate π about any perpendicular axis
    const ax: Vec3 = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[1], a[0], 0];
    return qaxis(ax, Math.PI);
  }
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return qnorm([c[0], c[1], c[2], 1 + d]);
}

/** Rotation raised to a power: same axis, angle × s (s may exceed 1 — extrapolates, unlike qslerp). */
export function qpow(q: Quat, s: number): Quat {
  const w = Math.max(-1, Math.min(1, q[3]));
  const sign = w < 0 ? -1 : 1;
  const half = Math.acos(w * sign);
  const sinHalf = Math.sin(half);
  if (sinHalf < 1e-6) return IDENTITY;
  const k = (Math.sin(half * s) / sinHalf) * sign;
  return [q[0] * k, q[1] * k, q[2] * k, Math.cos(half * s)];
}

/** Scale a rotation's angle (t=0 → identity, t=1 → q). Used for additive weights. */
export function qscale(q: Quat, t: number): Quat {
  return qslerp(IDENTITY, q, t);
}

export function round4(q: Quat): Quat {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return [r(q[0]), r(q[1]), r(q[2]), r(q[3])];
}

// ---------- scalar helpers ----------

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
/** 0 → 1 → 0 bell over [a, b] with smooth ramps of width r. */
export function window01(t: number, a: number, b: number, r: number): number {
  if (t <= a || t >= b) return 0;
  return Math.min(smooth((t - a) / r), smooth((b - t) / r));
}
/** Interpolate angles along the shortest arc (a spin's 2π end blends to 0 without unwinding). */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}
export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// ---------- layer operations ----------

export function emptyLayer(): PoseLayer {
  return { bones: {}, hipsOffset: [0, 0, 0] };
}

/** Crossfade two full layers (slerp per bone; missing bones are identity). */
export function blendLayers(a: PoseLayer, b: PoseLayer, t: number): PoseLayer {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const bones: Pose = {};
  const names = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)]);
  for (const n of names) bones[n] = qslerp(a.bones[n] ?? IDENTITY, b.bones[n] ?? IDENTITY, t);
  return {
    bones,
    hipsOffset: lerp3(a.hipsOffset, b.hipsOffset, t),
    yawOffset: lerpAngle(a.yawOffset ?? 0, b.yawOffset ?? 0, t),
    face: t < 0.5 ? a.face : b.face,
    sway: lerp(a.sway ?? 0, b.sway ?? 0, t),
    lift: lerp(a.lift ?? 0, b.lift ?? 0, t),
    ground: t < 0.5 ? a.ground : b.ground,
    groundW: lerp(a.groundW ?? 1, b.groundW ?? 1, t),
  };
}

/** Additive: rotate each bone of `base` by `add` (local, post-multiplied) with weight w. */
export function addLayer(base: PoseLayer, add: Pose, w = 1, hips?: Vec3): PoseLayer {
  const bones: Pose = { ...base.bones };
  for (const n of Object.keys(add)) {
    const q = w === 1 ? add[n] : qscale(add[n], w);
    bones[n] = qmul(bones[n] ?? IDENTITY, q);
  }
  const h = hips ? [base.hipsOffset[0] + hips[0] * w, base.hipsOffset[1] + hips[1] * w, base.hipsOffset[2] + hips[2] * w] as Vec3 : base.hipsOffset;
  return { ...base, bones, hipsOffset: h };
}

/** Override selected bones with `over` at weight w (slerp toward the override). */
export function overrideLayer(base: PoseLayer, over: Pose, w = 1): PoseLayer {
  const bones: Pose = { ...base.bones };
  for (const n of Object.keys(over)) bones[n] = qslerp(bones[n] ?? IDENTITY, over[n], w);
  return { ...base, bones };
}

/** Breathing: small chest/shoulder rise on Spine1/Spine2, at `rate` breaths per second. */
export function breathingPose(t: number, rate: number, depth: number): { pose: Pose; breathe: number } {
  const ph = Math.sin(t * rate * Math.PI * 2);
  const breathe = 0.5 + 0.5 * ph;
  const a = depth * ph;
  return {
    breathe,
    pose: {
      Spine1: qaxis([1, 0, 0], -0.02 * a),
      Spine2: qaxis([1, 0, 0], -0.025 * a),
      LeftShoulder: qaxis([0, 0, 1], 0.03 * a),
      RightShoulder: qaxis([0, 0, 1], -0.03 * a),
    },
  };
}

/**
 * Look-at layer: turns Neck and Head toward a direction given in the actor's local frame
 * (x = actor's left, y = up, z = forward). Yaw is clamped to ±70°, pitch to ±30°; neck takes 40%.
 */
export function lookAtPose(dirLocal: Vec3, weight: number): Pose {
  if (weight <= 0) return {};
  const horiz = Math.hypot(dirLocal[0], dirLocal[2]);
  const rawYaw = Math.atan2(dirLocal[0], dirLocal[2]);
  // targets behind the actor fade out instead of flipping the head from one shoulder to the other
  weight *= smooth((2.4 - Math.abs(rawYaw)) / 0.9);
  if (weight <= 0) return {};
  const yaw = clamp(rawYaw, -1.22, 1.22) * weight;
  const pitch = clamp(-Math.atan2(dirLocal[1], horiz || 1e-6), -0.52, 0.52) * weight;
  const neck = qmul(qaxis([0, 1, 0], yaw * 0.4), qaxis([1, 0, 0], pitch * 0.4));
  const head = qmul(qaxis([0, 1, 0], yaw * 0.6), qaxis([1, 0, 0], pitch * 0.6));
  return { Neck: neck, Head: head };
}

/** Apply a look-at as a pre-rotation on Neck/Head (so it composes with the clip's own head motion). */
export function applyLookAt(base: PoseLayer, look: Pose): PoseLayer {
  const bones: Pose = { ...base.bones };
  for (const n of Object.keys(look)) bones[n] = qmul(look[n], bones[n] ?? IDENTITY);
  return { ...base, bones };
}
