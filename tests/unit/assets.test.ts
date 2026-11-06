import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTOR_IDS, FX_IDS, PROP_IDS, TIMES_OF_DAY } from "../../src/shared/schema";
import { MARKS } from "../../src/shared/bible/set";
import { ASSET_MANIFEST, TEST_GLTF_ID, gltfSetElements, isGltf, manifestEntry } from "../../src/engine/assets";
import { SET_ELEMENT_IDS, SET_ELEMENTS, creekDistance, pondRadius, restHeightAt, walkHeightAt } from "../../src/engine/set/bearsYard";
import { PROP_SLOTS, PROP_VISUALS, restPlacement, restingMark } from "../../src/engine/props/props";
import { FX_DEFS } from "../../src/engine/fx/fx";
import { TOD_PRESETS, blendLighting } from "../../src/engine/look";

describe("asset manifest (spec §7.3)", () => {
  it("has an entry for every character", () => {
    for (const id of ACTOR_IDS) {
      const e = manifestEntry(id);
      expect(e, id).toBeDefined();
      expect(e!.kind).toBe("character");
    }
  });

  it("has an entry for every prop", () => {
    for (const id of PROP_IDS) {
      const e = manifestEntry(`prop:${id}`);
      expect(e, id).toBeDefined();
      expect(e!.kind).toBe("prop");
    }
  });

  it("has an entry for every set element, each with a named placement", () => {
    for (const id of SET_ELEMENT_IDS) {
      const e = manifestEntry(`set:${id}`);
      expect(e, id).toBeDefined();
      expect(e!.kind).toBe("set");
      expect(SET_ELEMENTS[id].id).toBe(id);
    }
  });

  it("every entry is well-formed", () => {
    for (const [key, e] of Object.entries(ASSET_MANIFEST)) {
      expect(e.id).toBe(key);
      expect(["character", "set", "prop"]).toContain(e.kind);
      expect(e.source === "procedural" || isGltf(e.source)).toBe(true);
      expect(e.scale).toBeGreaterThan(0);
      expect(e.offset).toHaveLength(3);
      expect(e.label.length).toBeGreaterThan(0);
    }
  });

  it("includes a working glTF example (hidden test character) whose file ships in public/", () => {
    const e = manifestEntry(TEST_GLTF_ID)!;
    expect(e).toBeDefined();
    expect(e.kind).toBe("character");
    expect(e.hidden).toBe(true);
    expect(isGltf(e.source)).toBe(true);
    const url = (e.source as { gltf: string }).gltf;
    expect(existsSync(resolve(__dirname, "../../public", url))).toBe(true);
    expect(e.skeletonMap?.Hips).toBeDefined();
    expect(e.skeletonMap?.RightHand).toBeDefined();
  });

  it("ships generated house and hives, and permits additional replacements", () => {
    expect(gltfSetElements()).toEqual(["house","beehive"]);
    expect(gltfSetElements({ ...ASSET_MANIFEST, "set:van": { ...ASSET_MANIFEST["set:van"], source: { gltf: "x.glb" } } })).toEqual(["house","beehive","van"]);
  });
});

describe("set data", () => {
  it("covers the spec's elements including creek and van, placed at their marks", () => {
    for (const id of ["house", "pond", "pier", "creek", "footbridge", "van", "oak_swing", "hammock", "garden", "beehive", "table", "bench", "woodpile", "big_pine", "bush"] as const) {
      expect(SET_ELEMENT_IDS).toContain(id);
    }
    expect(Math.hypot(SET_ELEMENTS.van.pos[0] - MARKS.van.pos[0], SET_ELEMENTS.van.pos[2] - MARKS.van.pos[1])).toBeLessThan(0.5);
    expect(Math.hypot(SET_ELEMENTS.footbridge.pos[0] - MARKS.creek.pos[0], SET_ELEMENTS.footbridge.pos[2] - MARKS.creek.pos[1])).toBeLessThan(0.5);
  });

  it("the creek passes under the footbridge and feeds the pond", () => {
    expect(creekDistance(12, 9)).toBeLessThan(0.3);
    const th = Math.atan2(13.5 - 10, -7.1 + 8);
    expect(Math.hypot(-7.1 + 8, 13.5 - 10)).toBeLessThan(pondRadius(th) + 0.3);
  });

  it("pond_shore and the pier start are dry; the pier end is over water", () => {
    const r = (x: number, z: number) => Math.hypot(x + 8, z - 10) - pondRadius(Math.atan2(z - 10, x + 8));
    expect(r(MARKS.pond_shore.pos[0], MARKS.pond_shore.pos[1])).toBeGreaterThan(0);
    expect(r(-4.6, 7.2)).toBeGreaterThan(0);
    expect(r(MARKS.pier.pos[0], MARKS.pier.pos[1])).toBeLessThan(0);
  });

  it("walkable heights: porch deck, ramped steps, pier, footbridge; ground elsewhere", () => {
    expect(walkHeightAt(MARKS.porch.pos[0], MARKS.porch.pos[1])).toBe(0);
    expect(walkHeightAt(-6,-4.2)).toBeCloseTo(.22,2);
    expect(walkHeightAt(-6, -1.7)).toBe(0);
    expect(walkHeightAt(-6, -1.7)).toBeLessThan(0.3);
    expect(walkHeightAt(0, 0)).toBe(0);
    expect(walkHeightAt(MARKS.pier.pos[0], MARKS.pier.pos[1])).toBeGreaterThan(0.2);
    expect(walkHeightAt(12, 9)).toBeGreaterThan(0.1);
    expect(restHeightAt(2, 1.5)).toBeCloseTo(0.78, 2);
  });
});

describe("props", () => {
  it("every PropId has a visual and a home slot on its home mark", () => {
    for (const id of PROP_IDS) expect(PROP_VISUALS[id], id).toBeDefined();
    for (const [id, slot] of Object.entries(PROP_SLOTS)) expect(MARKS[slot!.mark], id).toBeDefined();
  });

  it("recognises a prop resting at a mark and snaps it to the set layout; in-flight props are untouched", () => {
    expect(restingMark([2.2, 0.78, 1.7])).toBe("table");
    expect(restingMark([2.2, 1.3, 1.7])).toBeNull();
    const p = restPlacement("teapot", [2.3, 0.78, 1.4]);
    expect(p.pos[1]).toBeGreaterThan(1.1); // on top of the samovar
    const fly = restPlacement("ball", [3, 1.2, 4]);
    expect(fly.pos).toEqual([3, 1.2, 4]);
  });
});

describe("look + fx", () => {
  it("lighting blend is pure, clamped and hits the presets at the ends", () => {
    for (const a of TIMES_OF_DAY) {
      for (const b of TIMES_OF_DAY) {
        expect(blendLighting(a, b, 0).skyTop).toBe(TOD_PRESETS[a].skyTop);
        expect(blendLighting(a, b, 1).skyTop).toBe(TOD_PRESETS[b].skyTop);
        expect(blendLighting(a, b, 0.37)).toEqual(blendLighting(a, b, 0.37));
      }
    }
    expect(blendLighting("day", "night", -2).windowGlow).toBe(TOD_PRESETS.day.windowGlow);
    const mid = blendLighting("day", "night", 0.5);
    expect(mid.windowGlow).toBeGreaterThan(0);
    expect(mid.windowGlow).toBeLessThan(1);
  });

  it("every FxId has a particle definition", () => {
    for (const id of FX_IDS) expect(FX_DEFS[id], id).toBeDefined();
  });
});
