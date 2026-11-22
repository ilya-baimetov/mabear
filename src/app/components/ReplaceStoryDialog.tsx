import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, X } from "lucide-react";
import { useStore } from "../useStore";

function isOutsideDialog(e: ReactPointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

export function ReplaceStoryDialog({ open, targetTitle, onKeep, onReplace }: { open: boolean; targetTitle: string | null; onKeep: () => void; onReplace: () => void }) {
  const s = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const keepBtn = useRef<HTMLButtonElement>(null);
  const outsideDownRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const notifiedCloseRef = useRef(false);

  const dismiss = () => {
    if (!openRef.current || notifiedCloseRef.current) return;
    notifiedCloseRef.current = true;
    onKeep();
  };

  useEffect(() => {
    if (open) {
      notifiedCloseRef.current = false;
      outsideDownRef.current = false;
      if (!dialog.current?.open) {
        dialog.current?.showModal();
        keepBtn.current?.focus({ preventScroll: true });
      }
    } else if (dialog.current?.open) {
      dialog.current?.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="replace-story-dialog"
      data-testid="replace-story-dialog"
      aria-labelledby="replace-story-title"
      {...({ closedby: "any" } as Record<string, unknown>)}
      onCancel={dismiss}
      onClose={dismiss}
      onPointerDown={e => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        outsideDownRef.current = isOutsideDialog(e, e.currentTarget);
      }}
      onPointerUp={e => {
        const wasOutside = outsideDownRef.current;
        outsideDownRef.current = false;
        if (wasOutside && isOutsideDialog(e, e.currentTarget)) dismiss();
      }}
    >
      <div className="dialog-surface">
        <header>
          <span className="replace-icon" aria-hidden="true"><BookOpen size={23}/></span>
          <button type="button" className="btn icon" aria-label={s.lang === "en" ? "Close" : "Закрыть"} onClick={dismiss}>
            <X size={19} aria-hidden="true"/>
          </button>
        </header>
        <h2 id="replace-story-title">{s.lang === "en" ? "Start a different story?" : "Начать другую историю?"}</h2>
        <p>{targetTitle ? (s.lang === "en" ? <>Open <strong>{targetTitle}</strong> in place of this story?</> : <>Открыть <strong>«{targetTitle}»</strong> вместо этой истории?</>) : (s.lang === "en" ? "Start again with an empty story?" : "Начать заново с пустой истории?")}</p>
        <p className="replace-warning">{s.lang === "en" ? "The current writing saved on this device will be replaced." : "Текущий текст, сохранённый на этом устройстве, будет заменён."}</p>
        <footer>
          <button ref={keepBtn} type="button" className="btn" data-testid="keep-story" autoFocus onClick={dismiss}>
            {s.lang === "en" ? "Keep editing" : "Продолжить работу"}
          </button>
          <button type="button" className="btn start-writing" data-testid="replace-story" onClick={onReplace}>
            {s.lang === "en" ? "Replace story" : "Заменить историю"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
