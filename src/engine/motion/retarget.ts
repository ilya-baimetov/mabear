// Retargeting (spec §7.4): converts a source skeleton's animated local rotations into our convention —
// Mixamo bone names, T-pose rest with identity local rotations, character faces +z, Y up, left arm along +x.
// Used offline by scripts/bakeMotion.ts; pure math, no Three.js.
import type { Quat } from "../api";
import type { Vec3 } from "../../shared/schema";
import { IDENTITY, qfromTo, qinv, qmul, qnorm, qrot } from "./blend";

/** Our skeleton: bone → parent (null = root). Mixamo names. */
export const SKELETON: Record<string, string | null> = {
  Hips: null,
  Spine: "Hips",
  Spine1: "Spine",
  Spine2: "Spine1",
  Neck: "Spine2",
  Head: "Neck",
  LeftShoulder: "Spine2",
  LeftArm: "LeftShoulder",
  LeftForeArm: "LeftArm",
  LeftHand: "LeftForeArm",
  RightShoulder: "Spine2",
  RightArm: "RightShoulder",
  RightForeArm: "RightArm",
  RightHand: "RightForeArm",
  LeftUpLeg: "Hips",
  LeftLeg: "LeftUpLeg",
  LeftFoot: "LeftLeg",
  LeftToeBase: "LeftFoot",
  RightUpLeg: "Hips",
  RightLeg: "RightUpLeg",
  RightFoot: "RightLeg",
  RightToeBase: "RightFoot",
};
/** Bones in parent-before-child order. */
export const BONES = Object.keys(SKELETON);

/** Our rest (T-pose) bone directions, used to correct non-T-pose source rests (A-pose arms etc.). */
const REST_DIR: Partial<Record<string, Vec3>> = {
  LeftShoulder: [1, 0, 0], LeftArm: [1, 0, 0], LeftForeArm: [1, 0, 0],
  RightShoulder: [-1, 0, 0], RightArm: [-1, 0, 0], RightForeArm: [-1, 0, 0],
  LeftUpLeg: [0, -1, 0], LeftLeg: [0, -1, 0], RightUpLeg: [0, -1, 0], RightLeg: [0, -1, 0],
};

/** Which mapped bone's head defines the direction of a bone (its "child" in our skeleton). */
const DIR_CHILD: Partial<Record<string, string>> = {
  LeftShoulder: "LeftArm", LeftArm: "LeftForeArm", LeftForeArm: "LeftHand",
  RightShoulder: "RightArm", RightArm: "RightForeArm", RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot", RightUpLeg: "RightLeg", RightLeg: "RightFoot",
};

/** Bone-name maps from source rigs to ours. */
export const BONE_MAPS: Record<string, Record<string, string>> = {
  // three.js RobotExpressive (Blender rig; .L = character's left). Body is the pelvis. UPPER BODY ONLY:
  // its legs are a long thigh + foot stub driven by IK and its shoulders are stubs, so legs and shoulders stay
  // unmapped (identity) and the library layers these clips over a Mixamo lower body.
  robot: {
    Hips: "Body", Spine: "Hips", Spine1: "Abdomen", Spine2: "Torso", Neck: "Neck", Head: "Head",
    LeftArm: "UpperArm.L", LeftForeArm: "LowerArm.L", LeftHand: "Palm2.L",
    RightArm: "UpperArm.R", RightForeArm: "LowerArm.R", RightHand: "Palm2.R",
  },
  // Mixamo rigs (Xbot): same names with a prefix.
  mixamo: Object.fromEntries(BONES.map((b) => [b, `mixamorig:${b}`])),
};

/** World transform of every source node at one instant. */
export interface SourcePoseWorld {
  rot: Record<string, Quat>;
  pos: Record<string, Vec3>;
}

export interface RetargetSetup {
  map: Record<string, string>;
  /** source world → our world (fixes facing / up axis) */
  C: Quat;
  /** per-bone rest-direction fix (our rest dir → source rest dir, in our world) */
  F: Record<string, Quat>;
  restRot: Record<string, Quat>;
  restHips: Vec3;
  /** source hips height above the lowest foot at rest (for normalizing root motion) */
  hipHeight: number;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Rotation whose columns are the given orthonormal basis (maps x→bx, y→by, z→bz). */
function quatFromBasis(bx: Vec3, by: Vec3, bz: Vec3): Quat {
  const m00 = bx[0], m10 = bx[1], m20 = bx[2];
  const m01 = by[0], m11 = by[1], m21 = by[2];
  const m02 = bz[0], m12 = bz[1], m22 = bz[2];
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qnorm(q);
}

/** Build the retarget setup from the source rest pose (world transforms). */
export function makeSetup(map: Record<string, string>, rest: SourcePoseWorld): RetargetSetup {
  const P = (b: string) => rest.pos[map[b]];
  // Source frame: left = from right arm to left arm, up = world-ish up from hips to head.
  const left = norm(sub(P("LeftArm"), P("RightArm")));
  const upRaw = norm(sub(P("Head"), P("Hips")));
  const fwd = norm(cross(left, upRaw));
  const up = cross(fwd, left);
  // S maps our axes to source axes; C = S⁻¹ maps source world into ours.
  const S = quatFromBasis(left, up, fwd);
  const C = qinv(S);
  const F: Record<string, Quat> = {};
  for (const b of BONES) {
    const child = DIR_CHILD[b];
    const ours = REST_DIR[b];
    if (!child || !ours || !map[b] || !map[child]) {
      F[b] = IDENTITY;
      continue;
    }
    const src = norm(qrot(C, sub(P(child), P(b))));
    F[b] = qfromTo(ours, src);
  }
  const restRot: Record<string, Quat> = {};
  for (const b of BONES) if (map[b]) restRot[b] = rest.rot[map[b]];
  // lowest point of the legs (or the root when legs are unmapped)
  const feetY = map.LeftFoot && map.RightFoot ? Math.min(qrot(C, P("LeftFoot"))[1], qrot(C, P("RightFoot"))[1]) : 0;
  const hips = qrot(C, P("Hips"));
  return { map, C, F, restRot, restHips: hips, hipHeight: Math.max(1e-6, hips[1] - feetY) };
}

/**
 * Retarget one instant: returns our local bone rotations and the Hips offset normalized by the source
 * hip height (multiply by the target's hip height to get metres).
 */
export function retargetFrame(setup: RetargetSetup, anim: SourcePoseWorld): { bones: Record<string, Quat>; hips: Vec3 } {
  const { map, C, F } = setup;
  const Cinv = qinv(C);
  const G: Record<string, Quat> = {};
  for (const b of BONES) {
    const s = map[b];
    const parent = SKELETON[b];
    if (!s || !anim.rot[s]) {
      // unmapped bone: follow its parent rigidly (identity local)
      G[b] = parent ? G[parent] : IDENTITY;
      continue;
    }
    // world-space delta from the source rest, expressed in our world frame
    const D = qmul(qmul(C, qmul(anim.rot[s], qinv(setup.restRot[b]))), Cinv);
    G[b] = qnorm(qmul(D, F[b]));
  }
  const bones: Record<string, Quat> = {};
  for (const b of BONES) {
    const parent = SKELETON[b];
    bones[b] = qnorm(parent ? qmul(qinv(G[parent]), G[b]) : G[b]);
  }
  const hp = qrot(C, anim.pos[map.Hips]);
  const off = sub(hp, setup.restHips);
  const k = 1 / setup.hipHeight;
  return { bones, hips: [off[0] * k, off[1] * k, off[2] * k] };
}
