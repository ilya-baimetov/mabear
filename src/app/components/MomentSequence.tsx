import { Check, CircleAlert, Film, LoaderCircle, PenLine, Plus, Play } from "lucide-react";
import { useStoryboardFrames } from "../storyboardFrames";
import { playback, playbackRange } from "../playback";
import { store, type AppState } from "../store";
import { timecode } from "./Timeline";
import { shallowEqual, useStoreSelector } from "../useStore";
import { sceneCount } from "../i18n";
import { earlierChanges, insertMoment, selectMoment, selectedMoment } from "../storyFlow";

function activeSegmentIndex(st: AppState): number {
  const end = playbackRange(st).end;
  if (end <= 0) return -1;
  const shownTime = Math.min(st.t, end - 1e-6);
  return st.timeline.segments.findIndex(
    (seg) => shownTime >= seg.offset && shownTime < seg.offset + seg.segment.duration,
  );
}

export function MomentSequence({ onFullStory }: { onFullStory: () => void }) {
  const s = useStoreSelector(
    (st) => ({
      lang: st.lang,
      paragraphs: st.paragraphs,
      selectedId: st.selectedId,
      segmentIds: st.segmentIds,
      stageReady: st.stageReady,
      timelineRevision: st.timelineRevision,
      onStage: activeSegmentIndex(st),
    }),
    shallowEqual,
  );
  const selected = selectedMoment(s), frames = useStoryboardFrames();
  const onStage = s.onStage;
  const addDisabled = s.paragraphs.at(-1)?.text.trim() === "" || s.paragraphs.some(p => p.pendingVersion !== null);
  return <section className="moment-sequence" aria-label={s.lang === "en" ? "Story scenes" : "Сцены истории"}>
    <div className="sequence-heading"><div><span><Film size={15} aria-hidden="true"/>{s.lang === "en" ? "STORYBOARD" : "РАСКАДРОВКА"}</span><strong>{sceneCount(s.paragraphs.length, s.lang)}<i>·</i>{s.lang === "en" ? "Tap a scene to edit" : "Нажми на сцену, чтобы изменить"}</strong></div><div className="sequence-actions"><button type="button" className="btn watch-story" data-testid="play-all" disabled={!s.stageReady || !s.paragraphs.some(p => p.text.trim())} onClick={() => playback.playAll()}><Play size={14} aria-hidden="true"/>{s.lang === "en" ? "Play entire story" : "Смотреть всю историю"}</button><button type="button" className="btn" data-testid="full-story" onClick={onFullStory}><PenLine size={14} aria-hidden="true"/>{s.lang === "en" ? "Edit full script" : "Весь текст"}</button></div></div>
    <div className="moment-strip">{s.paragraphs.map((p, i) => {
      const active = onStage >= 0 && s.segmentIds[onStage] === p.id;
      const pending = p.pendingVersion !== null;
      const stale = earlierChanges(s, p.id).length > 0;
      const ready = p.status === "ready" || p.status === "adjusted";
      const statusClass = active && ready && !stale
        ? "status-on-stage"
        : pending
          ? "status-preparing"
          : p.status === "error"
            ? "status-error"
            : stale
              ? "status-stale"
              : ready
                ? "status-ready"
                : p.current >= 0
                  ? "status-changed"
                  : p.text.trim()
                    ? "status-changed"
                    : "status-draft";
      const label = active && ready && !stale
        ? (s.lang === "en" ? "On stage" : "На сцене")
        : pending
          ? (s.lang === "en" ? "Preparing" : "Готовим")
          : p.status === "error"
            ? (s.lang === "en" ? "Try again" : "Повторить")
            : stale
              ? (s.lang === "en" ? "Earlier changes" : "Раньше были правки")
              : ready
                ? (s.lang === "en" ? "Ready" : "Готово")
                : p.current >= 0
                  ? (s.lang === "en" ? "Changed" : "Изменено")
                  : p.text.trim()
                    ? (s.lang === "en" ? "Draft" : "Черновик")
                    : (s.lang === "en" ? "New scene" : "Новая сцена");
      const range = store.segmentRange(p.id);
      return <button type="button" className={`moment-tile ${selected?.id === p.id ? "selected" : ""} ${active ? "on-stage" : ""}`} key={p.id} data-testid="moment-card" data-status={p.status} data-version={p.versions[p.current]?.version ?? 0} data-active={active ? "1" : "0"} data-moment-id={p.id} aria-pressed={selected?.id === p.id} onClick={() => selectMoment(p.id)}>
        {frames[p.id] && <img className="storyboard-frame" src={frames[p.id]} alt=""/>}
        <span className="moment-tile-top"><b>{String(i + 1).padStart(2, "0")}</b><span className={statusClass}>{pending ? <LoaderCircle size={10} className="spin" aria-hidden="true"/> : p.status === "error" || stale ? <CircleAlert size={10} aria-hidden="true"/> : ready ? <Check size={10} aria-hidden="true"/> : <PenLine size={10} aria-hidden="true"/>} {label}</span></span>
        <span className="moment-tile-text">{p.text || (s.lang === "en" ? "Write what happens here" : "Напиши, что здесь происходит")}</span>
        <span className="moment-tile-foot"><span>{selected?.id === p.id ? (s.lang === "en" ? "Editing" : "Пишем здесь") : (s.lang === "en" ? "Select to edit" : "Открыть")}</span><span>{range ? `${timecode(range.start)} – ${timecode(range.end)}` : (s.lang === "en" ? "Not previewed" : "Без просмотра")}</span></span>
      </button>;
    })}<button type="button" className="storyboard-add" data-testid="storyboard-add" disabled={addDisabled} aria-label={s.lang === "en" ? "Add scene at end" : "Добавить сцену в конец"} onClick={() => {
      const last = s.paragraphs.at(-1);
      const id = last ? insertMoment(last.id) : store.addParagraph();
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-pid="${id}"]`)?.focus());
    }}><Plus size={22} aria-hidden="true"/><span>{s.lang === "en" ? "Add scene" : "Добавить сцену"}</span></button></div>
  </section>;
}
