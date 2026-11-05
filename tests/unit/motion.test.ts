import { describe, expect, it } from "vitest";
import { ACTOR_IDS, VERBS, type ActorId, type Verb } from "../../src/shared/schema";
import { GRAMMAR } from "../../src/shared/grammar";
import { VERB_CLIPS, VERB_IMPLS, VERB_KIND, STYLES, evaluatePose, type VerbCtx } from "../../src/engine/motion/library";
import { CLIPS } from "../../src/engine/motion/clips.generated";
import { BONE_MAPS, BONES, SKELETON, makeSetup, retargetFrame, type SourcePoseWorld } from "../../src/engine/motion/retarget";
import { IDENTITY, blendLayers, qaxis, qmul, qrot, qslerp, type PoseLayer } from "../../src/engine/motion/blend";
import type { Quat } from "../../src/engine/api";
import type { Vec3 } from "../../src/shared/schema";

function ctxFor(actor: ActorId, verb: Verb, lt: number): VerbCtx {
  const dur = GRAMMAR[verb].baseDuration;
  return {
    actor, style: STYLES[actor], dur, emotion: "happy", t: 3 + lt,
    dist: GRAMMAR[verb].group === "locomotion" ? lt * 1.1 : 0, turned: 0,
    fromPosture: "stand", posture: "stand", targetLocal: [0.4, 0.2, 1], seat: 0,
  };
}

function finiteLayer(L: PoseLayer) {
  for (const [b, q] of Object.entries(L.bones)) {
    expect(q.every(Number.isFinite), `${b} finite`).toBe(true);
    expect(Math.abs(Math.hypot(...q) - 1), `${b} unit`).toBeLessThan(1e-3);
  }
  expect(L.hipsOffset.every(Number.isFinite)).toBe(true);
}

