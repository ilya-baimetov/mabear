import { Check, CircleAlert, Film, LoaderCircle, PenLine } from "lucide-react";
import { useStore } from "../useStore";
import { earlierChanges, selectMoment, selectedMoment } from "../storyFlow";

export function MomentSequence({ onFullStory }: { onFullStory: () => void }) {
  const s = useStore(), selected = selectedMoment(s);
  const onStage = s.playing ? s.timeline.segments.findIndex(seg => s.t >= seg.offset && s.t < seg.offset + seg.segment.duration) : -1;
  return <section className="moment-sequence" aria-label={s.lang === "en" ? "Story moments" : "Моменты истории"}>
    <div className="sequence-heading"><span><Film size={14}/>{s.lang === "en" ? "YOUR STORY, MOMENT BY MOMENT" : "ИСТОРИЯ, МОМЕНТ ЗА МОМЕНТОМ"}</span><button className="btn" data-testid="full-story" onClick={onFullStory}><PenLine size={13}/>{s.lang === "en" ? "Full script" : "Весь текст"}</button></div>
    <div className="moment-strip">{s.paragraphs.map((p, i) => {
      const active = onStage >= 0 && s.segmentIds[onStage] === p.id;
      const pending = p.pendingVersion !== null;
      const stale = earlierChanges(s, p.id).length > 0;
      const ready = p.status === "ready" || p.status === "adjusted";
      const label = active ? (s.lang === "en" ? "On stage" : "На сцене") : pending ? (s.lang === "en" ? "Preparing" : "Готовим") : p.status === "error" ? (s.lang === "en" ? "Try again" : "Повторить") : stale ? (s.lang === "en" ? "Earlier changes" : "Изменилось начало") : ready ? (s.lang === "en" ? "Ready" : "Готово") : p.current >= 0 ? (s.lang === "en" ? "Changed" : "Изменено") : (s.lang === "en" ? "New moment" : "Новый момент");
      return <button className={`moment-tile ${selected?.id === p.id ? "selected" : ""} ${active ? "on-stage" : ""}`} key={p.id} data-testid="moment-card" data-status={p.status} data-version={p.versions[p.current]?.version ?? 0} data-active={active ? "1" : "0"} data-moment-id={p.id} aria-pressed={selected?.id === p.id} onClick={() => selectMoment(p.id)}>
        <span className="moment-tile-top"><b>{String(i + 1).padStart(2, "0")}</b><span>{pending ? <LoaderCircle size={10} className="spin"/> : p.status === "error" || stale ? <CircleAlert size={10}/> : ready ? <Check size={10}/> : <PenLine size={10}/>} {label}</span></span>
        <span className="moment-tile-text">{p.text || (s.lang === "en" ? "What happens first?" : "С чего всё начинается?")}</span>
      </button>;
    })}</div>
  </section>;
}
