import { it } from "vitest";
import fs from "fs";
import { evaluate } from "../../src/engine/player/evaluate";
import { compileEpisode } from "../../src/compiler/episode";
import { FIXTURES } from "../../src/director/fixtures";
import { DEFAULT_REMIX } from "../../src/shared/schema";
it("fixtures", () => {
  const lines: string[] = [];
  for (const ep of FIXTURES) {
    const { timeline: tl } = compileEpisode(ep.paragraphs.map((p, i) => ({ paragraphId: `p${i}`, version: 1, beatScript: p.beatScript, remix: DEFAULT_REMIX })), ep.lang);
    lines.push(`== ${ep.id} ${ep.lang} dur ${tl.duration.toFixed(1)}`);
    let prev = evaluate(tl, 0);
    let n = 0;
    const t0 = Date.now(); let evals = 0;
    for (let k = 1; k < (tl.duration + 2) * 60; k++) {
      const T = k / 60; const f = evaluate(tl, T); evals++;
      for (const a of ["masha", "bear"] as const) {
        const A = prev.actors[a], B = f.actors[a];
        let maxAng = 0, bone = "";
        for (const b of Object.keys(B.bones)) { const p = A.bones[b] ?? [0,0,0,1], q = B.bones[b]; const d = Math.abs(p[0]*q[0]+p[1]*q[1]+p[2]*q[2]+p[3]*q[3]); const ang = 2*Math.acos(Math.min(1,d)); if (ang > maxAng) { maxAng = ang; bone = b; } }
        const dp = Math.hypot(B.pos[0]-A.pos[0], B.pos[1]-A.pos[1], B.pos[2]-A.pos[2]);
        const dh = Math.hypot(B.hipsOffset[0]-A.hipsOffset[0], B.hipsOffset[1]-A.hipsOffset[1], B.hipsOffset[2]-A.hipsOffset[2]);
        const dy = Math.abs(Math.atan2(Math.sin(B.yaw - A.yaw), Math.cos(B.yaw - A.yaw)));
        const dop = Math.abs(B.opacity - A.opacity);
        const run = B.verb === "run_to" || B.verb === "chase" || B.verb === "spin";
        if ((!run && (maxAng > 0.3 || dp > 0.06 || dh > 0.04 || dy > 0.12)) || dop > 0.2 || dp > 0.15) { if (n++ < 25) lines.push(`  jump T=${T.toFixed(2)} seg=${f.segmentIndex} lt=${f.localT.toFixed(2)} ${a} ${A.verb}->${B.verb} bone=${bone} ang=${maxAng.toFixed(2)} dp=${dp.toFixed(3)} dh=${dh.toFixed(3)} dy=${dy.toFixed(2)} op=${A.opacity.toFixed(2)}->${B.opacity.toFixed(2)} post=${A.posture}->${B.posture} y=${B.pos[1].toFixed(2)}`); }
      }
      prev = f;
    }
    lines.push(`  total jumps ${n}; ${((Date.now() - t0) / evals).toFixed(3)} ms/eval`);
  }
  fs.writeFileSync("/tmp/claude-0/-home-user-mabear/5b27cd5f-1fd9-5ed4-b3e5-584c0fb4204a/scratchpad/fixtures.txt", lines.join("\n"));
});
