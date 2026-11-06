import { useRef } from "react";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";
import { store } from "../store";
import { selectedMoment } from "../storyFlow";
import { revealStage } from "./studioView";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Film, LoaderCircle } from "lucide-react";

export const BAND_COLORS = ["#a2bba2", "#d5ba81", "#cea6bb", "#9cbfc6", "#b8acd0", "#d3ac91", "#94bdae", "#c3c18c"];
const timecode = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

export function Timeline() {
  const s = useStore(), t = useStrings();
  const p = selectedMoment(s);
  const bar = useRef<HTMLDivElement>(null);
  const dur = s.timeline.duration;
  const activeIndex = s.timeline.segments.findIndex(seg => s.t >= seg.offset && s.t < seg.offset + seg.segment.duration);
  const index = s.paragraphs.findIndex(x => x.id === p?.id);
  const range = p ? store.segmentRange(p.id) : null;
  const wholeStory = s.previewScope?.kind === "story";
  const previousRange = s.paragraphs.slice(0, index).reverse().map(moment => store.segmentRange(moment.id)).find(Boolean);
  const scopeStart = wholeStory ? 0 : range?.start ?? previousRange?.end ?? 0;
  const scopeDur = wholeStory ? dur : range ? range.end - range.start : 0;
  const scopeT = Math.max(0, Math.min(s.t - scopeStart, scopeDur));
  const preview = () => { if (!p) return; if (p.error) store.retry(p.id); window.__mabear?.closeup(null); revealStage(); playback.playParagraph(p.id); };
  const seekTo = (time: number) => {
    const bounded = Math.max(0, Math.min(scopeDur, time));
    playback.seek(scopeStart + bounded);
  };
  const toT = (clientX: number) => {
    const el = bar.current;
    if (!el || scopeDur <= 0) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * scopeDur;
  };
  return <div className="transport moment-transport">
    <div className="transport-row">
      {s.playing || s.waiting ? <button className="btn btn-primary" data-testid="pause" onClick={() => playback.pause()}>{s.waiting ? <LoaderCircle size={17} className="spin"/> : <Pause size={17} fill="currentColor"/>}{s.lang === "en" ? "Pause" : "Пауза"}</button> : <button className="btn btn-primary" data-testid="preview-selected" disabled={!s.stageReady || !p?.text.trim()} onClick={preview}><Play size={17} fill="currentColor"/>{s.lang === "en" ? "Preview moment" : "Смотреть момент"}</button>}
      <button className="btn icon restart" title={s.lang === "en" ? "Back to preview start" : "К началу просмотра"} aria-label={s.lang === "en" ? "Back to preview start" : "К началу просмотра"} disabled={!scopeDur} onClick={() => playback.seek(scopeStart)}><RotateCcw size={17}/></button>
      <div className="transport-context"><strong>{s.previewScope?.kind === "story" ? (s.title || (s.lang === "en" ? "The whole story" : "Вся история")) : (s.lang === "en" ? `Moment ${index + 1}` : `Момент ${index + 1}`)}</strong><span>{s.previewScope?.kind === "story" ? (s.lang === "en" ? "All moments, in order" : "Все моменты по порядку") : (s.lang === "en" ? "Only this moment plays" : "Играет только этот момент")}</span></div>
      <button className="btn watch-story" data-testid="play-all" aria-label={s.lang === "en" ? "Watch whole story" : "Смотреть всю историю"} disabled={!s.stageReady || !s.paragraphs.some(x => x.text.trim())} onClick={() => { revealStage(); playback.playAll(); }}><Film size={16}/><span>{s.lang === "en" ? "Whole story" : "Вся история"}</span></button>
      <div className="volume"><button className="btn icon" data-testid="mute" title={s.muted || s.volume === 0 ? t.unmute : t.mute} aria-label={s.muted || s.volume === 0 ? t.unmute : t.mute} onClick={() => { if (s.volume === 0) store.setVolume(0.8); store.setMuted(s.volume === 0 ? false : !s.muted); }}>{s.muted || s.volume === 0 ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button><input type="range" min={0} max={1} step={0.05} value={s.volume} aria-label={t.volume} onChange={e => store.setVolume(Number(e.target.value))}/></div>
      <div className="time"><b>{timecode(scopeT)}</b><span> / {timecode(scopeDur)}</span></div>
    </div>
    <div className="storybar-wrap"><div className="storybar" ref={bar} data-testid="timeline" data-duration={scopeDur.toFixed(2)} data-scope={wholeStory ? "story" : "moment"} role="slider" tabIndex={0} aria-label={wholeStory ? (s.lang === "en" ? "Story progress" : "Ход истории") : (s.lang === "en" ? "Moment progress" : "Ход момента")} aria-valuemin={0} aria-valuemax={scopeDur} aria-valuenow={scopeT} aria-valuetext={`${timecode(scopeT)} / ${timecode(scopeDur)}`}
      onKeyDown={e => { if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) { e.preventDefault(); seekTo(e.key === "Home" ? 0 : e.key === "End" ? scopeDur : scopeT + (e.key === "ArrowRight" ? 1 : -1)); } }}
      onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); seekTo(toT(e.clientX)); }} onPointerMove={e => { if (e.buttons & 1) seekTo(toT(e.clientX)); }}>
      {!scopeDur && <span className="timeline-empty">{s.lang === "en" ? `Preview moment ${index + 1} to begin` : `Посмотри момент ${index + 1}, чтобы начать`}</span>}
      {wholeStory && s.timeline.segments.map((seg, i) => {
        const pid = s.segmentIds[i], idx = s.paragraphs.findIndex(x => x.id === pid);
        return <div key={pid} className={`band ${activeIndex === i && s.playing ? "playing" : ""}`} data-testid="timeline-band" style={{ left: `${(seg.offset / dur) * 100}%`, width: `${(seg.segment.duration / dur) * 100}%`, background: BAND_COLORS[idx % BAND_COLORS.length] }}><span>{String(idx + 1).padStart(2, "0")}</span></div>;
      })}
      {!wholeStory && scopeDur > 0 && <div className="band sel moment-band" data-testid="timeline-band" style={{ left: 0, width: "100%", background: BAND_COLORS[Math.max(0, index) % BAND_COLORS.length] }}>{s.lang === "en" ? `MOMENT ${index + 1}` : `МОМЕНТ ${index + 1}`}</div>}
      {scopeDur > 0 && <div className="playhead" data-testid="playhead" data-t={scopeT.toFixed(2)} style={{ left: `${(scopeT / scopeDur) * 100}%` }}/>}
    </div></div>
  </div>;
}
