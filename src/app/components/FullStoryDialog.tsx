import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, X } from "lucide-react";
import { useStoreSelector } from "../useStore";
import { store } from "../store";
import { sceneCount } from "../i18n";
import { applyFullStory } from "../storyFlow";
import { MAX_PARAGRAPH_CHARS } from "../../shared/schema";
import { ModalDialog } from "./ModalDialog";

export function FullStoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useStoreSelector((st) => st.lang);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialTextRef = useRef("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) {
      const initial = store.getState().paragraphs.map(p => p.text).join("\n\n");
      initialTextRef.current = initial;
      setText(initial);
    }
  }, [open]);

  const parts = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const overLimit = parts
    .map((part, idx) => ({ scene: idx + 1, length: part.length }))
    .filter(item => item.length > MAX_PARAGRAPH_CHARS);
  const tooLong = overLimit.length > 0;
  const dirty = text !== initialTextRef.current;

  const apply = () => {
    if (tooLong || !parts.length) return;
    applyFullStory(text);
    onClose();
  };

  const errorMessage = !tooLong
    ? null
    : overLimit.length === 1
      ? (lang === "en"
          ? `Scene ${overLimit[0].scene} is ${overLimit[0].length} / ${MAX_PARAGRAPH_CHARS} characters — shorten it a little`
          : `Сцена ${overLimit[0].scene}: ${overLimit[0].length} из ${MAX_PARAGRAPH_CHARS} символов — сократи немного`)
      : (lang === "en"
          ? `Scenes over ${MAX_PARAGRAPH_CHARS} characters: ${overLimit.map(item => `Scene ${item.scene} (${item.length} / ${MAX_PARAGRAPH_CHARS})`).join(", ")} — shorten them a little`
          : `Эти сцены длиннее ${MAX_PARAGRAPH_CHARS} символов: ${overLimit.map(item => `сцена ${item.scene} (${item.length} из ${MAX_PARAGRAPH_CHARS})`).join(", ")} — сократи их немного`);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      lightDismiss={!dirty}
      className="full-script-dialog"
      surfaceClassName="full-script-content"
      ariaLabelledBy="full-script-title"
      initialFocusRef={textareaRef}
    >
      <header>
        <div>
          <span className="eyebrow"><FileText size={14} aria-hidden="true"/>{lang === "en" ? "THE FULL STORY" : "ВСЯ ИСТОРИЯ"}</span>
          <h2 id="full-script-title">{lang === "en" ? "Already have a story?" : "История уже придумана?"}</h2>
        </div>
        <button type="button" className="btn icon" aria-label={lang === "en" ? "Close script" : "Закрыть текст"} onClick={onClose}>
          <X size={20} aria-hidden="true"/>
        </button>
      </header>
      <p id="full-script-hint">
        {lang === "en"
          ? "Write or paste it here. Leave a blank line between scenes, then preview and refine them one at a time."
          : "Напиши или вставь текст. Раздели сцены пустой строкой, а затем просматривай и улучшай их по очереди."}
      </p>
      <textarea
        ref={textareaRef}
        autoFocus
        data-testid="full-story-text"
        aria-label={lang === "en" ? "Full story" : "Весь текст истории"}
        aria-invalid={tooLong || undefined}
        aria-describedby={tooLong ? "full-script-hint full-script-error" : "full-script-hint"}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            apply();
          }
        }}
        placeholder={lang === "en" ? 'Masha waves to Bear.\n\nBear waves back. Masha laughs.' : 'Маша машет Медведю.\n\nМедведь машет в ответ. Маша смеётся.'}
      />
      {errorMessage && (
        <p id="full-script-error" className="full-script-error" data-testid="full-script-error" role="alert">
          {errorMessage}
        </p>
      )}
      <footer>
        <span>{sceneCount(parts.length, lang)}</span>
        <button type="button" className="btn" data-testid="cancel" onClick={onClose}>
          {lang === "en" ? "Cancel" : "Отмена"}
        </button>
        <button type="button" className="btn start-writing" data-testid="apply-full-story" disabled={tooLong || !parts.length} onClick={apply}>
          {lang === "en" ? "Use this story" : "Взять эту историю"}
          <ArrowRight size={16} aria-hidden="true"/>
        </button>
      </footer>
    </ModalDialog>
  );
}
