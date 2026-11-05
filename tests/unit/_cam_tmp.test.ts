import { it } from "vitest";
import { FIXTURES } from "../../src/director/fixtures/index";
import { compileEpisode } from "../../src/compiler/episode";
import { DEFAULT_REMIX } from "../../src/shared/schema";
it("cam", () => {
  for (const id of ["pancake_morning", "bears_nap"]) {
    const ep = FIXTURES.find((f) => f.id === id && f.lang === "en")!;
    const r = compileEpisode(ep.paragraphs.map((p, i) => ({ paragraphId: String(i), version: 1, beatScript: p.beatScript, remix: DEFAULT_REMIX })), "en");
    const s = r.results[0].segment;
    console.log(id, "dur", s.duration);
    console.log(" beats", JSON.stringify(r.results[0].beatScript.beats.map((b) => [b.actor, b.verb, b.target, b.with_previous, b.line?.slice(0, 15)])));
    for (const a of ["masha", "bear"] as const) console.log(" ", a, s.actorClips[a].filter((c) => !c.params.ambient).map((c) => `${c.start.toFixed(1)}+${c.dur.toFixed(1)} ${c.verb}`).join(" | "));
    console.log(" dlg", s.dialogue.map((d) => `${d.actor} ${d.start.toFixed(1)}-${(d.start + d.dur).toFixed(1)}`).join(", "));
    console.log(" cam", s.camera.map((c) => `${c.start.toFixed(1)}+${c.dur.toFixed(1)} ${c.shot} look(${c.from.look[0].toFixed(1)},${c.from.look[2].toFixed(1)}) pos(${c.from.pos[0].toFixed(1)},${c.from.pos[2].toFixed(1)})`).join("\n      "));
  }
});
