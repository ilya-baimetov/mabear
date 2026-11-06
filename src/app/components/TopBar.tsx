import { useCallback, useState } from "react";
import { BookOpen, ChevronDown, Plus, Sprout, Volume2, VolumeX } from "lucide-react";
import { useOutsideClose } from "../useOutsideClose";
import { store } from "../store";
import { useStore, useStrings } from "../useStore";
const FIXTURE_IDS = ["pancake_morning", "bears_nap", "fishing_trip"] as const;
export function TopBar() {
  const s = useStore(), t = useStrings();
  const [open, setOpen] = useState(false);
  const ddRef = useOutsideClose(open, useCallback(() => setOpen(false), []));
  const muted = s.muted || s.volume === 0;
  return <header className="topbar">
    <div className="brand"><span className="logo"><Sprout size={26}/></span><span className="brand-name">Ma<span>Bear</span></span><span className="brand-caption">{s.lang === "en" ? "A world of your own" : "Твой маленький мир"}</span></div>
    <div className="top-actions">
      <div className="dropdown" ref={ddRef}>
        <button className="btn" data-testid="examples" aria-expanded={open} onClick={() => setOpen(!open)}><BookOpen size={17}/>{t.examples}<ChevronDown size={14}/></button>
        {open && <div className="menu" role="menu">{FIXTURE_IDS.map(id => <button key={id} role="menuitem" data-testid={`example-${id}`} onClick={() => { setOpen(false); if (!store.hasOwnWriting() || window.confirm(t.replaceStory)) store.loadFixtureById(id); }}>{t.fixtures[id]}</button>)}</div>}
      </div>
      <button className="btn" data-testid="new-story" onClick={() => { if (!store.hasOwnWriting() || window.confirm(t.replaceStory)) store.newStory(); }}><Plus size={17}/>{t.newStory}</button>
      <div className="lang-toggle" role="group" aria-label="Language / Язык">{(["en","ru"] as const).map(lang => <button key={lang} className={s.lang === lang ? "on" : ""} aria-pressed={s.lang === lang} data-testid={`lang-${lang}`} onClick={() => store.setLang(lang)}>{lang.toUpperCase()}</button>)}</div>
      <div className="volume"><button className="btn icon" data-testid="mute" title={muted ? t.unmute : t.mute} aria-label={muted ? t.unmute : t.mute} onClick={() => store.setMuted(!s.muted)}>{muted ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button><input type="range" min={0} max={1} step={0.05} value={s.volume} aria-label={t.volume} onChange={e => store.setVolume(Number(e.target.value))}/></div>
    </div>
  </header>;
}
