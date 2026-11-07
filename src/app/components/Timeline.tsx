import { useRef } from "react";
import { useStore, useStrings } from "../useStore";
import { playback, playbackRange } from "../playback";
import { store } from "../store";
import { selectedMoment } from "../storyFlow";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Film, LoaderCircle, RefreshCw, Clapperboard } from "lucide-react";

export const BAND_COLORS = ["#f7c84f", "#e9b5d1", "#cdb7e6", "#a9dcd5", "#f5ba91", "#d6d49a", "#a9cde7", "#ecc0db"];
export const timecode = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

function voiceErrorText(code: string, lang: "en" | "ru"): string {
  const english = lang === "en";
  if (code === "voice_allowance_reached") return english
    ? "New voice recordings are paused because the voice allowance is used up. Your story and existing recordings are saved."
    : "Лимит новых реплик исчерпан. История и готовые записи сохранены.";
  if (code === "speech_submission_needs_review" || code === "speech_generation_failed") return english
    ? "This line needs a voice check before it can play. Your story is saved."
    : "Перед воспроизведением нужно проверить запись этой реплики. История сохранена.";
  if (code === "speech_not_configured") return english
    ? "The voice service needs to be connected. Your story is saved."
    : "Нужно подключить озвучивание. История сохранена.";
  if (code === "audio_unavailable") return english
    ? "This browser cannot play the voice recordings. Open your saved story in a browser with audio support."
    : "Браузер не поддерживает озвучивание. Откройте сохранённую историю в браузере с поддержкой звука.";
  return english ? "Masha’s voice is not ready. Your story is saved. Press Play to retry."
    : "Голос Маши пока не готов. История сохранена. Нажмите «Смотреть», чтобы повторить.";
}

