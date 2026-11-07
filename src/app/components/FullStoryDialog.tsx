import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, X } from "lucide-react";
import { useStore } from "../useStore";
import { sceneCount } from "../i18n";
import { applyFullStory } from "../storyFlow";
import { MAX_PARAGRAPH_CHARS } from "../../shared/schema";

export function FullStoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) { setText(s.paragraphs.map(p => p.text).join("\n\n")); dialog.current?.showModal(); }
    else dialog.current?.close();
    // Capture the script only when opening; active playback must not overwrite the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const parts = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const tooLong = parts.some(p => p.length > MAX_PARAGRAPH_CHARS);
  return <dialog ref={dialog} className="full-script-dialog" aria-labelledby="full-script-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="full-script-content">
    <header><div><span className="eyebrow"><FileText size={14}/>{s.lang === "en" ? "THE FULL STORY" : "ВСЯ ИСТОРИЯ"}</span><h2 id="full-script-title">{s.lang === "en" ? "Already have a story?" : "История уже придумана?"}</h2></div><button className="btn icon" aria-label={s.lang === "en" ? "Close script" : "Закрыть текст"} onClick={onClose}><X size={20}/></button></header>
    <p>{s.lang === "en" ? "Write or paste it here. Leave a blank line between scenes, then preview and refine them one at a time." : "Напиши или вставь текст. Раздели сцены пустой строкой, а затем просматривай и улучшай их по очереди."}</p>
    <textarea data-testid="full-story-text" aria-label={s.lang === "en" ? "Full story" : "Весь текст истории"} value={text} onChange={e => setText(e.target.value)} placeholder={s.lang === "en" ? 'Masha waves to Bear.\n\nBear waves back. Masha laughs.' : 'Маша машет Медведю.\n\nМедведь машет в ответ. Маша смеётся.'}/>
    {tooLong && <p className="full-script-error" role="alert">{s.lang === "en" ? `One scene is too long. Split it into parts of ${MAX_PARAGRAPH_CHARS} characters or fewer.` : `Одна сцена слишком длинная. Раздели её на части до ${MAX_PARAGRAPH_CHARS} символов.`}</p>}
    <footer><span>{sceneCount(parts.length, s.lang)}</span><button className="btn" onClick={onClose}>{s.lang === "en" ? "Cancel" : "Отмена"}</button><button className="btn start-writing" data-testid="apply-full-story" disabled={tooLong || !parts.length} onClick={() => { applyFullStory(text); onClose(); }}>{s.lang === "en" ? "Use this story" : "Взять эту историю"}<ArrowRight size={16}/></button></footer>
  </div></dialog>;
}
