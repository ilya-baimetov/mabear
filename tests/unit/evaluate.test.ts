import { describe, expect, it } from "vitest";
import { evaluate, DEFAULT_CAMERA } from "../../src/engine/player/evaluate";
import { initialWorldState, cloneWorldState } from "../../src/compiler/worldState";
import { MARKS } from "../../src/shared/bible/set";
import type { ActorClip, Segment, Timeline, Vec2, WorldState } from "../../src/shared/schema";

function seg(start: WorldState, end: WorldState, duration: number, clips: Pick<Segment["actorClips"], "masha" | "bear"> & Partial<Segment["actorClips"]>, extra: Partial<Segment> = {}): Segment {
  return {
    paragraphId: "p", version: 1, duration, startState: start, endState: end, actorClips: { wolf_a: [], wolf_b: [], ...clips },
    dialogue: [], emotes: [], foley: [], camera: [], sfx: [], music: [], ambience: [], ducking: [], lighting: [], fx: [],
    ...extra,
  };
}
function clip(start: number, dur: number, verb: ActorClip["verb"], params: ActorClip["params"] = {}, emotion: ActorClip["emotion"] = "happy"): ActorClip {
  return { start, dur, verb, emotion, params };
}
function timeline(...segs: Segment[]): Timeline {
  let off = 0;
  const segments = segs.map((s) => {
    const r = { offset: off, segment: s };
    off += s.duration;
    return r;
  });
  return { segments, duration: off };
}

/** Paragraph 1: Masha walks clearing → table and waves; Bear idles then takes the jam from the table area. */
function para1() {
  const s0 = initialWorldState();
  s0.actors.masha.pos = [0, 0]; // this hand-authored path starts at the origin
  const s1 = cloneWorldState(s0);
  const table: Vec2 = [MARKS.table.pos[0] - 0.6, MARKS.table.pos[1] + 0.6];
  s1.actors.masha.pos = table;
  s1.actors.masha.mark = "table";
  s1.actors.masha.holding = "jam_jar";
  s1.props.jam_jar = { at: "masha" };
  const masha = [
    clip(0, 2.5, "walk_to", { from: [0, 0], to: table, path: [[0, 0], [1, 0.4], table], target: "table" }),
    clip(2.5, 1.0, "take", { item: "jam_jar", target: "jam_jar" }),
    clip(3.5, 1.5, "wave", { lookAt: [-6, 1.5, -2.6] }),
  ];
  const bear = [clip(0, 5, "idle", { ambient: true }, "neutral")];
  return seg(s0, s1, 5, { masha, bear }, {
    dialogue: [{ start: 3.6, dur: 1.2, actor: "masha", text: "Bear! Look!", lang: "en", visemes: [{ t: 0, v: "open_small" }, { t: 0.3, v: "open_wide" }, { t: 0.8, v: "rest" }] }],
    camera: [
      { start: 0, dur: 2, shot: "wide", from: { pos: [0, 3, 12], look: [0, 1, 0], fov: 45 }, to: { pos: [2, 3, 10], look: [0, 1, 0], fov: 40 }, overridden: false },
      { start: 2, dur: 3, shot: "medium", from: { pos: [3, 2, 6], look: [1, 1, 1], fov: 35 }, to: { pos: [3, 2, 5], look: [1, 1, 1], fov: 35 }, overridden: false },
    ],
    lighting: [{ start: 1, timeOfDay: "sunset", transition: 2 }],
    fx: [{ start: 3.5, dur: 1, id: "sparkles", at: [1, 1, 1] }],
  });
}

/** Paragraph 2: Bear walks to the hammock and sleeps; Masha sits on the bench. */
function para2(start: WorldState) {
  const end = cloneWorldState(start);
  const ham: Vec2 = [MARKS.hammock.pos[0], MARKS.hammock.pos[1]];
  end.actors.bear.pos = ham;
  end.actors.bear.mark = "hammock";
  end.actors.bear.posture = "sleep";
  end.actors.masha.posture = "sit";
  const bearPath: Vec2[] = [[...start.actors.bear.pos] as Vec2, [-10.5, -1.5], ham];
  const bear = [clip(0, 6, "walk_to", { path: bearPath, from: bearPath[0], to: ham, target: "hammock" }), clip(6, 4, "sleep", { target: "hammock", posture: "sleep" }, "sleepy")];
  const masha = [clip(0, 1.2, "sit", { target: "bench", posture: "sit" }), clip(1.2, 8.8, "idle", { ambient: true })];
  return seg(start, end, 10, { masha, bear });
}

