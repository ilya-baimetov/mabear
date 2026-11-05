// A4 — the Wolves as canon characters (wolf_a, wolf_b) — and B12 splashy footsteps in rain.
import { describe, expect, it } from "vitest";
import { compile } from "../../src/compiler/compile";
import { EMPTY_CARRY, footSurface, isWet } from "../../src/compiler/audioCues";
import { canonAbsentTarget, validateBeatScript } from "../../src/compiler/validate";
import { initialWorldState, withAllActors } from "../../src/compiler/worldState";
import { parseParagraph } from "../../src/director/offline/parser";
import { BUILTIN_EXAMPLES, buildSystemPrompt } from "../../src/director/prompt";
import { CHARACTERS } from "../../src/shared/bible/characters";
import { OBSTACLES } from "../../src/shared/bible/set";
import { GRAMMAR, SPEEDS, isWolf } from "../../src/shared/grammar";
import { canonAbsentFor } from "../../src/shared/rules";
import {
  ACTOR_IDS, DEFAULT_REMIX, EMOTES, RULE_IDS, SegmentSchema, WorldStateSchema,
  type Beat, type BeatScript, type WorldState,
} from "../../src/shared/schema";
import type { CompileOptions } from "../../src/compiler/types";
import { vocalFor } from "../../src/engine/audio/vocals";
import { STYLES, evaluatePose, type VerbCtx } from "../../src/engine/motion/library";
import { qrot } from "../../src/engine/motion/blend";
import golden from "../golden/prompts.json";

const B = (o: Partial<Beat> & Pick<Beat, "actor" | "verb">): Beat => ({ target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto", ...o });
const BS = (beats: Beat[], extra: Partial<BeatScript> = {}): BeatScript => ({ summary: "t", time_of_day: null, mood: "playful", music: { mood: "playful", intensity: "soft", change: "continue" }, ambience: null, beats, rule_hits: [], ...extra });
const OPTS = (o: Partial<CompileOptions> = {}): CompileOptions => ({ paragraphId: "p", version: 1, lang: "en", remix: DEFAULT_REMIX, isFirst: true, carry: EMPTY_CARRY, ...o });
const VAN = OBSTACLES.boxes.find((b) => b.id === "van")!;
const inVan = (p: readonly number[], pad = 0) => p[0] > VAN.min[0] - pad && p[0] < VAN.max[0] + pad && p[1] > VAN.min[1] - pad && p[1] < VAN.max[1] + pad;

describe("Wolves: schema and bible", () => {
  it("are appended actors with their own emotes and rule (additive)", () => {
    expect(ACTOR_IDS.slice(0, 2)).toEqual(["masha", "bear"]);
    expect(ACTOR_IDS).toContain("wolf_a");
    expect(ACTOR_IDS).toContain("wolf_b");
    for (const e of ["howl", "whimper", "snicker"] as const) expect(EMOTES).toContain(e);
    expect(RULE_IDS).toContain("wolves_silent");
    for (const w of ["wolf_a", "wolf_b"] as const) {
      expect(CHARACTERS[w].speaks).toBe(false);
      expect(CHARACTERS[w].emotes).toEqual(expect.arrayContaining(["howl", "whimper", "snicker"]));
      expect(CHARACTERS[w].personality).toMatch(/hungry/i);
      expect(CHARACTERS[w].personality).toMatch(/Bear/);
    }
  });

  it("an older world state / segment without the Wolves still parses (they default in by the van)", () => {
    const old = JSON.parse(JSON.stringify(initialWorldState()));
    delete old.actors.wolf_a;
    delete old.actors.wolf_b;
    const ws = WorldStateSchema.parse(old);
    expect(ws.actors.wolf_a.mark).toBe("van");
    expect(ws.actors.wolf_b.posture).toBe("stand");
    const seg = compile(BS([B({ actor: "masha", verb: "jump" })]), old as WorldState, OPTS()).segment;
    const raw = JSON.parse(JSON.stringify(seg));
    delete raw.actorClips.wolf_a;
    delete raw.actorClips.wolf_b;
    const parsed = SegmentSchema.parse(raw);
    expect(parsed.actorClips.wolf_a).toEqual([]);
    expect(SegmentSchema.parse(JSON.parse(JSON.stringify(seg))).actorClips.wolf_b.length).toBeGreaterThan(0);
  });

  it("start standing just west of their van, facing the yard, not inside the van or each other", () => {
    const ws = initialWorldState();
    const a = ws.actors.wolf_a;
    const b = ws.actors.wolf_b;
    for (const w of [a, b]) {
      expect(w.mark).toBe("van");
      expect(inVan(w.pos, 0.3)).toBe(false);
      expect(w.pos[0]).toBeLessThan(VAN.min[0]);
      expect(Math.sin(w.facing)).toBeLessThan(-0.9); // facing -x (west, toward the yard)
    }
    expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])).toBeGreaterThan(1.2);
    expect(withAllActors(ws)).toBe(ws);
  });

  it("are lanky and quick: faster than Bear, never on Bear's heavy branches", () => {
    expect(SPEEDS.wolf_a.walk_to).toBeGreaterThan(SPEEDS.bear.walk_to);
    expect(SPEEDS.wolf_a.run_to).toBeGreaterThan(SPEEDS.masha.run_to);
    expect(STYLES.wolf_a.timeScale).toBeGreaterThan(STYLES.bear.timeScale);
    expect(isWolf("wolf_b")).toBe(true);
    expect(isWolf("bear")).toBe(false);
    for (const v of ["cook", "fish", "swing", "carry", "water_plants"] as const) expect(GRAMMAR[v].actors).not.toContain("wolf_a");
    for (const v of ["tiptoe_to", "take", "eat", "hide", "peek", "throw"] as const) expect(GRAMMAR[v].actors).toContain("wolf_b");
  });
});

