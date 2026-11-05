// TEMPORARY (motion subagent visual check) — deleted after use.
import { createStage } from "../src/engine/stage";
import { evaluate } from "../src/engine/player/evaluate";
import { compileEpisode } from "../src/compiler/episode";
import { FIXTURES } from "../src/director/fixtures";
import { DEFAULT_REMIX, type CamKey } from "../src/shared/schema";
const canvas = document.getElementById("c") as HTMLCanvasElement;
const stage = await createStage(canvas);
stage.resize(960, 540);
const tls: Record<string, any> = {};
for (const ep of FIXTURES.filter((e) => e.lang === "en")) tls[ep.id] = compileEpisode(ep.paragraphs.map((p, i) => ({ paragraphId: `p${i}`, version: 1, beatScript: p.beatScript, remix: DEFAULT_REMIX })), "en").timeline;
(window as any).renderAt = (id: string, t: number, cam?: string) => {
  const f = id === "empty" ? evaluate({ segments: [], duration: 0 }, t) : evaluate(tls[id], t);
  if (cam) {
    const [who, dist] = cam.split(":");
    const a = f.actors[who as "masha" | "bear"];
    const h = who === "bear" ? 1.4 : 0.6;
    const d = Number(dist || (who === "bear" ? 4.5 : 2.4));
    const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
    const ox = 0.45 * d, oz = d; // front three-quarter in the actor's frame
    const c: CamKey = { pos: [a.pos[0] + ox * cy + oz * sy, a.pos[1] + h + 0.3, a.pos[2] - ox * sy + oz * cy], look: [a.pos[0], a.pos[1] + h * 0.8, a.pos[2]], fov: 40 };
    f.camera = c;
  }
  stage.render(f);
  return { m: f.actors.masha.verb, b: f.actors.bear.verb, mp: f.actors.masha.pos, bp: f.actors.bear.pos, mpost: f.actors.masha.posture, bpost: f.actors.bear.posture, dur: id === "empty" ? 0 : tls[id].duration };
};
(window as any).ready = true;
