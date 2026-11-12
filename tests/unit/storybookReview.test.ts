import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { store } from "../../src/app/store";
import { castCloseup } from "../../src/app/castCamera";
import { FIXTURES } from "../../src/director/fixtures";
import { evaluate } from "../../src/engine/player/evaluate";
import { buildMasha } from "../../src/engine/characters/masha";
import { buildBear } from "../../src/engine/characters/bear";
import { applyCarryContacts } from "../../src/engine/characters/carryContacts";
import type { CharacterRig } from "../../src/engine/api";
import { planPath, segmentClear, interiorSegmentClear } from "../../src/compiler/path";
import { standPos } from "../../src/compiler/compile";
import { MARKS, isInsideHouse } from "../../src/shared/bible/set";
import type { ActorId, MarkId } from "../../src/shared/schema";

describe("language changes preserve authored work", () => {
  beforeEach(() => {
    store.newStory();
    store.setLang("en");
    store.loadFixtureById("pancake_morning");
  });

  it("translates an untouched example", () => {
    store.setLang("ru");
    const ru = FIXTURES.find(f => f.id === "pancake_morning" && f.lang === "ru")!;
    expect(store.getState().title).toBe(ru.title);
    expect(store.getState().paragraphs.map(p => p.text)).toEqual(ru.paragraphs.map(p => p.text));
  });

  it.each(["edit", "clear", "delete", "add", "title", "remix"])("preserves %s before Play", (change) => {
    const id = store.getState().paragraphs[0].id;
    if (change === "edit") store.editText(id, "Masha has a completely new adventure.");
    if (change === "clear") store.editText(id, "");
    if (change === "delete") store.deleteParagraph(id);
    if (change === "add") store.addParagraph();
    if (change === "title") store.setTitle("My new adventure");
    if (change === "remix") store.setRemix(id, { cameraSeed: 2 });
    const before = store.getState();
    store.setLang("ru");
    expect(store.getState().lang).toBe("ru");
    expect(store.getState().episodeId).toBe(before.episodeId);
    expect(store.getState().title).toBe(before.title);
    expect(store.getState().paragraphs).toEqual(before.paragraphs);
  });
});

describe("cast focus follows the rendered pose", () => {
  it("frames Masha above Bear's shoulders after Bear's nap", () => {
    store.loadFixture(FIXTURES.find(f => f.id === "bears_nap" && f.lang === "en")!);
    const timeline = store.getState().timeline;
    const actor = evaluate(timeline, timeline.duration).actors.masha;
    expect(actor.posture).toBe("carried");
    const rig = buildMasha();
    try {
      rig.apply(actor);
      const focus = castCloseup(rig, actor);
      expect(focus.look[1]).toBeGreaterThan(actor.pos[1] + 0.3);
      expect(focus.look[1]).toBeGreaterThan(1.9);
    } finally { rig.dispose(); }
  });

  it("keeps both of carried Masha's eyes visible past Bear's actual skinned head", () => {
    store.loadFixture(FIXTURES.find(f => f.id === "bears_nap" && f.lang === "en")!);
    const timeline = store.getState().timeline;
    const masha = buildMasha(), bear = buildBear();
    const times = [timeline.duration, timeline.duration + 2, timeline.duration + 7];
    for (let t = 0; t < timeline.duration; t += 2) {
      const frame = evaluate(timeline, t);
      if (frame.actors.masha.posture === "carried" && frame.actors.masha.pos[1] > 1.85) times.push(t);
    }
    try {
      for (const t of times) {
        const frame = evaluate(timeline, t);
        masha.apply(frame.actors.masha);
        bear.apply(frame.actors.bear);
        // Match the stage: the carry fit runs after both rigs are posed.
        applyCarryContacts({masha,bear} as Record<ActorId,CharacterRig>,frame);
        bear.root.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).computeBoundingSphere(); });
        const camera = castCloseup(masha, frame.actors.masha, 0.18);
        const origin = new THREE.Vector3(...camera.pos);
        for (const eye of ["eyeL", "eyeR"]) {
          const target = masha.root.getObjectByName(eye)!.getWorldPosition(new THREE.Vector3());
          const direction = target.clone().sub(origin);
          const ray = new THREE.Raycaster(origin, direction.clone().normalize(), 0, direction.length() - 0.01);
          expect(ray.intersectObject(bear.root, true), `${eye} blocked at ${t}s`).toHaveLength(0);
        }
      }
    } finally { masha.dispose(); bear.dispose(); }
  });

  it("frames Bear's lowered, displaced head while he sleeps", () => {
    store.loadFixture(FIXTURES.find(f => f.id === "bears_nap" && f.lang === "en")!);
    const timeline = store.getState().timeline;
    const actor = Array.from({ length: Math.ceil(timeline.duration) }, (_, t) => evaluate(timeline, t).actors.bear).filter(a => a.posture === "sleep").at(-1)!;
    expect(actor).toBeDefined();
    const rig = buildBear();
    try {
      rig.apply(actor);
      const focus = castCloseup(rig, actor);
      const eyes = rig.root.getObjectByName("eyeL")!.getWorldPosition(new THREE.Vector3())
        .add(rig.root.getObjectByName("eyeR")!.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
      expect(Math.hypot(focus.look[0] - eyes.x, focus.look[1] - eyes.y, focus.look[2] - eyes.z)).toBeLessThan(0.1);
      expect(focus.look[1]).toBeLessThan(1.3);
    } finally { rig.dispose(); }
  });
});

describe("scenery-safe routes", () => {
  it("routes around the far side of the van without crossing its body", () => {
    const path = planPath([10, -8], standPos("van"));
    expect(path.at(-1)).toEqual(standPos("van"));
    expect(path.slice(1).every((p, i) => segmentClear(path[i], p))).toBe(true);
  });

  it("keeps all named destinations reachable using clear segments", () => {
    for (const from of Object.keys(MARKS) as MarkId[]) for (const to of Object.keys(MARKS) as MarkId[]) {
      const path = planPath(standPos(from), standPos(to));
      expect(path.at(-1), `${from} → ${to}`).toEqual(standPos(to));
      const fromInside=isInsideHouse(...standPos(from)),toInside=isInsideHouse(...standPos(to));
      if(fromInside!==toInside){
        // Different stages have no swept ground segment; compiler tests verify
        // the short scene cut and its evaluated endpoints.
        expect(path,`${from} → ${to} cut`).toEqual([standPos(from),standPos(to)]);
      }else{
        const clear=fromInside?interiorSegmentClear:segmentClear;
        expect(path.slice(1).every((p,i)=>clear(path[i],p)),`${from} → ${to}`).toBe(true);
      }
    }
  });

  it("connects the walkable pocket southwest of the pond without crossing the water", () => {
    // The former target is now part of the separately staged kitchen. Keep
    // this regression about an exterior destination west of that floor.
    const to: [number, number] = [-16.92, -12.35];
    expect(isInsideHouse(...to)).toBe(false);
    const path = planPath([-10.48, 12.88], to);
    expect(path.at(-1)).toEqual(to);
    expect(path.slice(1).every((p, i) => segmentClear(path[i], p))).toBe(true);
  });
});
