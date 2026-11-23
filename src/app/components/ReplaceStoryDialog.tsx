import { useRef } from "react";
import { BookOpen, X } from "lucide-react";
import { useStoreSelector } from "../useStore";
import { ModalDialog } from "./ModalDialog";

export function ReplaceStoryDialog({ open, targetTitle, onKeep, onReplace }: { open: boolean; targetTitle: string | null; onKeep: () => void; onReplace: () => void }) {
  const lang = useStoreSelector((st) => st.lang);
  const keepBtn = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      open={open}
      onClose={onKeep}
      className="replace-story-dialog"
      dataTestId="replace-story-dialog"
      ariaLabelledBy="replace-story-title"
      initialFocusRef={keepBtn}
    >
      <header>
        <span className="replace-icon" aria-hidden="true"><BookOpen size={23}/></span>
        <button type="button" className="btn icon" aria-label={lang === "en" ? "Close" : "Закрыть"} onClick={onKeep}>
          <X size={19} aria-hidden="true"/>
        </button>
      </header>
      <h2 id="replace-story-title">{lang === "en" ? "Start a different story?" : "Начать другую историю?"}</h2>
      <p>{targetTitle ? (lang === "en" ? <>Open <strong>{targetTitle}</strong> in place of this story?</> : <>Открыть <strong>«{targetTitle}»</strong> вместо этой истории?</>) : (lang === "en" ? "Start again with an empty story?" : "Начать заново с пустой истории?")}</p>
      <p className="replace-warning">{lang === "en" ? "The current writing saved on this device will be replaced." : "Текущий текст, сохранённый на этом устройстве, будет заменён."}</p>
      <footer>
        <button ref={keepBtn} type="button" className="btn" data-testid="keep-story" autoFocus onClick={onKeep}>
          {lang === "en" ? "Keep editing" : "Продолжить работу"}
        </button>
        <button type="button" className="btn start-writing" data-testid="replace-story" onClick={onReplace}>
          {lang === "en" ? "Replace story" : "Заменить историю"}
        </button>
      </footer>
    </ModalDialog>
  );
}
