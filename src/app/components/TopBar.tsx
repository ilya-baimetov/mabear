import { BookOpen, Plus, Clapperboard } from "lucide-react";
import { store } from "../store";
import { useStore, useStrings } from "../useStore";

export function TopBar({ onExamples, onNew }: { onExamples: () => void; onNew: () => void }) {
  const s = useStore(), t = useStrings();
  return <header className="topbar">
    <div className="brand"><span className="logo" aria-hidden="true"><Clapperboard size={25} strokeWidth={2.3}/></span><span className="brand-wordmark"><span className="brand-name">Ma<span>Bear</span></span><span className="brand-caption">{s.lang === "en" ? "STORY STUDIO" : "СТУДИЯ ИСТОРИЙ"}</span></span></div>
    <div className="story-name"><label htmlFor="story-name">{s.lang === "en" ? "YOUR STORY" : "ТВОЯ ИСТОРИЯ"}</label><input id="story-name" data-testid="story-title" aria-label={t.storyTitlePlaceholder} placeholder={s.lang === "en" ? "An untitled adventure" : "Приключение без названия"} value={s.title} onChange={e => store.setTitle(e.target.value)}/></div>
    <div className="top-actions">
      <button className="btn examples-trigger" data-testid="examples" aria-haspopup="dialog" onClick={onExamples}><BookOpen size={17}/><span>{t.examples}</span></button>
      <button className="btn new-story" data-testid="new-story" onClick={onNew}><Plus size={17}/><span>{t.newStory}</span></button>
      <div className="lang-toggle" role="group" aria-label="Language / Язык">{(["en", "ru"] as const).map(lang => <button key={lang} className={s.lang === lang ? "on" : ""} aria-pressed={s.lang === lang} data-testid={`lang-${lang}`} onClick={() => store.setLang(lang)}>{lang.toUpperCase()}</button>)}</div>
    </div>
  </header>;
}
