import { it } from "vitest";
import { compile } from "../../src/compiler/compile";
import { initialWorldState } from "../../src/compiler/worldState";
import { DEFAULT_REMIX, SegmentSchema, type BeatScript } from "../../src/shared/schema";
const B = (o: any) => ({ target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto", ...o });
const bs: BeatScript = {
  summary: "Masha wakes Bear.", time_of_day: null, mood: "playful",
  music: { mood: "playful", intensity: "soft", change: "start" }, ambience: null,
  beats: [
    B({ actor: "bear", verb: "sleep", target: "hammock", emote: "snore", emotion: "sleepy" }),
    B({ actor: "masha", verb: "tiptoe_to", target: "hammock", emotion: "mischievous" }),
    B({ actor: "masha", verb: "wave", line: "Bear! Wake up! It's morning!", emotion: "excited" }),
    B({ actor: "bear", verb: "surprised", emote: "grunt", emotion: "surprised", with_previous: true }),
    B({ actor: "bear", verb: "fall_down", emotion: "surprised" }),
    B({ actor: "bear", verb: "facepalm", emote: "sigh", emotion: "annoyed" }),
    B({ actor: "masha", verb: "laugh", emotion: "happy", with_previous: true }),
    B({ actor: "masha", verb: "eat", item: "jam_jar", emotion: "happy" }),
    B({ actor: "bear", verb: "carry", target: "masha", emotion: "happy" }),
    B({ actor: "bear", verb: "walk_to", target: "pier", emotion: "happy" }),
  ],
  rule_hits: [],
};
it("smoke", () => {
  const r = compile(bs, initialWorldState(), { paragraphId: "p1", version: 1, lang: "en", remix: DEFAULT_REMIX, isFirst: true, carry: { music: null, ambience: [] } });
  SegmentSchema.parse(r.segment);
  const s = r.segment;
  console.log("dur", s.duration, "repairs", r.repairs, "errors", r.errors);
  for (const a of ["masha", "bear"] as const) console.log(a, s.actorClips[a].map((c) => `${c.start.toFixed(2)}+${c.dur.toFixed(2)} ${c.verb}${c.params.ambient ? "*" : ""} ${c.params.posture}`).join(" | "));
  console.log("cam", s.camera.map((c) => `${c.start.toFixed(2)}+${c.dur.toFixed(2)} ${c.shot}`).join(" | "));
  console.log("dlg", JSON.stringify(s.dialogue.map((d) => [d.start, d.dur, d.text, d.visemes.length])));
  console.log("emotes", s.emotes.map((e) => `${e.start}:${e.actor}:${e.emote}`).join(" "));
  console.log("foley", s.foley.length, s.foley.slice(0, 5).map((f) => `${f.start}:${f.actor}:${f.id}:${f.surface}:${f.gain}:${f.pan}`).join(" "));
  console.log("fx", s.fx.map((f) => `${f.start}:${f.id}`).join(" "), "music", JSON.stringify(s.music), "amb", JSON.stringify(s.ambience), "light", JSON.stringify(s.lighting));
  console.log("end", JSON.stringify(s.endState.actors), JSON.stringify(s.endState.props.jam_jar));
});
