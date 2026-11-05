import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildMasha, MASHA_LOOK } from "../../src/engine/characters/masha";
import { buildBear, BEAR_LOOK } from "../../src/engine/characters/bear";
import { buildWolf, WOLF_LOOK } from "../../src/engine/characters/wolf";
import { MIXAMO_BONES, restFrame } from "../../src/engine/characters/rig";
import { EMOTION_PRESETS, mouthShapeFor, VISEME_SHAPES } from "../../src/engine/characters/face";
import { EMOTIONS, VISEMES } from "../../src/shared/schema";
import type { CharacterRig } from "../../src/engine/api";

const builders: Array<[string, () => CharacterRig, number]> = [
  ["masha", buildMasha, 1.0],
  ["bear", buildBear, 2.4],
  ["wolf_a", () => buildWolf("a"), WOLF_LOOK.variants.a.height],
  ["wolf_b", () => buildWolf("b"), WOLF_LOOK.variants.b.height],
];

/** Draw calls of one character: one per visible mesh, plus one per shadow caster (key-light shadow pass). */
function drawCalls(rig: CharacterRig): { meshes: number; calls: number; tris: number } {
  let meshes = 0;
  let calls = 0;
  let tris = 0;
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    calls += m.castShadow ? 2 : 1;
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute("position").count) / 3;
  });
  return { meshes, calls, tris };
}

function bbox(rig: CharacterRig): THREE.Box3 {
  rig.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(rig.root);
}

describe.each(builders)("%s rig", (id, build, height) => {
  const rig = build();

  it("builds in node with an id and a height", () => {
    expect(rig.id).toBe(id);
    expect(rig.height).toBeCloseTo(height, 5);
  });

  it("has every Mixamo bone with identity rest quaternions", () => {
    for (const n of MIXAMO_BONES) {
      const b = rig.bones[n];
      expect(b, n).toBeInstanceOf(THREE.Bone);
      expect(b.name).toBe(n);
      expect(b.quaternion.equals(new THREE.Quaternion()), n).toBe(true);
      expect(rig.rest[n].equals(new THREE.Quaternion()), n).toBe(true);
    }
  });

  it("follows the T-pose convention: left arm along +x, faces +z", () => {
    rig.apply(restFrame());
    const l = new THREE.Vector3().setFromMatrixPosition(rig.bones.LeftHand.matrixWorld);
    const r = new THREE.Vector3().setFromMatrixPosition(rig.bones.RightHand.matrixWorld);
    const s = new THREE.Vector3().setFromMatrixPosition(rig.bones.LeftArm.matrixWorld);
    expect(l.x).toBeGreaterThan(s.x);
    expect(r.x).toBeLessThan(-s.x + 1e-6);
    expect(Math.abs(l.y - s.y)).toBeLessThan(1e-6);
    const toe = new THREE.Vector3().setFromMatrixPosition(rig.bones.LeftToeBase.matrixWorld);
    const foot = new THREE.Vector3().setFromMatrixPosition(rig.bones.LeftFoot.matrixWorld);
    expect(toe.z).toBeGreaterThan(foot.z);
  });

  it("is about the specified height with feet on the ground", () => {
    rig.apply(restFrame());
    const b = bbox(rig);
    expect(b.max.y).toBeGreaterThan(height * 0.95);
    expect(b.max.y).toBeLessThan(height * 1.05);
    expect(Math.abs(b.min.y)).toBeLessThan(0.03 * height);
  });

  it("applies frames (pose, hips offset, root, opacity, face) without throwing", () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.2);
    for (const emotion of EMOTIONS) {
      for (const viseme of VISEMES) {
        rig.apply(
          restFrame({
            pos: [1, 0, 2],
            yaw: 0.7,
            opacity: 0.5,
            bones: { LeftArm: [q.x, q.y, q.z, q.w], LeftUpLeg: [0.3, 0, 0, 0.95] },
            hipsOffset: [0, -0.05, 0],
            face: { emotion, lidClose: 0.3, viseme, visemeWeight: 0.8, lookAt: [0, 1, 5], browRaise: 0.2 },
            posture: "stand",
            secondary: { sway: 0.5, jiggle: 0.5, breathe: 0.7 },
          }),
        );
      }
    }
    expect(rig.root.position.toArray()).toEqual([1, 0, 2]);
    expect(rig.root.rotation.y).toBeCloseTo(0.7);
    // missing bones go back to identity
    rig.apply(restFrame());
    expect(rig.bones.LeftArm.quaternion.equals(new THREE.Quaternion())).toBe(true);
    expect(rig.root.visible).toBe(true);
    rig.apply(restFrame({ opacity: 0 }));
    expect(rig.root.visible).toBe(false);
    rig.apply(restFrame());
  });

  it("has a hand socket on RightHand", () => {
    expect(rig.handSocket.parent).toBe(rig.bones.RightHand);
  });

  it("stays within the draw-call and triangle budgets (merged per material, ≤ ~25k triangles)", () => {
    const { meshes, calls, tris } = drawCalls(rig);
    console.log(`${id}: ${meshes} meshes, ${calls} draw calls incl. shadow, ${Math.round(tris)} triangles`);
    expect(calls).toBeLessThanOrEqual(id.startsWith("wolf") ? 8 : 14);
    expect(tris).toBeLessThan(32_000);
  });

  it("B11: fades never change a material's shader program (no compile at the first fade)", () => {
    const mats = new Set<THREE.Material>();
    rig.root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) mats.add(x);
    });
    rig.apply(restFrame());
    const before = [...mats].map((m) => ({ m, v: m.version, t: m.transparent }));
    for (const m of mats) expect(m.transparent, m.name || m.type).toBe(true); // transparent-capable from the start
    for (const o of [1, 0.6, 0.02, 0, 0.5, 1]) rig.apply(restFrame({ opacity: o }));
    for (const b of before) {
      expect(b.m.version, b.m.name || b.m.type).toBe(b.v); // no needsUpdate → same program
      expect(b.m.transparent).toBe(b.t);
    }
    rig.apply(restFrame({ opacity: 0.5 }));
    for (const m of mats) expect(m.depthWrite).toBe(false);
    rig.apply(restFrame());
    for (const m of mats) {
      expect(m.depthWrite).toBe(true);
      expect(m.opacity).toBe(1);
    }
  });

  it("skins every body mesh to bones that live under the character root", () => {
    rig.root.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      for (const b of sm.skeleton.bones) {
        let p: THREE.Object3D | null = b;
        while (p && p !== rig.root) p = p.parent;
        expect(p, b.name).toBe(rig.root);
      }
    });
  });
});

