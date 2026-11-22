import { AlertTriangle, BookOpen, Clapperboard, Plus, Redo2, Undo2 } from "lucide-react";
import { store } from "../store";
import { redoStory, undoStory } from "../storyFlow";
import { useStore, useStrings } from "../useStore";

export function TopBar({ onExamples, onNew }: { onExamples: () => void; onNew: () => void }) {
  const s = useStore(), t = useStrings();
  return <header className="topbar">
    <div className="brand"><span className="logo" aria-hidden="true"><Clapperboard size={25} strokeWidth={2.3}/></span><span className="brand-wordmark"><span className="brand-name">Ma<span>Bear</span></span><span className="brand-caption">{s.lang === "en" ? "STORY STUDIO" : "СТУДИЯ ИСТОРИЙ"}</span></span></div>
    <div className="story-name"><label htmlFor="story-name">{s.lang === "en" ? "YOUR STORY" : "ТВОЯ ИСТОРИЯ"}</label><input id="story-name" data-testid="story-title" placeholder={s.lang === "en" ? "An untitled adventure" : "Приключение без названия"} value={s.title} onChange={e => store.setTitle(e.target.value)}/></div>
    <div className="top-actions">
      {s.saveError && (
        <span className="save-warning" role="status" data-testid="save-warning" title={s.lang === "en" ? "Your browser storage is full, so new changes are only in memory for now." : "Память браузера заполнена — новые правки пока хранятся только до закрытия вкладки."}>
          <AlertTriangle size={14} aria-hidden="true"/>
          <span>{s.lang === "en" ? "Not saved" : "Не сохранено"}</span>
        </span>
      )}
      <button type="button" className="btn icon history-btn" data-testid="undo" disabled={!s.canUndo} aria-label={s.lang === "en" ? "Undo" : "Отменить"} title={s.lang === "en" ? "Undo (Ctrl/⌘Z)" : "Отменить (Ctrl/⌘Z)"} aria-keyshortcuts="Control+z Meta+z" onClick={() => undoStory()}><Undo2 size={16} aria-hidden="true"/></button>
      <button type="button" className="btn icon history-btn" data-testid="redo" disabled={!s.canRedo} aria-label={s.lang === "en" ? "Redo" : "Повторить"} title={s.lang === "en" ? "Redo (Ctrl/⌘⇧Z)" : "Повторить (Ctrl/⌘⇧Z)"} aria-keyshortcuts="Control+Shift+z Meta+Shift+z Control+y" onClick={() => redoStory()}><Redo2 size={16} aria-hidden="true"/></button>
      <button type="button" className="btn examples-trigger" data-testid="examples" aria-haspopup="dialog" onClick={onExamples}><BookOpen size={17} aria-hidden="true"/><span>{t.examples}</span></button>
      <button type="button" className="btn new-story" data-testid="new-story" onClick={onNew}><Plus size={17} aria-hidden="true"/><span>{t.newStory}</span></button>
      <div className="lang-toggle" role="group" aria-label="Language / Язык">{(["en", "ru"] as const).map(lang => <button type="button" key={lang} className={s.lang === lang ? "on" : ""} aria-pressed={s.lang === lang} data-testid={`lang-${lang}`} onClick={() => store.setLang(lang)}>{lang.toUpperCase()}</button>)}</div>
    </div>
  </header>;
}
