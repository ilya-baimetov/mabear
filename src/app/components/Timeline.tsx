import { useRef } from "react";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";
import { store } from "../store";
import { Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";

export const BAND_COLORS = ["#759b88", "#c7ae78", "#bc88a1", "#7e9fa7", "#9e90b6", "#cc997f", "#7aab9c", "#b5ac77"];

export function Timeline() {
  const s = useStore();
  const t = useStrings();
  const bar = useRef<HTMLDivElement>(null);
  const dur = s.timeline.duration;
  const toT = (clientX: number) => {
    const el = bar.current;
    if (!el || dur <= 0) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  };
  return (
    <div className="transport">
      <div className="transport-row">
        {s.playing || s.waiting ? <button className="btn btn-primary" data-testid="pause" onClick={() => playback.pause()}><Pause size={18} fill="currentColor"/>{t.pause}</button> : <button className="btn btn-primary" data-testid="play-all" disabled={!s.paragraphs.some(p => p.text.trim())} onClick={() => { window.__mabear?.closeup(null); playback.playAll(); }}><Play size={18} fill="currentColor"/>{t.playAll}</button>}
        <button className="btn icon restart" title={s.lang === "en" ? "Back to the beginning" : "В начало"} aria-label={s.lang === "en" ? "Back to the beginning" : "В начало"} disabled={!dur} onClick={() => playback.seek(0)}><RotateCcw size={18}/></button>
        <button className="btn icon fullscreen-volume" aria-label={s.muted ? t.unmute : t.mute} onClick={() => store.setMuted(!s.muted)}>{s.muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
        <span className="transport-hint">{s.lang === "en" ? (s.playing ? "A little story is coming to life." : "Press play. Let the adventure unfold.") : (s.playing ? "Маленькая история оживает." : "Нажми «Играть» — приключение начинается.")}</span>
        <div className="time"><b>{Math.floor(Math.min(s.t,dur)/60)}:{String(Math.floor(Math.min(s.t,dur)%60)).padStart(2,"0")}</b><span> / {Math.floor(dur/60)}:{String(Math.floor(dur%60)).padStart(2,"0")}</span></div>
      </div>
      <div className="storybar-wrap">
      <div
        className="storybar"
        ref={bar}
        data-testid="timeline"
        data-duration={dur.toFixed(2)}
        role="slider" tabIndex={0} aria-label={s.lang === "en" ? "Story progress" : "Ход истории"} aria-valuemin={0} aria-valuemax={dur} aria-valuenow={Math.min(s.t,dur)}
        onKeyDown={e => { if (["ArrowRight","ArrowLeft","Home","End"].includes(e.key)) { e.preventDefault(); playback.seek(e.key === "Home" ? 0 : e.key === "End" ? dur : s.t + (e.key === "ArrowRight" ? 1 : -1)); } }}
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
              {String(idx + 1).padStart(2,"0")}
            </div>
          );
        })}
        {dur > 0 && <div className="playhead" data-testid="playhead" data-t={s.t.toFixed(2)} style={{ left: `${(Math.min(s.t, dur) / dur) * 100}%` }} />}
      </div>
      </div>
    </div>
  );
}
