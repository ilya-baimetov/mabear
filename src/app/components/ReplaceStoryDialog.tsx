import { useEffect, useRef } from "react";
import { BookOpen, X } from "lucide-react";
import { useStore } from "../useStore";

export function ReplaceStoryDialog({ open, targetTitle, onKeep, onReplace }: { open: boolean; targetTitle: string | null; onKeep: () => void; onReplace: () => void }) {
  const s = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current?.close(); }, [open]);
  return <dialog ref={dialog} className="replace-story-dialog" data-testid="replace-story-dialog" aria-labelledby="replace-story-title" onCancel={onKeep} onClick={e => { if (e.target === e.currentTarget) onKeep(); }}>
    <header><span className="replace-icon"><BookOpen size={23}/></span><button className="btn icon" aria-label={s.lang === "en" ? "Keep editing" : "Продолжить работу"} onClick={onKeep}><X size={19}/></button></header>
    <h2 id="replace-story-title">{s.lang === "en" ? "Start a different story?" : "Начать другую историю?"}</h2>
    <p>{targetTitle ? (s.lang === "en" ? <>Open <strong>{targetTitle}</strong> in place of this story?</> : <>Открыть <strong>«{targetTitle}»</strong> вместо этой истории?</>) : (s.lang === "en" ? "Start again with an empty story?" : "Начать заново с пустой истории?")}</p>
    <p className="replace-warning">{s.lang === "en" ? "The current writing saved on this device will be replaced." : "Текущий текст, сохранённый на этом устройстве, будет заменён."}</p>
    <footer><button className="btn" data-testid="keep-story" onClick={onKeep}>{s.lang === "en" ? "Keep editing" : "Продолжить работу"}</button><button className="btn start-writing" data-testid="replace-story" onClick={onReplace}>{s.lang === "en" ? "Replace story" : "Заменить историю"}</button></footer>
  </dialog>;
}