describe("evaluate()", () => {
  it("renders an empty timeline: initial world, gentle idle, default camera, day light", () => {
    const tl: Timeline = { segments: [], duration: 0 };
    const f = evaluate(tl, 1.3);
    const ws = initialWorldState();
    expect(f.actors.masha.pos[0]).toBeCloseTo(ws.actors.masha.pos[0]);
    expect(f.actors.masha.pos[2]).toBeCloseTo(ws.actors.masha.pos[1]);
    expect(f.actors.bear.pos[0]).toBeCloseTo(ws.actors.bear.pos[0]);
    expect(f.camera).toEqual(DEFAULT_CAMERA);
    expect(f.lighting).toEqual({ from: "day", to: "day", k: 1 });
    expect(f.props.ball.visible).toBe(true);
    expect(f.props.pancakes.visible).toBe(false);
    expect(f.actors.masha.verb).toBe("idle");
    // idle fidget is driven by t
    expect(evaluate(tl, 2.7).actors.masha.bones).not.toEqual(f.actors.masha.bones);
    expect(evaluate(tl, 1.3)).toEqual(f);
  });

  it("is deterministic: same t → deep-equal frames, independent of evaluation order", () => {
    const p1 = para1();
    const tl = timeline(p1, para2(p1.endState));
    const ts = Array.from({ length: 160 }, (_, i) => -1 + i * 0.11);
    const forward = ts.map((t) => evaluate(tl, t));
    const backward = [...ts].reverse().map((t) => evaluate(tl, t)).reverse();
    expect(backward).toEqual(forward);
    expect(JSON.stringify(evaluate(tl, 7.77))).toBe(JSON.stringify(evaluate(tl, 7.77)));
  });

  it("locomotion follows the path and reaches `to` at clip end", () => {
    const p1 = para1();
    const tl = timeline(p1);
    const to = p1.actorClips.masha[0].params.to!;
    const end = evaluate(tl, 2.5 - 1e-6).actors.masha;
    expect(end.pos[0]).toBeCloseTo(to[0], 2);
    expect(end.pos[2]).toBeCloseTo(to[1], 2);
    const mid = evaluate(tl, 1.25).actors.masha;
    expect(mid.pos[0]).toBeGreaterThan(0.2);
    expect(mid.pos[0]).toBeLessThan(to[0]);
    expect(mid.verb).toBe("walk_to");
    // eased start: barely moved after 0.1 s
    const early = evaluate(tl, 0.1).actors.masha;
    expect(Math.hypot(early.pos[0], early.pos[2])).toBeLessThan(0.1);
    // stays at the table afterwards
    const later = evaluate(tl, 4).actors.masha;
    expect(later.pos[0]).toBeCloseTo(to[0], 5);
  });

  it("turns in place before moving when the path starts behind the actor", () => {
    const s0 = initialWorldState();
    s0.actors.masha.pos = [0, 0];
    const s1 = cloneWorldState(s0);
    s1.actors.masha.pos = [0, -4];
    const tl = timeline(seg(s0, s1, 3, { masha: [clip(0, 3, "walk_to", { path: [[0, 0], [0, -4]] })], bear: [clip(0, 3, "idle")] }));
    const f = evaluate(tl, 0.12).actors.masha;
    expect(f.pos[2]).toBeCloseTo(0, 5); // not moved yet
    expect(Math.abs(f.yaw)).toBeGreaterThan(0.05); // already turning
    const g = evaluate(tl, 2.0).actors.masha;
    expect(Math.abs(Math.abs(g.yaw) - Math.PI)).toBeLessThan(0.15); // faces -z while walking
  });

  it("is continuous across paragraph boundaries", () => {
    const p1 = para1();
    const p2 = para2(p1.endState);
    const tl = timeline(p1, p2);
    const a = evaluate(tl, 5 - 1e-6);
    const b = evaluate(tl, 5);
    expect(a.segmentIndex).toBe(0);
    expect(b.segmentIndex).toBe(1);
    for (const id of ["masha", "bear"] as const) {
      for (let i = 0; i < 3; i++) expect(Math.abs(a.actors[id].pos[i] - b.actors[id].pos[i])).toBeLessThan(1e-3);
      expect(Math.abs(Math.sin(a.actors[id].yaw - b.actors[id].yaw))).toBeLessThan(0.05);
    }
    // the crossfade keeps the pose close too
    const ha = a.actors.masha.bones.Head!;
    const hb = b.actors.masha.bones.Head!;
    expect(Math.abs(ha[0] * hb[0] + ha[1] * hb[1] + ha[2] * hb[2] + ha[3] * hb[3])).toBeGreaterThan(0.98);
  });

  it("props move with take, then ride in the hand", () => {
    const tl = timeline(para1());
    const before = evaluate(tl, 2.6);
    expect(before.props.jam_jar.attachedTo).toBeNull();
    expect(before.props.jam_jar.pos[1]).toBeGreaterThan(0.5); // on the table top
    const after = evaluate(tl, 3.2);
    expect(after.props.jam_jar.attachedTo).toBe("masha");
    expect(after.actors.masha.holding).toBe("jam_jar");
  });

  it("faces: visemes during dialogue, blinks while awake, closed lids while sleeping", () => {
    const p1 = para1();
    const tl = timeline(p1, para2(p1.endState));
    const talking = evaluate(tl, 4.0).actors.masha.face;
    expect(talking.viseme).toBe("open_wide");
    expect(talking.visemeWeight).toBeGreaterThan(0.5);
    // Bear looks at the speaker
    expect(evaluate(tl, 4.0).actors.bear.face.lookAt).not.toBeNull();
    let blinks = 0;
    for (let t = 0; t < 10; t += 0.02) if (evaluate(tl, t).actors.masha.face.lidClose > 0.5) blinks++;
    expect(blinks).toBeGreaterThan(0);
    expect(blinks).toBeLessThan(80);
    const asleep = evaluate(tl, 14).actors.bear;
    expect(asleep.posture).toBe("sleep");
    expect(asleep.face.lidClose).toBe(1);
  });

  it("camera eases from→to and holds the last cue; lighting and fx follow their cues", () => {
    const tl = timeline(para1());
    const c0 = evaluate(tl, 0).camera;
    expect(c0.pos).toEqual([0, 3, 12]);
    const c1 = evaluate(tl, 1).camera;
    expect(c1.pos[0]).toBeCloseTo(1, 5); // ease-in-out midpoint
    expect(evaluate(tl, 50).camera.pos).toEqual([3, 2, 5]);
    const l = evaluate(tl, 2).lighting;
    expect(l.from).toBe("day");
    expect(l.to).toBe("sunset");
    expect(l.k).toBeCloseTo(0.5, 5);
    expect(evaluate(tl, 0.5).lighting.k).toBe(1);
    expect(evaluate(tl, 4).fx.map((f) => f.id)).toEqual(["sparkles"]);
    expect(evaluate(tl, 4).fx[0].k).toBeCloseTo(0.5, 5);
    expect(evaluate(tl, 2).fx).toEqual([]);
  });

  it("clamps past the end: final world state, idle motion keeps running", () => {
    const p1 = para1();
    const tl = timeline(p1);
    const a = evaluate(tl, 8);
    const b = evaluate(tl, 9.3);
    expect(a.actors.masha.pos[0]).toBeCloseTo(p1.endState.actors.masha.pos[0], 5);
    expect(a.actors.masha.verb).toBe("idle");
    expect(a.actors.masha.bones).not.toEqual(b.actors.masha.bones);
    expect(a.props.jam_jar.attachedTo).toBe("masha");
    expect(a.segmentIndex).toBe(0);
    // before the start: start state
    const pre = evaluate(tl, -2);
    expect(pre.actors.masha.pos[0]).toBeCloseTo(0, 5);
  });

  it("exit and walking through the door fade out, and stay gone", () => {
    const s0 = initialWorldState();
    s0.actors.masha.pos = [0, 0];
    s0.actors.bear.pos = [...MARKS.porch.pos];
    s0.actors.bear.mark = "porch";
    const s1 = cloneWorldState(s0);
    s1.actors.masha.posture = "offstage";
    s1.actors.masha.pos = [...MARKS.path_entry.pos] as Vec2;
    s1.actors.bear.posture = "offstage";
    s1.actors.bear.pos = [...MARKS.door.pos] as Vec2;
    const masha = [clip(0, 4, "exit", { path: [[0, 0], [0, 16]], posture: "stand" }), clip(4, 2, "idle", { ambient: true, posture: "offstage" })];
    const bear = [clip(0, 3, "walk_to", { path: [[-6, -2.6], [-6, -3.6]], target: "door", posture: "stand" }), clip(3, 3, "idle", { ambient: true, posture: "offstage" })];
    const tl = timeline(seg(s0, s1, 6, { masha, bear }));
    expect(evaluate(tl, 1).actors.masha.opacity).toBe(1);
    expect(evaluate(tl, 3.99).actors.masha.opacity).toBeLessThan(0.05);
    expect(evaluate(tl, 5).actors.masha.opacity).toBe(0);
    expect(evaluate(tl, 2.99).actors.bear.opacity).toBeLessThan(0.05);
    expect(evaluate(tl, 4).actors.bear.opacity).toBe(0);
    expect(evaluate(tl, 9).actors.bear.opacity).toBe(0);
  });

  it("enter fades in from offstage; Bear's carry puts Masha on his shoulders", () => {
    const s0 = initialWorldState();
    s0.actors.masha.posture = "offstage";
    s0.actors.masha.pos = [...MARKS.path_entry.pos] as Vec2;
    const s1 = cloneWorldState(s0);
    s1.actors.masha.posture = "carried";
    s1.actors.masha.pos = [-5, -1];
    const bearPos = s0.actors.bear.pos;
    const masha = [clip(0, 4, "enter", { path: [[0, 16], [-5, -1]] }), clip(4, 4, "idle", { ambient: true })];
    const bear = [clip(0, 4.5, "idle"), clip(4.5, 3, "carry", { target: "masha", lookAt: [-5, 0.6, -1] }), clip(7.5, 0.5, "idle")];
    const tl = timeline(seg(s0, s1, 8, { masha, bear }));
    expect(evaluate(tl, 0.01).actors.masha.opacity).toBeLessThan(0.1);
    expect(evaluate(tl, 2).actors.masha.opacity).toBe(1);
    const riding = evaluate(tl, 7.9).actors.masha;
    expect(riding.posture).toBe("carried");
    expect(riding.pos[1]).toBeGreaterThan(1.5);
    expect(Math.hypot(riding.pos[0] - bearPos[0], riding.pos[2] - bearPos[1])).toBeLessThan(0.5);
  });
});