describe("Wolves: validator", () => {
  it("never treats the Wolves as foreign: 'wolf' / 'wolves' targets resolve to the Wolves with no cast_only hit", () => {
    const v = validateBeatScript(BS([B({ actor: "masha", verb: "point_at", target: "wolves" }), B({ actor: "bear", verb: "chase", target: "wolf" })]), initialWorldState(), "en");
    expect(v.beatScript.beats[0].target).toBe("wolf_a");
    expect(v.beatScript.beats[1].target).toBe("wolf_a");
    expect(v.hits.filter((h) => h.rule === "cast_only")).toEqual([]);
  });

  it("a Wolf line becomes a howl / whimper / snicker with a wolves_silent hit", () => {
    const v = validateBeatScript(BS([
      B({ actor: "wolf_a", verb: "idle", line: "Give us the honey!", emotion: "mischievous" }),
      B({ actor: "wolf_b", verb: "wave", line: "Help!", emotion: "scared" }),
      B({ actor: "wolf_b", verb: "jump", line: "Hooray!", emotion: "happy" }),
    ]), initialWorldState(), "ru");
    expect(v.beatScript.beats.map((b) => b.line)).toEqual([null, null, null]);
    expect(v.beatScript.beats.map((b) => b.emote)).toEqual(["snicker", "whimper", "howl"]);
    expect(v.beatScript.beats[0].verb).toBe("nod");
    const hits = v.hits.filter((h) => h.rule === "wolves_silent");
    expect(hits.length).toBe(3);
    expect(hits[0].kid_message).toMatch(/Волки/);
    // idempotent
    const again = validateBeatScript(v.beatScript, initialWorldState(), "ru");
    expect(again.hits).toEqual([]);
  });

  it("canon characters not in the prototype are substituted with an honest message (EN/RU)", () => {
    const en = validateBeatScript(BS([B({ actor: "masha", verb: "hug", target: "hare" })]), initialWorldState(), "en");
    const h = en.hits.find((x) => x.rule === "cast_only")!;
    expect(h.kid_message).toBe("The Hare isn't in this prototype yet — Masha played the part!");
    expect(h.kid_message).not.toMatch(/foreign/i);
    const ru = validateBeatScript(BS([B({ actor: "masha", verb: "point_at", target: "panda" })]), initialWorldState(), "ru");
    expect(ru.beatScript.beats[0].target).toBe("bear");
    expect(ru.hits[0].kid_message).toMatch(/пока нет в этой версии/);
    expect(canonAbsentTarget("Rosie the pig")?.sub).toBe("masha");
    expect(canonAbsentFor("зайчик")).not.toBeNull();
    expect(canonAbsentFor("wolf")).toBeNull();
  });

  it("Wolves can't do household chores: cook → look_at; a Wolf's carry doesn't become Bear lifting Masha", () => {
    const v = validateBeatScript(BS([B({ actor: "wolf_a", verb: "cook" }), B({ actor: "wolf_b", verb: "carry", target: "masha" })]), initialWorldState(), "en");
    expect(v.beatScript.beats.map((b) => [b.actor, b.verb])).toEqual([["wolf_a", "look_at"], ["wolf_b", "look_at"]]);
  });
});

