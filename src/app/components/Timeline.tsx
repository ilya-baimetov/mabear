import { useRef } from "react";
import { useStore } from "../useStore";
import { playback } from "../playback";

export const BAND_COLORS = ["#6BBF59", "#F2B33D", "#E0569A", "#4BA3C7", "#9B7BD4", "#F07F4F", "#3FB59B", "#D9C24A"];

export function Timeline() {
  const s = useStore();
  const bar = useRef<HTMLDivElement>(null);
  const dur = s.timeline.duration;
  const toT = (clientX: number) => {
    const el = bar.current;
    if (!el || dur <= 0) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  };
  return (
    <div className="storybar-wrap">
      <div
        className="storybar"
        ref={bar}
        data-testid="timeline"
        data-duration={dur.toFixed(2)}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          playback.seek(toT(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) playback.seek(toT(e.clientX));
        }}
      >
        {s.timeline.segments.map((seg, i) => {
          const pid = s.segmentIds[i];
          const idx = s.paragraphs.findIndex((p) => p.id === pid);
          return (
            <div
              key={pid}
              className={`band ${s.selectedId === pid ? "sel" : ""}`}
              data-testid="timeline-band"
              style={{ left: `${(seg.offset / dur) * 100}%`, width: `${(seg.segment.duration / dur) * 100}%`, background: BAND_COLORS[idx % BAND_COLORS.length] }}
            >
              ¶{idx + 1}
            </div>
          );
        })}
        {dur > 0 && <div className="playhead" data-testid="playhead" data-t={s.t.toFixed(2)} style={{ left: `${(Math.min(s.t, dur) / dur) * 100}%` }} />}
      </div>
      <div className="time">{Math.min(s.t, dur).toFixed(1)} / {dur.toFixed(1)}s</div>
    </div>
  );
}