/** Scope lives above the picture, so it cannot disappear into transport overflow. */
export function PlayerScope() {
  const s = useStore(), p = selectedMoment(s), story = s.previewScope?.kind !== "moment";
  const index = s.paragraphs.findIndex(x => x.id === p?.id);
  return <div className="player-heading">
    <span className="player-label"><Film size={14}/>{s.lang === "en" ? "MOVIE" : "ФИЛЬМ"}</span>
    <div className="player-scope-switch" role="group" aria-label={s.lang === "en" ? "Playback scope" : "Что смотреть"}>
      <button data-testid="scope-story" aria-pressed={story} onClick={() => playback.setScope({ kind: "story" })}><Film size={15}/>{s.lang === "en" ? "Entire story" : "Вся история"}<span>{s.paragraphs.length}</span></button>
      <button data-testid="scope-moment" aria-pressed={!story} disabled={!p} onClick={() => p && playback.setScope({ kind: "moment", id: p.id })}><Clapperboard size={15}/>{s.lang === "en" ? `Moment ${index + 1}` : `Момент ${index + 1}`}</button>
    </div>
    <span className="player-scope-caption">{story ? (s.lang === "en" ? "All moments, in order" : "Все моменты по порядку") : (s.lang === "en" ? "Selected moment only" : "Только выбранный момент")}</span>
  </div>;
}
export function Timeline() {
  const s = useStore(), t = useStrings();
  const p = selectedMoment(s), bar = useRef<HTMLDivElement>(null);
  const range = playbackRange(s), wholeStory = range.scope.kind === "story";
  const index = s.paragraphs.findIndex(x => x.id === (range.scope.kind === "moment" ? range.scope.id : p?.id));
  const scopeDur = range.end - range.start, scopeT = Math.max(0, Math.min(s.t - range.start, scopeDur));
  const activeIndex = s.timeline.segments.findIndex(seg => s.t >= seg.offset && s.t < seg.offset + seg.segment.duration);
  const ended = scopeDur > 0 && scopeT >= scopeDur - .001;
  const running = s.playing || s.waiting;
  const dirty = s.paragraphs.some(x => x.status === "draft" && (x.text.trim() || x.current >= 0));
  const playable = scopeDur > 0 || (wholeStory ? s.paragraphs.some(x => x.text.trim()) : !!p?.text.trim());
  const seekTo = (time: number) => playback.seek(range.start + Math.max(0, Math.min(scopeDur, time)));
  const toT = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    return r && scopeDur > 0 ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * scopeDur : 0;
  };
  return <div className="transport moment-transport">
    {s.voiceError&&<div className="voice-error" role="alert" data-testid="voice-error">{voiceErrorText(s.voiceError, s.lang)}</div>}
    <div className="compact-scope" role="group" aria-label={s.lang === "en" ? "Player scope" : "Режим просмотра"}>
      <button data-testid="mobile-scope-story" aria-pressed={wholeStory} onClick={() => playback.setScope({ kind: "story" })}>{s.lang === "en" ? "Entire story" : "Вся история"}</button>
      <button aria-pressed={!wholeStory} disabled={!p} onClick={() => p && playback.setScope({ kind: "moment", id: p.id })}>{s.lang === "en" ? `Moment ${s.paragraphs.findIndex(x => x.id === p?.id) + 1}` : `Момент ${s.paragraphs.findIndex(x => x.id === p?.id) + 1}`}</button>
    </div>
    <div className="storybar-wrap"><div className="storybar" ref={bar} data-testid="timeline" data-duration={scopeDur.toFixed(2)} data-scope={wholeStory ? "story" : "moment"} role="slider" tabIndex={0} aria-label={wholeStory ? (s.lang === "en" ? "Story progress" : "Ход истории") : (s.lang === "en" ? "Moment progress" : "Ход момента")} aria-valuemin={0} aria-valuemax={scopeDur} aria-valuenow={scopeT} aria-valuetext={`${timecode(scopeT)} / ${timecode(scopeDur)}`}
      onKeyDown={e => { if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) { e.preventDefault(); seekTo(e.key === "Home" ? 0 : e.key === "End" ? scopeDur : scopeT + (e.key === "ArrowRight" ? 1 : -1)); } }}
      onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); seekTo(toT(e.clientX)); }} onPointerMove={e => { if (e.buttons & 1) seekTo(toT(e.clientX)); }}>
      {!scopeDur && <span className="timeline-empty">{s.lang === "en" ? "Your movie will appear here" : "Здесь появится твой фильм"}</span>}
      {wholeStory && s.timeline.segments.map((seg, i) => {
        const pid = s.segmentIds[i], idx = s.paragraphs.findIndex(x => x.id === pid);
        return <div key={pid} className={`band ${activeIndex === i ? "playing" : ""}`} data-testid="timeline-band" style={{ left: `${(seg.offset / scopeDur) * 100}%`, width: `${(seg.segment.duration / scopeDur) * 100}%`, background: BAND_COLORS[idx % BAND_COLORS.length] }}><span>{String(idx + 1).padStart(2, "0")}</span></div>;
      })}
      {!wholeStory && scopeDur > 0 && <div className="band sel moment-band" data-testid="timeline-band" style={{ left: 0, width: "100%", background: BAND_COLORS[Math.max(0, index) % BAND_COLORS.length] }}>{s.lang === "en" ? `MOMENT ${index + 1}` : `МОМЕНТ ${index + 1}`}</div>}
      {scopeDur > 0 && <div className="playhead" data-testid="playhead" data-t={scopeT.toFixed(2)} style={{ left: `${(scopeT / scopeDur) * 100}%` }}/>}
    </div></div>
    <div className="transport-row">
      <button className="btn btn-primary player-toggle" data-testid={running ? "pause" : "play"} disabled={!s.stageReady || !running && !playable} aria-keyshortcuts="Space" onClick={() => running ? playback.pause() : playback.play()}>{s.waiting ? <LoaderCircle size={18} className="spin"/> : running ? <Pause size={18} fill="currentColor"/> : ended ? <RotateCcw size={18}/> : <Play size={18} fill="currentColor"/>}{running ? (s.lang === "en" ? "Pause" : "Пауза") : ended ? (s.lang === "en" ? "Replay" : "Повтор") : (s.lang === "en" ? "Play" : "Смотреть")}</button>
      <button className="btn icon restart" data-testid="replay" title={s.lang === "en" ? "Replay from start" : "Повторить с начала"} aria-label={s.lang === "en" ? "Replay from start" : "Повторить с начала"} disabled={!scopeDur || s.waiting} onClick={() => playback.replay()}><RotateCcw size={16}/></button>
      <div className="time" aria-live="off"><b>{timecode(scopeT)}</b><span> / {timecode(scopeDur)}</span></div>
      <span className="transport-state">{s.preparingVoice?(s.lang==='en'?'Preparing Masha’s voice…':'Готовим голос Маши…'):s.waiting ? (s.lang === "en" ? "Preparing…" : "Готовим…") : s.playing ? (s.lang === "en" ? "Playing" : "Играет") : ended ? (s.lang === "en" ? "Finished" : "Конец") : scopeT > 0 ? (s.lang === "en" ? "Paused" : "Пауза") : (s.lang === "en" ? "Ready to play" : "Готово к просмотру")}</span>
      {wholeStory && dirty && scopeDur > 0 && <button className="btn update-story" data-testid="update-story" disabled={!s.stageReady || s.waiting} onClick={() => playback.playAll()}><RefreshCw size={14}/>{s.lang === "en" ? "Update story" : "Обновить"}</button>}
      <div className="volume"><button className="btn icon" data-testid="mute" title={s.muted || s.volume === 0 ? t.unmute : t.mute} aria-label={s.muted || s.volume === 0 ? t.unmute : t.mute} onClick={() => { if (s.volume === 0) store.setVolume(0.8); store.setMuted(s.volume === 0 ? false : !s.muted); }}>{s.muted || s.volume === 0 ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button><input type="range" min={0} max={1} step={0.05} value={s.volume} aria-label={t.volume} onChange={e => store.setVolume(Number(e.target.value))}/></div>
    </div>
  </div>;
}