describe("Wolves: offline parser", () => {
  it("EN: 'the wolves' = both Wolves in parallel; Bear's growl; they flee to the van", () => {
    const bs = parseParagraph("The wolves sneak up to steal Bear's honey. Bear growls and they run away. Masha laughs.", "en", initialWorldState());
    const w = bs.beats.filter((b) => isWolf(b.actor));
    expect(w.some((b) => b.actor === "wolf_a" && b.verb === "tiptoe_to")).toBe(true);
    const twin = bs.beats.find((b) => b.actor === "wolf_b" && b.verb === "tiptoe_to")!;
    expect(twin.with_previous).toBe(true);
    expect(w.filter((b) => b.verb === "run_to" && b.target === "van").length).toBe(2);
    expect(bs.rule_hits.filter((h) => h.rule === "cast_only")).toEqual([]);
    const r = compile(bs, initialWorldState(), OPTS());
    expect(r.errors).toEqual([]);
  });

  it("RU: волки / волков / волкам / волками are the Wolves; singular волк = wolf_a; маленький волк = wolf_b", () => {
    const bs = parseParagraph("Волки крадутся к улью. Маша дарит волкам варенье.", "ru", initialWorldState());
    expect(bs.beats.filter((b) => b.verb === "tiptoe_to").map((b) => b.actor)).toEqual(["wolf_a", "wolf_b"]);
    expect(bs.beats.find((b) => b.verb === "give")?.target).toBe("wolf_a");
    const one = parseParagraph("Маленький волк воет.", "ru", initialWorldState());
    expect(one.beats[0].actor).toBe("wolf_b");
    expect(one.beats[0].emote).toBe("howl");
    const big = parseParagraph("The wolf snickers.", "en", initialWorldState());
    expect(big.beats[0].actor).toBe("wolf_a");
    expect(big.beats[0].emote).toBe("snicker");
    expect(parseParagraph("Masha chases the wolves with Bear.", "en", initialWorldState()).rule_hits).toEqual([]);
  });

  it("canon-absent characters in a paragraph get the honest note and are played by Masha", () => {
    const bs = parseParagraph("The hare comes to visit.", "en", initialWorldState());
    expect(bs.rule_hits[0]).toMatchObject({ rule: "cast_only", original: "hare" });
    expect(bs.rule_hits[0].kid_message).toMatch(/isn't in this prototype yet/);
    expect(bs.beats[0].actor).toBe("masha");
  });
});

describe("Wolves: compiler", () => {
  it("idle Wolves get ambient life near the van covering the whole segment and keep their spot", () => {
    const r = compile(BS([B({ actor: "masha", verb: "jump" }), B({ actor: "masha", verb: "wave", target: "bear" })]), initialWorldState(), OPTS());
    const seg = r.segment;
    for (const w of ["wolf_a", "wolf_b"] as const) {
      const clips = seg.actorClips[w];
      expect(clips.length).toBeGreaterThan(0);
      expect(clips.every((c) => c.params.ambient)).toBe(true);
      expect(clips[0].start).toBe(0);
      const last = clips[clips.length - 1];
      expect(last.start + last.dur).toBeCloseTo(seg.duration, 3);
      expect(seg.endState.actors[w].pos).toEqual(initialWorldState().actors[w].pos);
      // they watch the action (Masha is acting)
      expect(clips.some((c) => c.params.lookAt && Math.abs(c.params.lookAt[0] - seg.startState.actors.masha.pos[0]) < 0.5)).toBe(true);
    }
    expect(seg.foley.some((f) => isWolf(f.actor))).toBe(false); // idle → no footsteps
  });

  it("the Wolves cower (scared + whimper) when Bear is loud", () => {
    const seg = compile(BS([B({ actor: "bear", verb: "angry_stomp", emote: "roar_soft", emotion: "angry" })]), initialWorldState(), OPTS()).segment;
    expect(seg.actorClips.wolf_a.some((c) => c.verb === "scared" && c.params.ambient && c.params.target === "bear")).toBe(true);
    expect(seg.actorClips.wolf_b.some((c) => c.verb === "scared")).toBe(true);
    expect(seg.emotes.some((e) => isWolf(e.actor) && e.emote === "whimper")).toBe(true);
  });

  it("the wolves few-shot compiles with 0 errors and 0 repairs, and chains continuity into the next paragraph", () => {
    const ex = BUILTIN_EXAMPLES.wolves_en.beatScript;
    const r = compile(ex, initialWorldState(), OPTS());
    expect(r.errors).toEqual([]);
    expect(r.repairs).toEqual([]);
    const end = r.segment.endState;
    expect(end.actors.wolf_a.mark).toBe("van");
    expect(inVan(end.actors.wolf_a.pos)).toBe(false);
    expect(end.actors.wolf_a.holding).toBe("honey_pot");
    expect(Math.hypot(end.actors.wolf_a.pos[0] - end.actors.wolf_b.pos[0], end.actors.wolf_a.pos[1] - end.actors.wolf_b.pos[1])).toBeGreaterThan(0.5);
    // wolves act → the camera frames them at least once; their footsteps are light
    expect(r.segment.camera.some((c) => c.to.look[0] > 7)).toBe(true);
    const wolfStep = r.segment.foley.find((f) => f.actor === "wolf_a" && f.id === "footstep")!;
    expect(wolfStep.gain).toBeLessThan(0.6);
    const r2 = compile(BS([B({ actor: "wolf_b", verb: "peek", target: "bear" })]), end, OPTS({ isFirst: false, carry: r.carry }));
    expect(r2.errors).toEqual([]);
    expect(r2.segment.startState.actors.wolf_b.pos).toEqual(end.actors.wolf_b.pos);
    for (const a of ACTOR_IDS) {
      const c = r2.segment.actorClips[a];
      for (let i = 1; i < c.length; i++) expect(c[i].start).toBeCloseTo(c[i - 1].start + c[i - 1].dur, 3);
    }
  });

  it("idle Wolves don't steal the framing: a Masha-only paragraph never looks at the van", () => {
    const seg = compile(BS([B({ actor: "masha", verb: "dance" }), B({ actor: "masha", verb: "clap" }), B({ actor: "bear", verb: "nod", with_previous: true })]), initialWorldState(), OPTS()).segment;
    for (const c of seg.camera) {
      expect(c.from.look[0]).toBeLessThan(8);
      expect(c.to.look[0]).toBeLessThan(8);
    }
  });
});

describe("B12: splashy footsteps in rain", () => {
  const walk = (ambience: BeatScript["ambience"], ws = initialWorldState()) =>
    compile(BS([B({ actor: "masha", verb: "walk_to", target: "bench" }), B({ actor: "bear", verb: "walk_to", target: "clearing", with_previous: true })], { ambience }), ws, OPTS()).segment;

  it("rain or thunderstorm turns grass/dirt footsteps into water; dry weather stays grass", () => {
    expect(isWet(["rain"])).toBe(true);
    expect(isWet(["thunderstorm", "forest_wind"])).toBe(true);
    expect(isWet(["birds_day"])).toBe(false);
    for (const amb of [["rain"], ["thunderstorm"]] as const) {
      const steps = walk([...amb]).foley.filter((f) => f.id === "footstep" && f.actor === "masha");
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((f) => f.surface === "water")).toBe(true);
    }
    const dry = walk(["birds_day"]).foley.filter((f) => f.id === "footstep" && f.actor === "masha");
    expect(dry.every((f) => f.surface === "grass")).toBe(true);
  });

  it("boards stay wood under rain (porch); carried-over rain keeps splashing", () => {
    expect(footSurface(-6, -2.6, true)).toBe("wood"); // porch
    expect(footSurface(0, 12, true)).toBe("water"); // forest path dirt
    expect(footSurface(0, 0, false)).toBe("grass");
    const bear = walk(["rain"]).foley.filter((f) => f.actor === "bear" && (f.id === "footstep_heavy" || f.id === "footstep"));
    expect(bear.some((f) => f.surface === "wood")).toBe(true); // stepping off the porch
    expect(bear.some((f) => f.surface === "water")).toBe(true);
    const next = compile(BS([B({ actor: "masha", verb: "run_to", target: "swing" })]), initialWorldState(), OPTS({ isFirst: false, carry: { music: null, ambience: ["rain"] } })).segment;
    expect(next.foley.filter((f) => f.id === "footstep").every((f) => f.surface === "water")).toBe(true);
  });
});

