// Behind-the-scenes funder overlay (spec §4.4). Hidden by default; ?pitch=1 or Shift+B. Never shown to players.
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { costUsd, MODEL_PRICES, VIDEO_BITRATE_LABEL, VIDEO_BYTES_PER_SECOND } from "../../shared/pricing";
import type { LogEntry, Usage } from "../../shared/schema";
import { DIRECTOR_MODELS, type DirectorModel } from "../../shared/schema";
import { exportLog, store } from "../store";
import { shallowEqual, useStoreSelector } from "../useStore";
import { fmt, STRINGS } from "../i18n";
import { playback } from "../playback";
import { getStageController } from "../stageController";
import type {} from "../debugBridge";
import { DataView } from "./DataView";
import { Economics, bytes, usd } from "./Economics";
import { SystemLayers } from "./SystemLayers";
import { VoicePicker } from "./VoicePicker";

/** Mean usage of real director calls in the tracking log (null if none). */
function meanLlmUsage(): Usage | null {
  try {
    const all = (JSON.parse(exportLog()) as LogEntry[]).filter((e) => e.source === "llm" && e.usage);
    if (!all.length) return null;
    const sum: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    for (const e of all) for (const k of Object.keys(sum) as (keyof Usage)[]) sum[k] += (e.usage as Usage)[k] / all.length;
    return sum;
  } catch {
    return null;
  }
}
/** Typical director call (assumption until a real call is logged): ~1.2k input, ~1.5k output, ~8k cached system prompt. */
const TYPICAL_USAGE: Usage = { input_tokens: 1200, output_tokens: 1500, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0 };

