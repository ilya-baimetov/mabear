import { describe, expect, it } from "vitest";
import { compile } from "../../src/compiler/compile";
import { EMPTY_CARRY } from "../../src/compiler/audioCues";
import { HEAD_HEIGHT, OCCLUDERS, SHOT_MAX, SHOT_MIN, cameraAt, clampCam, mulberry32, occlusionCost } from "../../src/compiler/camera";
import { initialWorldState } from "../../src/compiler/worldState";
import { OBSTACLES, SET_BOUNDS } from "../../src/shared/bible/set";
import { DEFAULT_REMIX, type ActorId, type Beat, type BeatScript, type Segment, type Vec2 } from "../../src/shared/schema";

const B = (o: Partial<Beat> & Pick<Beat, "actor" | "verb">): Beat => ({ target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto", ...o });
const BS = (beats: Beat[]): BeatScript => ({ summary: "t", time_of_day: null, mood: "playful", music: { mood: "playful", intensity: "soft", change: "continue" }, ambience: null, beats, rule_hits: [] });
const run = (bs: BeatScript, isFirst = true, seed = 0) => compile(bs, initialWorldState(), { paragraphId: "p", version: 1, lang: "en", remix: { ...DEFAULT_REMIX, cameraSeed: seed }, isFirst, carry: EMPTY_CARRY }).segment;

function posAt(s: Segment, a: ActorId, t: number): Vec2 {
  const c = s.actorClips[a].find((x) => t >= x.start && t < x.start + x.dur) ?? s.actorClips[a][s.actorClips[a].length - 1];
  const p = c.params;
  if (p.path && p.path.length > 1) {
    const k = (t - c.start) / c.dur;
    const total = p.path.slice(1).reduce((acc, q, i) => acc + Math.hypot(q[0] - p.path![i][0], q[1] - p.path![i][1]), 0);
    let d = k * total;
    for (let i = 1; i < p.path.length; i++) {
      const seg = Math.hypot(p.path[i][0] - p.path[i - 1][0], p.path[i][1] - p.path[i - 1][1]);
      if (d <= seg) return [p.path[i - 1][0] + ((p.path[i][0] - p.path[i - 1][0]) * d) / seg, p.path[i - 1][1] + ((p.path[i][1] - p.path[i - 1][1]) * d) / seg];
      d -= seg;
    }
    return p.path[p.path.length - 1];
  }
  return p.from!;
}

const SCENE = BS([
  B({ actor: "masha", verb: "run_to", target: "porch" }),
  B({ actor: "masha", verb: "wave", target: "bear", line: "Bear, Bear! Let's make pancakes together, please!" }),
  B({ actor: "bear", verb: "sigh" }),
  B({ actor: "bear", verb: "walk_to", target: "table" }),
  B({ actor: "bear", verb: "cook" }),
  B({ actor: "masha", verb: "jump", line: "Hooray! Pancakes, pancakes, pancakes for everyone!" }),
  B({ actor: "bear", verb: "fall_down" }),
  B({ actor: "masha", verb: "laugh" }),
]);

describe("auto-cinematographer", () => {
  it("opens the episode on an establishing wide shot", () => {
    const s = run(SCENE, true);
    expect(s.camera[0].start).toBe(0);
    expect(s.camera[0].shot).toBe("wide");
    expect(run(SCENE, false).camera[0].shot).not.toBe("wide");
  });

  it("covers the segment with shots of 1.2–6 s", () => {
    for (const seed of [0, 1, 2, 3]) {
      const s = run(SCENE, true, seed);
      expect(s.camera[0].start).toBe(0);
      for (let i = 0; i < s.camera.length; i++) {
        const c = s.camera[i];
        expect(c.dur).toBeGreaterThanOrEqual(SHOT_MIN - 1e-6);
        expect(c.dur).toBeLessThanOrEqual(SHOT_MAX + 1e-6);
        if (i > 0) expect(c.start).toBeCloseTo(s.camera[i - 1].start + s.camera[i - 1].dur, 3);
      }
      const last = s.camera[s.camera.length - 1];
      expect(last.start + last.dur).toBeCloseTo(s.duration, 3);
    }
  });

  it("frames the speaker during dialogue", () => {
    const s = run(SCENE, true);
    expect(s.dialogue.length).toBe(2);
    for (const d of s.dialogue) {
      const t = d.start + d.dur * 0.75;
      const cam = s.camera.find((c) => t >= c.start && t < c.start + c.dur)!;
      expect(["close", "medium", "low_angle", "over_shoulder"]).toContain(cam.shot);
      const sp = posAt(s, d.actor, t);
      expect(Math.hypot(cam.from.look[0] - sp[0], cam.from.look[2] - sp[1])).toBeLessThan(1.5);
    }
  });

  it("uses a reaction shot after slapstick and tracking for long moves", () => {
    const s = run(SCENE, true);
    const fall = s.actorClips.bear.find((c) => c.verb === "fall_down")!;
    const after = s.camera.find((c) => c.start >= fall.start && c.start <= fall.start + fall.dur + 0.5 && c.dur <= 2.5);
    expect(after).toBeDefined();
    const long = run(BS([B({ actor: "bear", verb: "walk_to", target: "beehive" }), B({ actor: "bear", verb: "nod" })]), false);
    expect(long.camera.some((c) => c.shot === "tracking")).toBe(true);
  });

  it("honours beat shot hints", () => {
    const s = run(BS([B({ actor: "masha", verb: "peek", shot: "low_angle" }), B({ actor: "bear", verb: "sigh" })]), false);
    expect(s.camera[0].shot).toBe("low_angle");
    expect(s.camera[0].overridden).toBe(true);
  });

  it("keeps the camera inside the set and out of the house; seeded variation is deterministic", () => {
    const s = run(SCENE, true, 5);
    const house = OBSTACLES.boxes.find((b) => b.id === "house")!;
    for (const c of s.camera) for (const k of [c.from, c.to]) {
      expect(k.pos[0]).toBeGreaterThanOrEqual(SET_BOUNDS.minX);
      expect(k.pos[0]).toBeLessThanOrEqual(SET_BOUNDS.maxX);
      expect(k.pos[2]).toBeLessThanOrEqual(SET_BOUNDS.maxZ);
      const inHouse = k.pos[0] > house.min[0] && k.pos[0] < house.max[0] && k.pos[2] > house.min[1] && k.pos[2] < house.max[1] && k.pos[1] < 7;
      expect(inHouse).toBe(false);
    }
    expect(run(SCENE, true, 5).camera).toEqual(s.camera);
    expect(run(SCENE, true, 6).camera).not.toEqual(s.camera);
    expect(clampCam([-6, 1.5, -6])).not.toEqual([-6, 1.5, -6]);
    const r = mulberry32(1);
    expect(r()).toBe(mulberry32(1)());
  });
});

describe("auto-cinematographer — 180° rule", () => {
  it("keeps every camera on one side of the line between the two characters", () => {
    const s = run(BS([
      B({ actor: "masha", verb: "walk_to", target: "bench" }),
      B({ actor: "masha", verb: "wave", target: "bear", line: "Bear! Come and sit with me, please!" }),
      B({ actor: "bear", verb: "nod" }),
      B({ actor: "masha", verb: "laugh", line: "Hee-hee, you are the best bear ever!" }),
      B({ actor: "bear", verb: "sigh" }),
    ]), false);
    let sign = 0;
    for (const c of s.camera) {
      const m = posAt(s, "masha", c.start + 0.01);
      const b = posAt(s, "bear", c.start + 0.01);
      const cross = (b[0] - m[0]) * (c.from.pos[2] - m[1]) - (b[1] - m[1]) * (c.from.pos[0] - m[0]);
      if (Math.abs(cross) < 0.5) continue;
      if (sign === 0) sign = Math.sign(cross);
      expect(Math.sign(cross)).toBe(sign);
    }
  });
});

describe("auto-cinematographer — the speaker owns the line; no trunks in the way", () => {
  const TALK = BS([
    B({ actor: "masha", verb: "run_to", target: "table" }),
    B({ actor: "masha", verb: "wave", target: "bear", line: "Bear, Bear! I'm making you the biggest pancakes in the whole forest!" }),
    B({ actor: "bear", verb: "fall_down", with_previous: true, delay_s: 0.8 }),
    B({ actor: "bear", verb: "yawn_stretch" }),
    B({ actor: "masha", verb: "jump", line: "Hooray! Pancakes for everyone!" }),
    B({ actor: "bear", verb: "facepalm" }),
  ]);

  it("frames the speaker for the WHOLE dialogue cue; the listener's reaction comes after the line", () => {
    for (const seed of [0, 3, 9]) {
      const s = run(TALK, false, seed);
      expect(s.dialogue.length).toBe(2);
      for (const d of s.dialogue) {
        for (let t = d.start + 0.05; t < d.start + d.dur - 0.05; t += 0.1) {
          const cam = cameraAt(s.camera, t)!;
          const sp = posAt(s, d.actor, t);
          expect(Math.hypot(cam.look[0] - sp[0], cam.look[2] - sp[1]), `seed ${seed} t=${t.toFixed(2)}`).toBeLessThan(1.5);
        }
        // a cut inside a line (only when a shot must be split at 6 s) stays on the speaker — never to the listener
        for (const c of s.camera.filter((q) => q.start > d.start + 0.05 && q.start < d.start + d.dur - 0.05)) {
          const sp = posAt(s, d.actor, c.start + 0.01);
          expect(Math.hypot(c.from.look[0] - sp[0], c.from.look[2] - sp[1])).toBeLessThan(1.5);
        }
      }
    }
  });

  it("gives Masha, the star, the most screen time when both act", () => {
    const s = run(BS([
      B({ actor: "bear", verb: "walk_to", target: "bench" }),
      B({ actor: "masha", verb: "spin", with_previous: true, delay_s: 1 }),
      B({ actor: "masha", verb: "dance", with_previous: true }),
      B({ actor: "bear", verb: "sit", target: "bench" }),
      B({ actor: "masha", verb: "clap" }),
    ]), false);
    let masha = 0;
    let bear = 0;
    for (let t = 0.05; t < s.duration; t += 0.1) {
      const cam = cameraAt(s.camera, t)!;
      const m = posAt(s, "masha", t);
      const b = posAt(s, "bear", t);
      const dm = Math.hypot(cam.look[0] - m[0], cam.look[2] - m[1]);
      const db = Math.hypot(cam.look[0] - b[0], cam.look[2] - b[1]);
      const both = Math.hypot(m[0] - b[0], m[1] - b[1]) < 8 && dm < 4.5 && db < 4.5;
      if (dm < 1.5 || both) masha += 0.1;
      if (db < 1.5 || both) bear += 0.1;
    }
    expect(masha).toBeGreaterThanOrEqual(bear);
  });

  it("scores occlusion by set trunks and walls, and plans around them", () => {
    // hammock pines sit where the set's rotated hammock puts them (±2.1 m along the hammock, rotated 0.8 rad)
    const pine = OCCLUDERS.find((o) => Math.hypot(o.c[0] + 9.54, o.c[1] - 0.69) < 0.1)!;
    expect(pine).toBeDefined();
    const head = { head: [-11, HEAD_HEIGHT.bear, 2.2] as [number, number, number], w: 1 };
    // camera south-east of the pine (on the porch), looking through it at Bear in the hammock
    expect(occlusionCost({ pos: [-6.62, 1.8, -2.33], look: [-11, 1.7, 2.2], fov: 40 }, [head])).toBeGreaterThanOrEqual(1);
    // from the south-east the view is clear (both pines are behind or beside the subject)
    expect(occlusionCost({ pos: [-7.5, 1.8, 6.5], look: [-11, 1.7, 2.2], fov: 40 }, [head])).toBe(0);
    // walls: through the house
    expect(occlusionCost({ pos: [-6, 1.5, -12], look: [-6, 1.0, 0], fov: 40 }, [{ head: [-6, 0.85, 0], w: 1 }])).toBeGreaterThanOrEqual(1);
    // a Bear-to-hammock scene keeps both characters' heads in clear view
    const nap = run(BS([
      B({ actor: "bear", verb: "walk_to", target: "hammock" }),
      B({ actor: "masha", verb: "run_to", target: "porch", with_previous: true }),
      B({ actor: "bear", verb: "sleep", target: "hammock" }),
      B({ actor: "masha", verb: "peek", target: "bear", line: "Bear is sleeping? Not for long!" }),
    ]), true);
    for (const c of nap.camera) {
      const heads = (["masha", "bear"] as const).map((a) => {
        const p = posAt(nap, a, c.start + 0.01);
        return { head: [p[0], HEAD_HEIGHT[a], p[1]] as [number, number, number], w: 1 };
      });
      const per = heads.map((h) => occlusionCost(c.from, [h]));
      // a close-up frames one character: only that subject must be clear; wider shots must show both heads
      const cost = c.shot === "close" ? Math.min(...per) : occlusionCost(c.from, heads);
      expect(cost, `${c.start} ${c.shot} masha=${per[0]} bear=${per[1]}`).toBeLessThan(1);
    }
  });
});