describe("motion library", () => {
  it("implements every verb in VERBS (grammar coverage)", () => {
    for (const v of VERBS) {
      expect(typeof VERB_IMPLS[v], v).toBe("function");
      expect(VERB_KIND[v], v).toBeDefined();
    }
    expect(Object.keys(VERB_IMPLS).sort()).toEqual([...VERBS].sort());
  });

  it("every verb yields finite unit-quaternion poses for both characters over its duration", () => {
    for (const v of VERBS) {
      for (const a of ACTOR_IDS) {
        const dur = GRAMMAR[v].baseDuration;
        for (const k of [0, 0.13, 0.5, 0.87, 1]) {
          const { layer, breathe } = evaluatePose(v, k * dur, {}, ctxFor(a, v, k * dur));
          finiteLayer(layer);
          expect(breathe).toBeGreaterThanOrEqual(0);
          expect(breathe).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("uses open motion clips for at least 15 verbs (spec §7.4)", () => {
    const clipVerbs = VERBS.filter((v) => VERB_KIND[v] !== "procedural");
    expect(clipVerbs.length).toBeGreaterThanOrEqual(15);
    for (const v of clipVerbs) for (const c of VERB_CLIPS[v] ?? []) expect(CLIPS[c], `${v} → ${c}`).toBeDefined();
  });

  it("baked clips hold valid keyframes on our bone names", () => {
    const names = Object.keys(CLIPS);
    expect(names.length).toBeGreaterThanOrEqual(10);
    for (const n of names) {
      const c = CLIPS[n];
      expect(c.hips.length).toBe(c.frames * 3);
      for (const [b, arr] of Object.entries(c.bones)) {
        expect(BONES).toContain(b);
        expect(arr.length === 4 || arr.length === c.frames * 4).toBe(true);
        for (let i = 0; i < arr.length; i += 4) expect(Math.abs(Math.hypot(arr[i], arr[i + 1], arr[i + 2], arr[i + 3]) - 1)).toBeLessThan(2e-3);
      }
    }
  });

  it("is pure: same inputs → identical pose", () => {
    for (const v of ["walk_to", "idle", "facepalm", "dance", "swing"] as Verb[]) {
      const a = evaluatePose(v, 0.7, {}, ctxFor("bear", v, 0.7));
      const b = evaluatePose(v, 0.7, {}, ctxFor("bear", v, 0.7));
      expect(a).toEqual(b);
    }
  });

  it("holds postures: a sleeping actor stays lying whatever the verb; sitting actors gesture with the upper body", () => {
    const ctx = { ...ctxFor("bear", "wave", 0.5), fromPosture: "sleep" as const, posture: "sleep" as const };
    const lying = evaluatePose("wave", 0.5, {}, ctx).layer;
    const hipsUp = qrot(lying.bones.Hips ?? IDENTITY, [0, 1, 0]);
    expect(Math.abs(hipsUp[1])).toBeLessThan(0.3); // spine is horizontal
    const sitCtx = { ...ctxFor("masha", "wave", 0.5), fromPosture: "sit" as const, posture: "sit" as const, seat: 0.45 };
    const sitting = evaluatePose("wave", 0.5, {}, sitCtx).layer;
    const thigh = qrot(sitting.bones.LeftUpLeg ?? IDENTITY, [0, -1, 0]);
    expect(thigh[2]).toBeGreaterThan(0.8); // thigh points forward
  });

  it("Bear is weightier: lower hips while standing", () => {
    const b = evaluatePose("idle", 0.5, {}, ctxFor("bear", "idle", 0.5)).layer;
    expect(b.hipsOffset[1]).toBeLessThan(0);
  });
});

describe("retargeting", () => {
  function tPose(rotate: Quat): SourcePoseWorld {
    // a synthetic Mixamo T-pose, optionally rotated as a whole (e.g. facing +x)
    const off: Record<string, Vec3> = {
      Hips: [0, 1, 0], Spine: [0, 0.1, 0], Spine1: [0, 0.1, 0], Spine2: [0, 0.1, 0], Neck: [0, 0.15, 0], Head: [0, 0.1, 0],
      LeftShoulder: [0.05, 0.1, 0], LeftArm: [0.1, 0, 0], LeftForeArm: [0.25, 0, 0], LeftHand: [0.25, 0, 0],
      RightShoulder: [-0.05, 0.1, 0], RightArm: [-0.1, 0, 0], RightForeArm: [-0.25, 0, 0], RightHand: [-0.25, 0, 0],
      LeftUpLeg: [0.1, -0.05, 0], LeftLeg: [0, -0.45, 0], LeftFoot: [0, -0.45, 0], LeftToeBase: [0, -0.05, 0.1],
      RightUpLeg: [-0.1, -0.05, 0], RightLeg: [0, -0.45, 0], RightFoot: [0, -0.45, 0], RightToeBase: [0, -0.05, 0.1],
    };
    const rot: Record<string, Quat> = {};
    const pos: Record<string, Vec3> = {};
    for (const b of BONES) {
      const p = SKELETON[b];
      const local = qrot(rotate, off[b]);
      const base = p ? pos[`mixamorig:${p}`] : [0, 0, 0];
      pos[`mixamorig:${b}`] = [base[0] + local[0], base[1] + local[1], base[2] + local[2]];
      rot[`mixamorig:${b}`] = rotate;
    }
    return { rot, pos };
  }

  it("maps a source rest pose to identity, whatever way the source faces", () => {
    for (const r of [IDENTITY, qaxis([0, 1, 0], Math.PI / 2), qaxis([1, 0, 0], -Math.PI / 2)]) {
      const rest = tPose(r);
      const setup = makeSetup(BONE_MAPS.mixamo, rest);
      const out = retargetFrame(setup, rest);
      for (const b of BONES) {
        const q = out.bones[b];
        expect(Math.abs(q[3]), `${b}`).toBeGreaterThan(0.9999);
      }
      expect(Math.hypot(...out.hips)).toBeLessThan(1e-9);
    }
  });

  it("carries a forearm bend across a rotated source", () => {
    const facing = qaxis([0, 1, 0], Math.PI / 2);
    const rest = tPose(facing);
    const setup = makeSetup(BONE_MAPS.mixamo, rest);
    const bend = qaxis([0, 1, 0], -0.8); // our convention: left elbow flexes forward
    const anim: SourcePoseWorld = { rot: { ...rest.rot }, pos: rest.pos };
    // in the source world the same bend is conjugated by its facing
    const srcBend = qmul(qmul(facing, bend), [-facing[0], -facing[1], -facing[2], facing[3]]);
    for (const b of ["LeftForeArm", "LeftHand"]) anim.rot[`mixamorig:${b}`] = qmul(srcBend, rest.rot[`mixamorig:${b}`]);
    const out = retargetFrame(setup, anim);
    const q = out.bones.LeftForeArm;
    const dot = Math.abs(q[0] * bend[0] + q[1] * bend[1] + q[2] * bend[2] + q[3] * bend[3]);
    expect(dot).toBeGreaterThan(0.9999);
    expect(Math.abs(out.bones.LeftHand[3])).toBeGreaterThan(0.9999);
  });
});

describe("blend", () => {
  it("crossfades between layers with slerp endpoints", () => {
    const a: PoseLayer = { bones: { Head: qaxis([0, 1, 0], 0.5) }, hipsOffset: [0, 0, 0] };
    const b: PoseLayer = { bones: { Head: qaxis([0, 1, 0], -0.5) }, hipsOffset: [0, 1, 0] };
    expect(blendLayers(a, b, 0)).toBe(a);
    expect(blendLayers(a, b, 1)).toBe(b);
    const m = blendLayers(a, b, 0.5);
    expect(Math.abs(m.bones.Head[3])).toBeGreaterThan(0.9999);
    expect(m.hipsOffset[1]).toBeCloseTo(0.5);
    expect(qslerp(IDENTITY, b.bones.Head, 0.5)[1]).toBeCloseTo(Math.sin(-0.125), 5);
  });
});