function useStats() {
  const [stats, setStats] = useState<{ fps: number; drawCalls: number; triangles: number } | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      try {
        setStats(playback.player ? getStageController()?.stats() ?? null : null);
      } catch {
        setStats(null);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  return stats;
}

export function BehindTheScenes() {
  const s = useStoreSelector(
    (st) => ({
      lang: st.lang,
      selectedId: st.selectedId,
      paragraphs: st.paragraphs,
      segmentIds: st.segmentIds,
      results: st.results,
      model: st.model,
      timelineRevision: st.timelineRevision,
    }),
    shallowEqual,
  );
  const t = STRINGS[s.lang];
  const stats = useStats();
  const pid = s.selectedId ?? s.paragraphs[0]?.id ?? null;
  const p = s.paragraphs.find((x) => x.id === pid) ?? null;
  const v = p ? p.versions[p.current] : null;
  const si = pid ? s.segmentIds.indexOf(pid) : -1;
  const result = si >= 0 ? s.results[si] : null;
  const seg = result?.segment ?? null;
  const planBytes = useMemo(() => (seg ? new TextEncoder().encode(JSON.stringify(seg)).length : 0), [seg]);
  const meanUsage = useMemo(() => meanLlmUsage(), [s.paragraphs, s.timelineRevision]);
  const measured = v && v.usage && MODEL_PRICES[v.model] ? costUsd(v.model, v.usage) : null;
  const cost = v?.cached ? 0 : measured ?? 0;
  const estimate = costUsd(s.model ?? "claude-opus-5-5", meanUsage ?? TYPICAL_USAGE);
  const why = v ? (v.cached ? t.bts.cache : v.source === "fixture" ? t.bts.stagedFixture : t.bts.stagedOffline) : "";
  const econCost = measured !== null && !v?.cached ? measured : estimate;
  const econNote = measured !== null && !v?.cached ? t.bts.measured : fmt(t.bts.estimated, { why });
  const stagedBy = v ? (v.source === "llm" ? t.bts.stagedLlm : v.source === "fixture" ? t.bts.stagedFixture : t.bts.stagedOffline) : "";
  const counts = seg
    ? { dialogue: seg.dialogue.length, vocals: seg.emotes.length, foley: seg.foley.length, sfx: seg.sfx.length, ambience: seg.ambience.length, music: seg.music.length, ducking: seg.ducking.length }
    : null;
  const cueLabels = s.lang === "en"
    ? { dialogue: "dialogue", vocals: "vocals", foley: "foley", sfx: "sfx", ambience: "ambience", music: "music", ducking: "ducking" }
    : { dialogue: "речь", vocals: "возгласы", foley: "шумы", sfx: "эффекты", ambience: "атмосфера", music: "музыка", ducking: "приглушение" };
  const bitrateLabel = s.lang === "en" ? VIDEO_BITRATE_LABEL : "H.264 1080p @ ~8 Мбит/с ≈ 1 МБ/с";

  const download = () => {
    const blob = new Blob([exportLog()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mabear-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <aside className="bts" data-testid="behind-the-scenes" aria-label={s.lang === "en" ? "Behind the scenes inspector" : "Как устроена сцена"}>
      <div className="bts-head bts-head-row">
        <h2><span aria-hidden="true">🎬</span> {t.bts.title}</h2>
        <button type="button" className="btn small bts-close" onClick={() => store.setPitch(false)}>
          <X size={15} aria-hidden="true" />
          <span>{t.bts.close}</span>
        </button>
      </div>
      {!p || !v ? (
        <p>{t.bts.selectParagraph}</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi" data-testid="plan-size">
              <div className="k">{t.bts.planSize}</div>
              <div className="v">{bytes(planBytes)}</div>
              <div className="s">{t.bts.videoEquivalent}: {bytes((seg?.duration ?? 0) * VIDEO_BYTES_PER_SECOND)} <span title={bitrateLabel} aria-hidden="true">ⓘ</span></div>
              <div className="s">{bitrateLabel}</div>
            </div>
            <div className="kpi" data-testid="cost">
              <div className="k">{t.bts.cost}</div>
              <div className="v">{usd(cost)}</div>
              {v.cached && measured !== null && <div className="s">{fmt(t.bts.cachedNow, { cost: usd(measured) })}</div>}
              <div className="s">{v.model} · {t.bts.source}: {v.source.toUpperCase()}</div>
              <div className="s">{t.bts.latency}: {v.latencyMs} {s.lang === "en" ? "ms" : "мс"}</div>
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
              <button
                type="button"
                key={m}
                className={`btn small ${s.model === m || (!s.model && m === "claude-opus-5-5") ? "on" : ""}`}
                aria-pressed={s.model === m || (!s.model && m === "claude-opus-5-5")}
                onClick={() => store.setModel(m as DirectorModel)}
              >
                {m}
              </button>
            ))}
          </div>
          {p.lastRemixMs !== null && <div className="remixed" data-testid="remixed">{fmt(t.bts.remixed, { ms: p.lastRemixMs })}</div>}
          <div className="staged-by" data-testid="staged-by">{t.bts.stagedBy}: <b>{stagedBy}</b></div>
          <Economics durationS={seg?.duration ?? 0} planBytes={planBytes} directorCost={econCost} costNote={econNote} />
          {seg && <DataView segment={seg} />}
          <section className="bts-sec" data-testid="rule-report">
            <h3>{t.bts.rules}</h3>
            {v.ruleHits.length === 0 ? (
              <p className="note">{t.bts.noRules}</p>
            ) : (
              <table className="rules">
                <thead>
                  <tr>
                    <th scope="col">{t.bts.rule}</th>
                    <th scope="col">{t.bts.original}</th>
                    <th scope="col">{t.bts.replacement}</th>
                    <th scope="col">{t.bts.explanation}</th>
                  </tr>
                </thead>
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
                {(Object.entries(counts) as [keyof typeof counts, number][]).map(([k, n]) => (
                  <span key={k} className="achip">{cueLabels[k]}: {n}</span>
                ))}
              </div>
              <div className="cue-counts" data-testid="tts-voices">
                {Object.entries(window.__mabearAudio?.voices ?? {}).map(([k, n]) => (
                  <span key={k} className="achip">{k} → {n}</span>
                ))}
              </div>
              <VoicePicker />
            </section>
          )}
          <details className="bts-sec">
            <summary>{t.bts.beatScript} · {t.bts.source}: {v.source.toUpperCase()}</summary>
            <pre className="json">{JSON.stringify(v.beatScript, null, 2)}</pre>
          </details>
        </>
      )}
      <SystemLayers />
      <button type="button" className="btn" data-testid="export-log" onClick={download}>
        <span aria-hidden="true">⬇</span> {t.bts.exportLog}
      </button>
    </aside>
  );
}
