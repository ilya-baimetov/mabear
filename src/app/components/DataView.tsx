// Read-only data view of a paragraph's compiled timeline as tracks (spec §4.4, D8).
import type { Segment } from "../../shared/schema";
import { useStrings } from "../useStore";

interface Block {
  start: number;
  dur: number;
  label: string;
  tick?: boolean;
}

const TRACK_COLORS: Record<string, string> = {
  Masha: "#E0569A",
  Bear: "#8B5A3C",
  Camera: "#4BA3C7",
  Dialogue: "#F2B33D",
  Vocals: "#F07F4F",
  Foley: "#7C8A6A",
  SFX: "#9B7BD4",
  Ambience: "#3FB59B",
  Music: "#6BBF59",
  Light: "#D9C24A",
};

export function tracksOf(seg: Segment): { name: string; blocks: Block[] }[] {
  const d = seg.duration;
  return [
    { name: "Masha", blocks: seg.actorClips.masha.map((c) => ({ start: c.start, dur: c.dur, label: c.verb })) },
    { name: "Bear", blocks: seg.actorClips.bear.map((c) => ({ start: c.start, dur: c.dur, label: c.verb })) },
    { name: "Camera", blocks: seg.camera.map((c) => ({ start: c.start, dur: c.dur, label: c.shot })) },
    { name: "Dialogue", blocks: seg.dialogue.map((c) => ({ start: c.start, dur: c.dur, label: `${c.actor}: ${c.text}` })) },
    { name: "Vocals", blocks: seg.emotes.map((c) => ({ start: c.start, dur: Math.max(0.3, c.dur), label: c.emote })) },
    { name: "Foley", blocks: seg.foley.map((c) => ({ start: c.start, dur: 0.08, label: `${c.id} (${c.surface})`, tick: true })) },
    { name: "SFX", blocks: seg.sfx.map((c) => ({ start: c.start, dur: 0.4, label: c.id })) },
    { name: "Ambience", blocks: seg.ambience.map((c, i, a) => ({ start: c.start, dur: (a[i + 1]?.start ?? d) - c.start, label: c.layers.join(" + ") || "silence" })) },
    { name: "Music", blocks: seg.music.map((c, i, a) => ({ start: c.start, dur: (a[i + 1]?.start ?? d) - c.start, label: `${c.mood} · ${c.intensity}` })) },
    { name: "Light", blocks: seg.lighting.map((c, i, a) => ({ start: c.start, dur: (a[i + 1]?.start ?? d) - c.start, label: c.timeOfDay })) },
  ];
}

export function DataView({ segment }: { segment: Segment }) {
  const t = useStrings();
  const d = Math.max(segment.duration, 0.1);
  return (
    <section className="bts-sec" data-testid="data-view">
      <h3>{t.bts.dataView}</h3>
      <p className="label-moat">{t.bts.dataViewLabel}</p>
      <div className="tracks">
        {tracksOf(segment).map((tr) => (
          <div className="track" key={tr.name}>
            <div className="track-name">{tr.name}</div>
            <div className="track-lane">
              {tr.blocks.map((b, i) => (
                <div
                  key={i}
                  className={`blk ${b.tick ? "tick" : ""}`}
                  title={`${b.label} @ ${b.start.toFixed(2)}s`}
                  style={{ left: `${(b.start / d) * 100}%`, width: b.tick ? "2px" : `${Math.max(0.5, (b.dur / d) * 100)}%`, background: TRACK_COLORS[tr.name] }}
                >
                  {!b.tick && <span>{b.label}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
