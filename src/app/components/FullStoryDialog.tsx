import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowRight, FileText, X } from "lucide-react";
import { useStore } from "../useStore";
import { sceneCount } from "../i18n";
import { applyFullStory } from "../storyFlow";
import { MAX_PARAGRAPH_CHARS } from "../../shared/schema";

function isOutsideDialog(e: ReactPointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

export function FullStoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialTextRef = useRef("");
  const outsideDownRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const notifiedCloseRef = useRef(false);
  const [text, setText] = useState("");

  const dismiss = () => {
    if (!openRef.current || notifiedCloseRef.current) return;
    notifiedCloseRef.current = true;
    onClose();
  };

  useEffect(() => {
    if (open) {
      const initial = s.paragraphs.map(p => p.text).join("\n\n");
      initialTextRef.current = initial;
      setText(initial);
      notifiedCloseRef.current = false;
      outsideDownRef.current = false;
      if (!dialog.current?.open) {
        dialog.current?.showModal();
        textareaRef.current?.focus({ preventScroll: true });
      }
    } else if (dialog.current?.open) {
      dialog.current?.close();
    }
    // Capture the script only when opening; active playback must not overwrite the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    dismiss();
  };

  const errorMessage = !tooLong
    ? null
    : overLimit.length === 1
      ? (s.lang === "en"
          ? `Scene ${overLimit[0].scene} is ${overLimit[0].length} / ${MAX_PARAGRAPH_CHARS} characters — shorten it a little`
          : `Сцена ${overLimit[0].scene}: ${overLimit[0].length} из ${MAX_PARAGRAPH_CHARS} символов — сократи немного`)
      : (s.lang === "en"
          ? `Scenes over ${MAX_PARAGRAPH_CHARS} characters: ${overLimit.map(item => `Scene ${item.scene} (${item.length} / ${MAX_PARAGRAPH_CHARS})`).join(", ")} — shorten them a little`
          : `Эти сцены длиннее ${MAX_PARAGRAPH_CHARS} символов: ${overLimit.map(item => `сцена ${item.scene} (${item.length} из ${MAX_PARAGRAPH_CHARS})`).join(", ")} — сократи их немного`);

  return (
    <dialog
      ref={dialog}
      className="full-script-dialog"
      aria-labelledby="full-script-title"
      {...({ closedby: dirty ? "closerequest" : "any" } as Record<string, unknown>)}
      onCancel={dismiss}
      onClose={dismiss}
      onPointerDown={e => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (text !== initialTextRef.current) {
          outsideDownRef.current = false;
          return;
        }
        outsideDownRef.current = isOutsideDialog(e, e.currentTarget);
      }}
      onPointerUp={e => {
        const wasOutside = outsideDownRef.current;
        outsideDownRef.current = false;
        if (text !== initialTextRef.current) return;
        if (wasOutside && isOutsideDialog(e, e.currentTarget)) dismiss();
      }}
    >
      <div className="dialog-surface full-script-content">
        <header>
          <div>
            <span className="eyebrow"><FileText size={14} aria-hidden="true"/>{s.lang === "en" ? "THE FULL STORY" : "ВСЯ ИСТОРИЯ"}</span>
            <h2 id="full-script-title">{s.lang === "en" ? "Already have a story?" : "История уже придумана?"}</h2>
          </div>
          <button type="button" className="btn icon" aria-label={s.lang === "en" ? "Close script" : "Закрыть текст"} onClick={dismiss}>
            <X size={20} aria-hidden="true"/>
          </button>
        </header>
        <p id="full-script-hint">
          {s.lang === "en"
            ? "Write or paste it here. Leave a blank line between scenes, then preview and refine them one at a time."
            : "Напиши или вставь текст. Раздели сцены пустой строкой, а затем просматривай и улучшай их по очереди."}
        </p>
        <textarea
          ref={textareaRef}
          autoFocus
          data-testid="full-story-text"
          aria-label={s.lang === "en" ? "Full story" : "Весь текст истории"}
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
          placeholder={s.lang === "en" ? 'Masha waves to Bear.\n\nBear waves back. Masha laughs.' : 'Маша машет Медведю.\n\nМедведь машет в ответ. Маша смеётся.'}
        />
        {errorMessage && (
          <p id="full-script-error" className="full-script-error" data-testid="full-script-error" role="alert">
            {errorMessage}
          </p>
        )}
        <footer>
          <span>{sceneCount(parts.length, s.lang)}</span>
          <button type="button" className="btn" data-testid="cancel" onClick={dismiss}>
            {s.lang === "en" ? "Cancel" : "Отмена"}
          </button>
          <button type="button" className="btn start-writing" data-testid="apply-full-story" disabled={tooLong || !parts.length} onClick={apply}>
            {s.lang === "en" ? "Use this story" : "Взять эту историю"}
            <ArrowRight size={16} aria-hidden="true"/>
          </button>
        </footer>
      </div>
    </dialog>
  );
}
