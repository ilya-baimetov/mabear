import { useRef, useState } from "react";
import { useStore, useStrings } from "../useStore";
import { playback, playbackRange } from "../playback";
import { store } from "../store";
import { selectedMoment } from "../storyFlow";
import { CHARACTERS } from "../../shared/bible/characters";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Film, LoaderCircle, RefreshCw, Clapperboard, Repeat, Captions } from "lucide-react";

export const BAND_COLORS = ["#f7c84f", "#e9b5d1", "#cdb7e6", "#a9dcd5", "#f5ba91", "#d6d49a", "#a9cde7", "#ecc0db"];
export const timecode = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

function formatTime(value: number, scopeDur: number, lang: "en" | "ru"): string {
  if (scopeDur > 0 && scopeDur < 10) return `${value.toFixed(1)}${lang === "en" ? "s" : "с"}`;
  return timecode(value);
}

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
    : "Браузер не поддерживает озвучивание. Открой сохранённую историю в браузере со звуком.";
  return english ? "Masha’s voice is not ready yet. Your story is saved — press Retry or Play."
    : "Голос Маши пока не готов. История сохранена — нажми «Повторить» или «Смотреть».";
}

/** Scope lives above the picture, so it cannot disappear into transport overflow. */
export function PlayerScope() {
  const s = useStore(), p = selectedMoment(s), story = s.previewScope?.kind !== "moment";
  const index = s.paragraphs.findIndex(x => x.id === p?.id);
  return <div className="player-heading">
    <span className="player-label"><Film size={14} aria-hidden="true"/>{s.lang === "en" ? "MOVIE" : "ФИЛЬМ"}</span>
    <div className="player-scope-switch" role="group" aria-label={s.lang === "en" ? "Playback scope" : "Что смотреть"}>
      <button type="button" data-testid="scope-story" aria-pressed={story} onClick={() => playback.setScope({ kind: "story" })}><Film size={15} aria-hidden="true"/>{s.lang === "en" ? "Entire story" : "Вся история"}<span>{s.paragraphs.length}</span></button>
      <button type="button" data-testid="scope-moment" aria-pressed={!story} disabled={!p} onClick={() => p && playback.setScope({ kind: "moment", id: p.id })}><Clapperboard size={15} aria-hidden="true"/>{s.lang === "en" ? `Scene ${index + 1}` : `Сцена ${index + 1}`}</button>
    </div>
    <span className="player-scope-caption">{story ? (s.lang === "en" ? "All scenes, in order" : "Все сцены по порядку") : (s.lang === "en" ? "Selected scene only" : "Только выбранная сцена")}</span>
  </div>;
}
export function Timeline() {
  const s = useStore(), t = useStrings();
  const p = selectedMoment(s), bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const range = playbackRange(s), wholeStory = range.scope.kind === "story";
  const index = s.paragraphs.findIndex(x => x.id === (range.scope.kind === "moment" ? range.scope.id : p?.id));
  const scopeDur = range.end - range.start, scopeT = Math.max(0, Math.min(s.t - range.start, scopeDur));
  const activeIndex = s.timeline.segments.findIndex(seg => s.t >= seg.offset && s.t < seg.offset + seg.segment.duration);
  const scope = range.scope;
  const momentId = scope.kind === "moment" ? scope.id : null;
  const momentSeg = momentId
    ? s.timeline.segments.find((_, i) => s.segmentIds[i] === momentId)
    : undefined;
  const ended = scopeDur > 0 && scopeT >= scopeDur - .001;
  const running = s.playing || s.waiting;
  const dirty = s.paragraphs.some(x => x.status === "draft" && (x.text.trim() || x.current >= 0));
  const playable = scopeDur > 0 || (wholeStory ? s.paragraphs.some(x => x.text.trim()) : !!p?.text.trim());
  const seekTo = (time: number) => playback.seek(range.start + Math.max(0, Math.min(scopeDur, time)));
  const ratioAt = (clientX: number): number | null => {
    const r = bar.current?.getBoundingClientRect();
    return r && r.width > 0 ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) : null;
  };
  const hoverLocal = hover !== null && scopeDur > 0 ? hover * scopeDur : null;
  const hoverAbs = hoverLocal !== null ? Math.min(Math.max(range.start, range.start + hoverLocal), Math.max(range.start, range.end - 1e-6)) : null;
  const hoverSeg = hoverAbs !== null ? s.timeline.segments.find((seg, i) => {
    const end = seg.offset + seg.segment.duration;
    return hoverAbs >= seg.offset && (hoverAbs < end || i === s.timeline.segments.length - 1);
  }) : undefined;
  const hoverPid = hoverSeg?.segment.paragraphId;
  const hoverParaIdx = hoverPid ? s.paragraphs.findIndex(x => x.id === hoverPid) : index;
  const hoverPara = hoverParaIdx >= 0 ? s.paragraphs[hoverParaIdx] : p;
  const rawSnippet = hoverPara?.text.replace(/\s+/g, " ").trim() ?? "";
  const hoverSnippet = rawSnippet.length > 36 ? `${rawSnippet.slice(0, 35).trimEnd()}…` : rawSnippet;
  const hoverCue = hoverSeg && hoverAbs !== null ? hoverSeg.segment.dialogue.find(c => {
    const start = hoverSeg.offset + c.start;
    return hoverAbs >= start && hoverAbs <= start + c.dur && c.text.trim().length > 0;
  }) : undefined;

  return <div className="transport moment-transport">
    {s.voiceError && (
      <div className="voice-error" role="alert" data-testid="voice-error">
        <span>{voiceErrorText(s.voiceError, s.lang)}</span>
        <div className="voice-error-actions">
          <button type="button" className="btn small" data-testid="retry-voice" onClick={() => playback.retryVoice()}>
            {s.lang === "en" ? "Retry" : "Повторить"}
          </button>
          <button type="button" className="btn small" data-testid="dismiss-voice-error" onClick={() => store.dismissVoiceError()}>
            {s.lang === "en" ? "Dismiss" : "Скрыть"}
          </button>
        </div>
      </div>
    )}
    <div className="compact-scope" role="group" aria-label={s.lang === "en" ? "Player scope" : "Режим просмотра"}>
      <button type="button" data-testid="mobile-scope-story" aria-pressed={wholeStory} onClick={() => playback.setScope({ kind: "story" })}>{s.lang === "en" ? "Entire story" : "Вся история"}</button>
      <button type="button" aria-pressed={!wholeStory} disabled={!p} onClick={() => p && playback.setScope({ kind: "moment", id: p.id })}>{s.lang === "en" ? `Scene ${s.paragraphs.findIndex(x => x.id === p?.id) + 1}` : `Сцена ${s.paragraphs.findIndex(x => x.id === p?.id) + 1}`}</button>
    </div>
    <div className="storybar-wrap">
      <div
        className="storybar"
        ref={bar}
        data-testid="timeline"
        data-duration={scopeDur.toFixed(2)}
        data-scope={wholeStory ? "story" : "moment"}
        role="slider"
        tabIndex={0}
        aria-label={wholeStory ? (s.lang === "en" ? "Story progress" : "Ход истории") : (s.lang === "en" ? "Scene progress" : "Ход сцены")}
        aria-valuemin={0}
        aria-valuemax={scopeDur}
        aria-valuenow={scopeT}
        aria-valuetext={`${timecode(scopeT)} / ${timecode(scopeDur)}`}
        onKeyDown={e => {
          const step = e.shiftKey ? 5 : 1;
          if (e.key === "Home") { e.preventDefault(); seekTo(0); }
          else if (e.key === "End") { e.preventDefault(); seekTo(scopeDur); }
          else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); seekTo(scopeT + step); }
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); seekTo(scopeT - step); }
          else if (e.key === "PageUp") { e.preventDefault(); seekTo(scopeT + 5); }
          else if (e.key === "PageDown") { e.preventDefault(); seekTo(scopeT - 5); }
        }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          const r = ratioAt(e.clientX);
          if (r !== null) {
            setHover(r);
            if (scopeDur > 0) seekTo(r * scopeDur);
          }
        }}
        onPointerMove={e => {
          const r = ratioAt(e.clientX);
          if (r !== null) {
            setHover(r);
            if ((e.buttons & 1) && scopeDur > 0) seekTo(r * scopeDur);
          }
        }}
        onPointerUp={e => { if (e.pointerType !== "mouse") setHover(null); }}
        onPointerCancel={() => setHover(null)}
        onPointerLeave={() => setHover(null)}
      >
        {!scopeDur && <span className="timeline-empty">{s.lang === "en" ? "Your movie will appear here" : "Здесь появится твой фильм"}</span>}
        {wholeStory && s.timeline.segments.map((seg, i) => {
          const pid = s.segmentIds[i], idx = s.paragraphs.findIndex(x => x.id === pid);
          return <div key={pid} className={`band ${activeIndex === i ? "playing" : ""}`} data-testid="timeline-band" style={{ left: `${(seg.offset / scopeDur) * 100}%`, width: `${(seg.segment.duration / scopeDur) * 100}%`, background: BAND_COLORS[idx % BAND_COLORS.length] }}><span>{String(idx + 1).padStart(2, "0")}</span></div>;
        })}
        {!wholeStory && scopeDur > 0 && (
          <div className="band sel moment-band" data-testid="timeline-band" style={{ left: 0, width: "100%", background: BAND_COLORS[Math.max(0, index) % BAND_COLORS.length] }}>
            <span>{s.lang === "en" ? `SCENE ${index + 1}` : `СЦЕНА ${index + 1}`}</span>
            {momentSeg?.segment.dialogue.map((cue, ci) => (
              <span
                key={`${cue.start}-${ci}`}
                className="timeline-tick"
                aria-hidden="true"
                style={{ left: `${Math.max(0, Math.min(100, (cue.start / scopeDur) * 100))}%` }}
              />
            ))}
          </div>
        )}
        {scopeDur > 0 && <div className="playhead" data-testid="playhead" data-t={scopeT.toFixed(2)} style={{ left: `${(scopeT / scopeDur) * 100}%` }}/>}
      </div>
      {hover !== null && hoverLocal !== null && scopeDur > 0 && (
        <div
          className="timeline-hover-tip"
          aria-hidden="true"
          style={{ left: `${Math.max(12, Math.min(88, hover * 100))}%` }}
        >
          <div className="timeline-hover-head">
            <strong>{formatTime(hoverLocal, scopeDur, s.lang)}</strong>
            {hoverParaIdx >= 0 && <span>{s.lang === "en" ? `Scene ${hoverParaIdx + 1}` : `Сцена ${hoverParaIdx + 1}`}</span>}
          </div>
          {hoverSnippet && <div className="timeline-hover-snippet">{hoverSnippet}</div>}
          {hoverCue && <div className="timeline-hover-line">{CHARACTERS[hoverCue.actor].name[s.lang]}: “{hoverCue.text}”</div>}
        </div>
      )}
    </div>
    <div className="transport-row">
      <button type="button" className="btn btn-primary player-toggle" data-testid={running ? "pause" : "play"} disabled={!s.stageReady || !running && !playable} aria-keyshortcuts="Space" onClick={() => running ? playback.pause() : playback.play()}>{s.waiting ? <LoaderCircle size={18} className="spin" aria-hidden="true"/> : running ? <Pause size={18} fill="currentColor" aria-hidden="true"/> : ended ? <RotateCcw size={18} aria-hidden="true"/> : <Play size={18} fill="currentColor" aria-hidden="true"/>}{running ? (s.lang === "en" ? "Pause" : "Пауза") : ended ? (s.lang === "en" ? "Replay" : "Повтор") : (s.lang === "en" ? "Play" : "Смотреть")}</button>
      <button type="button" className="btn icon restart" data-testid="replay" title={s.lang === "en" ? "Replay from start (R)" : "Повторить с начала (R)"} aria-label={s.lang === "en" ? "Replay from start" : "Повторить с начала"} aria-keyshortcuts="r" disabled={!scopeDur || s.waiting} onClick={() => playback.replay()}><RotateCcw size={16} aria-hidden="true"/></button>
      <div className="time" aria-live="off"><b>{formatTime(scopeT, scopeDur, s.lang)}</b><span> / {formatTime(scopeDur, scopeDur, s.lang)}</span></div>
      <span className="transport-state" aria-live="polite">{s.preparingVoice?(s.lang==='en'?'Preparing Masha’s voice…':'Готовим голос Маши…'):s.waiting ? (s.lang === "en" ? "Preparing…" : "Готовим…") : s.playing ? (s.lang === "en" ? "Playing" : "Играет") : ended ? (s.lang === "en" ? "Finished" : "Конец") : scopeT > 0 ? (s.lang === "en" ? "Paused" : "Пауза") : (s.lang === "en" ? "Ready to play" : "Готово к просмотру")}</span>
      <button type="button" className={`btn icon ${s.loop ? "on" : ""}`} data-testid="loop-toggle" aria-pressed={s.loop} aria-label={s.lang === "en" ? "Loop playback" : "Повторять по кругу"} title={s.lang === "en" ? "Loop playback" : "Повторять по кругу"} onClick={() => store.setLoop(!s.loop)}><Repeat size={15} aria-hidden="true"/></button>
      <button type="button" className={`btn icon ${s.captions ? "on" : ""}`} data-testid="captions-toggle" aria-pressed={s.captions} aria-label={s.lang === "en" ? "Captions" : "Субтитры"} title={s.lang === "en" ? "Captions (C)" : "Субтитры (C)"} aria-keyshortcuts="c" onClick={() => store.setCaptions(!s.captions)}><Captions size={15} aria-hidden="true"/></button>
      {wholeStory && dirty && scopeDur > 0 && <button type="button" className="btn update-story" data-testid="update-story" disabled={!s.stageReady || s.waiting} onClick={() => playback.playAll()}><RefreshCw size={14} aria-hidden="true"/>{s.lang === "en" ? "Update story" : "Обновить"}</button>}
      <div className="volume"><button type="button" className="btn icon" data-testid="mute" title={s.muted || s.volume === 0 ? `${t.unmute} (M)` : `${t.mute} (M)`} aria-label={s.muted || s.volume === 0 ? t.unmute : t.mute} aria-pressed={s.muted || s.volume === 0} aria-keyshortcuts="m" onClick={() => { if (s.volume === 0) store.setVolume(0.8); store.setMuted(s.volume === 0 ? false : !s.muted); }}>{s.muted || s.volume === 0 ? <VolumeX size={17} aria-hidden="true"/> : <Volume2 size={17} aria-hidden="true"/>}</button><input type="range" min={0} max={1} step={0.05} value={s.muted ? 0 : s.volume} aria-label={t.volume} aria-valuetext={`${Math.round((s.muted ? 0 : s.volume) * 100)}%`} onChange={e => { const v = Number(e.target.value); store.setVolume(v); if (v > 0 && store.getState().muted) store.setMuted(false); }}/></div>
    </div>
  </div>;
}
