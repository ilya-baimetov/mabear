// Behind-the-scenes funder overlay (spec §4.4). Hidden by default; ?pitch=1 or Shift+B. Never shown to players.
import { useEffect, useState } from "react";
import { costUsd, VIDEO_BITRATE_LABEL, VIDEO_BYTES_PER_SECOND } from "../../shared/pricing";
import { DIRECTOR_MODELS, type DirectorModel } from "../../shared/schema";
import { exportLog, store } from "../store";
import { useStore, useStrings } from "../useStore";
import { fmt } from "../i18n";
import { playback } from "../playback";
import { DataView } from "./DataView";
import { Economics, bytes, usd } from "./Economics";
import { SystemLayers } from "./SystemLayers";

function useStats() {
  const [stats, setStats] = useState<{ fps: number; drawCalls: number; triangles: number } | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      try {
        setStats(playback.player ? window.__mabear?.stats() ?? null : null);
      } catch {
        setStats(null);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  return stats;
}

export function BehindTheScenes() {
  const s = useStore();
  const t = useStrings();
  const stats = useStats();
  const pid = s.selectedId ?? s.paragraphs[0]?.id ?? null;
  const p = s.paragraphs.find((x) => x.id === pid) ?? null;
  const v = p ? p.versions[p.current] : null;
  const si = pid ? s.segmentIds.indexOf(pid) : -1;
  const result = si >= 0 ? s.results[si] : null;
  const seg = result?.segment ?? null;
  const planBytes = seg ? new TextEncoder().encode(JSON.stringify(seg)).length : 0;
  const cost = v ? costUsd(v.model, v.usage) : 0;
  const counts = seg
    ? { dialogue: seg.dialogue.length, vocals: seg.emotes.length, foley: seg.foley.length, sfx: seg.sfx.length, ambience: seg.ambience.length, music: seg.music.length, ducking: seg.ducking.length }
    : null;

  const download = () => {
    const blob = new Blob([exportLog()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mabear-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <aside className="bts" data-testid="behind-the-scenes">
      <div className="bts-head">
        <h2>🎬 {t.bts.title}</h2>
        <button className="btn small" onClick={() => store.setPitch(false)}>✕ {t.bts.close}</button>
      </div>
      {!p || !v ? (
        <p>{t.bts.selectParagraph}</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi" data-testid="plan-size">
              <div className="k">{t.bts.planSize}</div>
              <div className="v">{bytes(planBytes)}</div>
              <div className="s">{t.bts.videoEquivalent}: {bytes((seg?.duration ?? 0) * VIDEO_BYTES_PER_SECOND)} <span title={VIDEO_BITRATE_LABEL}>ⓘ</span></div>
              <div className="s">{VIDEO_BITRATE_LABEL}</div>
            </div>
            <div className="kpi" data-testid="cost">
              <div className="k">{t.bts.cost}</div>
              <div className="v">{usd(cost)}</div>
              <div className="s">{v.model} · {t.bts.source}: {v.source.toUpperCase()}</div>
              <div className="s">{t.bts.latency}: {v.latencyMs} ms</div>
              {v.usage && <div className="s">{t.bts.tokens}: {v.usage.input_tokens} / {v.usage.output_tokens} / {v.usage.cache_read_input_tokens} / {v.usage.cache_creation_input_tokens}</div>}
            </div>
            <div className="kpi" data-testid="fps">
              <div className="k">{t.bts.render}</div>
              <div className="v">{stats ? `${stats.fps.toFixed(0)} ${t.bts.fps}` : "—"}</div>
              <div className="s">{t.bts.drawCalls}: {stats?.drawCalls ?? "—"}</div>
              <div className="s">{t.bts.renderedHere}</div>
            </div>
          </div>
          <div className="model-toggle">
            <span>{t.bts.model}:</span>
            {DIRECTOR_MODELS.map((m) => (
              <button key={m} className={`btn small ${s.model === m || (!s.model && m === "claude-opus-5-5") ? "on" : ""}`} onClick={() => store.setModel(m as DirectorModel)}>{m}</button>
            ))}
          </div>
          {p.lastRemixMs !== null && <div className="remixed" data-testid="remixed">{fmt(t.bts.remixed, { ms: p.lastRemixMs })}</div>}
          <Economics durationS={seg?.duration ?? 0} planBytes={planBytes} directorCost={cost} />
          {seg && <DataView segment={seg} />}
          <section className="bts-sec" data-testid="rule-report">
            <h3>{t.bts.rules}</h3>
            {v.ruleHits.length === 0 ? (
              <p className="note">{t.bts.noRules}</p>
            ) : (
              <table className="rules">
                <thead><tr><th>Rule</th><th>Original</th><th>Replacement</th><th>Explanation</th></tr></thead>
                <tbody>
                  {v.ruleHits.map((h, i) => (
                    <tr key={i}><td><code>{h.rule}</code></td><td>{h.original}</td><td>{h.replacement}</td><td>{h.kid_message}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {counts && (
            <section className="bts-sec" data-testid="audio-cues">
              <h3>{t.bts.audioCues}</h3>
              <div className="cue-counts">
                {Object.entries(counts).map(([k, n]) => <span key={k} className="achip">{k}: {n}</span>)}
              </div>
            </section>
          )}
          <details className="bts-sec">
            <summary>{t.bts.beatScript} · {t.bts.source}: {v.source.toUpperCase()}</summary>
            <pre className="json">{JSON.stringify(v.beatScript, null, 2)}</pre>
          </details>
        </>
      )}
      <SystemLayers />
      <button className="btn" data-testid="export-log" onClick={download}>⬇ {t.bts.exportLog}</button>
    </aside>
  );
}