describe("Wolves: vocals, motion, prompt", () => {
  it("howl rises with vibrato; whimper glides fall; snicker is rapid nasal pulses; Little Wolf is higher", () => {
    const howl = vocalFor("wolf_a", "howl")!;
    const f0 = howl.syl[0].f0;
    expect(Math.max(...f0)).toBeGreaterThan(f0[0] * 1.8);
    let wiggles = 0;
    for (let i = 2; i < f0.length; i++) if ((f0[i] - f0[i - 1]) * (f0[i - 1] - f0[i - 2]) < 0) wiggles++;
    expect(wiggles).toBeGreaterThanOrEqual(4);
    const wh = vocalFor("wolf_a", "whimper")!;
    expect(wh.syl.length).toBeGreaterThanOrEqual(3);
    for (const x of wh.syl) expect(x.f0[x.f0.length - 1]).toBeLessThan(x.f0[0]);
    const sn = vocalFor("wolf_b", "snicker")!;
    expect(sn.syl.length).toBeGreaterThanOrEqual(5);
    expect(sn.syl.every((x) => x.dur < 0.1 && x.vowel === "m")).toBe(true);
    expect(sn.voice.pitch).toBeGreaterThan(vocalFor("wolf_a", "snicker")!.voice.pitch);
    for (const e of CHARACTERS.wolf_a.emotes) expect(vocalFor("wolf_a", e), e).not.toBeNull();
  });

  it("idle arms are never dead straight (natural elbow bend) for every character", () => {
    for (const a of ACTOR_IDS) {
      const ctx: VerbCtx = { actor: a, style: STYLES[a], dur: 2, emotion: "neutral", t: 4.2, dist: 0, turned: 0, fromPosture: "stand", posture: "stand", targetLocal: null, seat: 0 };
      const { layer } = evaluatePose("idle", 1, {}, ctx);
      for (const side of ["LeftForeArm", "RightForeArm"]) {
        const q = layer.bones[side]!;
        const bend = 2 * Math.acos(Math.min(1, Math.abs(q[3])));
        expect(bend, `${a} ${side}`).toBeGreaterThan(0.15);
      }
      // upper arms hang away from the body a little (not glued to the sides)
      const down = qrot(layer.bones.LeftArm!, [1, 0, 0]);
      expect(Math.abs(down[0]), a).toBeGreaterThan(0.05);
    }
  });

  it("the prompt states the Wolves are canon (never cast_only) and carries exactly one Wolves example", () => {
    const p = buildSystemPrompt();
    expect(p).toMatch(/Wolves \(wolf_a, wolf_b\) are canon series characters/);
    expect(p).toContain(CHARACTERS.wolf_a.personality);
    expect((p.match(/The wolves sneak up to steal Bear's honey\./g) ?? []).length).toBe(1);
    expect(p).toContain("isn't in this prototype yet");
    for (const g of golden as { paragraph: string }[]) expect(p).not.toContain(g.paragraph);
    expect(validateBeatScript(BUILTIN_EXAMPLES.wolves_en.beatScript, initialWorldState(), "en").errors).toEqual([]);
  });
});