describe("cast budget", () => {
  it("all four characters together stay well inside the scene's 150 draw calls", () => {
    const total = [buildMasha(), buildBear(), buildWolf("a"), buildWolf("b")].reduce((s, r) => s + drawCalls(r).calls, 0);
    console.log(`cast: ${total} draw calls incl. shadows`);
    expect(total).toBeLessThanOrEqual(40);
  });
});

describe("face presets", () => {
  it("covers all 12 emotions and 7 visemes", () => {
    for (const e of EMOTIONS) expect(EMOTION_PRESETS[e]).toBeDefined();
    for (const v of VISEMES) expect(v in VISEME_SHAPES).toBe(true);
  });
  it("visemes open the mouth, rest keeps the emotion shape", () => {
    expect(mouthShapeFor("neutral", "open_wide", 1).open).toBeGreaterThan(0.8);
    expect(mouthShapeFor("happy", "rest", 1)).toEqual(EMOTION_PRESETS.happy.mouth);
    expect(mouthShapeFor("neutral", "o", 1).round).toBe(1);
  });
  it("looks match the spec heights", () => {
    expect(MASHA_LOOK.height).toBe(1.0);
    expect(BEAR_LOOK.height).toBe(2.4);
    // the Wolves: about Bear's shoulder height, two slightly different heights
    for (const vv of Object.values(WOLF_LOOK.variants)) {
      expect(vv.height).toBeGreaterThan(1.85);
      expect(vv.height).toBeLessThan(2.15);
    }
    expect(WOLF_LOOK.variants.a.height).not.toBe(WOLF_LOOK.variants.b.height);
  });
});
