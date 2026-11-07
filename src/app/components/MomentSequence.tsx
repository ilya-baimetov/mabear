import { Check, CircleAlert, Film, LoaderCircle, PenLine, Plus, Play } from "lucide-react";
import { useStoryboardFrames } from "../storyboardFrames";
import { playback, playbackRange } from "../playback";
import { store } from "../store";
import { timecode } from "./Timeline";
import { useStore } from "../useStore";
import { sceneCount } from "../i18n";
import { earlierChanges, insertMoment, selectMoment, selectedMoment } from "../storyFlow";

export function MomentSequence({ onFullStory }: { onFullStory: () => void }) {
  const s = useStore(), selected = selectedMoment(s), frames = useStoryboardFrames();
  const end = playbackRange(s).end;
  const shownTime = end > 0 ? Math.min(s.t, end - 1e-6) : 0;
  const onStage = end > 0 ? s.timeline.segments.findIndex(seg => shownTime >= seg.offset && shownTime < seg.offset + seg.segment.duration) : -1;
  return <section className="moment-sequence" aria-label={s.lang === "en" ? "Story scenes" : "Сцены истории"}>
    <div className="sequence-heading"><div><span><Film size={15}/>{s.lang === "en" ? "STORYBOARD" : "РАСКАДРОВКА"}</span><strong>{sceneCount(s.paragraphs.length, s.lang)}<i>·</i>{s.lang === "en" ? "Select a scene to edit" : "Выбери сцену для правки"}</strong></div><div className="sequence-actions"><button className="btn watch-story" data-testid="play-all" disabled={!s.stageReady || !s.paragraphs.some(p => p.text.trim())} onClick={() => playback.playAll()}><Play size={14}/>{s.lang === "en" ? "Play entire story" : "Смотреть всю историю"}</button><button className="btn" data-testid="full-story" onClick={onFullStory}><PenLine size={14}/>{s.lang === "en" ? "Edit full script" : "Весь текст"}</button></div></div>
    <div className="moment-strip">{s.paragraphs.map((p, i) => {
      const active = onStage >= 0 && s.segmentIds[onStage] === p.id;
      const pending = p.pendingVersion !== null;
      const stale = earlierChanges(s, p.id).length > 0;
      const ready = p.status === "ready" || p.status === "adjusted";
      const label = active && ready && !stale ? (s.lang === "en" ? "On stage" : "На сцене") : pending ? (s.lang === "en" ? "Preparing" : "Готовим") : p.status === "error" ? (s.lang === "en" ? "Try again" : "Повторить") : stale ? (s.lang === "en" ? "Earlier changes" : "Изменилось начало") : ready ? (s.lang === "en" ? "Ready" : "Готово") : p.current >= 0 ? (s.lang === "en" ? "Changed" : "Изменено") : (s.lang === "en" ? "New scene" : "Новая сцена");
      const range = store.segmentRange(p.id);
      return <button className={`moment-tile ${selected?.id === p.id ? "selected" : ""} ${active ? "on-stage" : ""}`} key={p.id} data-testid="moment-card" data-status={p.status} data-version={p.versions[p.current]?.version ?? 0} data-active={active ? "1" : "0"} data-moment-id={p.id} aria-pressed={selected?.id === p.id} onClick={() => selectMoment(p.id)}>
        {frames[p.id] && <img className="storyboard-frame" src={frames[p.id]} alt=""/>}
        <span className="moment-tile-top"><b>{String(i + 1).padStart(2, "0")}</b><span>{pending ? <LoaderCircle size={10} className="spin"/> : p.status === "error" || stale ? <CircleAlert size={10}/> : ready ? <Check size={10}/> : <PenLine size={10}/>} {label}</span></span>
        <span className="moment-tile-text">{p.text || (s.lang === "en" ? "Write what happens here" : "Напиши, что здесь происходит")}</span>
        <span className="moment-tile-foot"><span>{selected?.id === p.id ? (s.lang === "en" ? "Editing" : "Редактируется") : (s.lang === "en" ? "Select to edit" : "Выбрать")}</span><span>{range ? `${timecode(range.start)} – ${timecode(range.end)}` : (s.lang === "en" ? "Not previewed" : "Без просмотра")}</span></span>
      </button>;
    })}<button className="storyboard-add" data-testid="storyboard-add" aria-label={s.lang === "en" ? "Add scene at end" : "Добавить сцену в конец"} onClick={() => { const last = s.paragraphs.at(-1); if (last) insertMoment(last.id); }}><Plus size={22}/><span>{s.lang === "en" ? "Add scene" : "Добавить сцену"}</span></button></div>
  </section>;
}
