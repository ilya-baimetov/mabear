import { useCallback, useState } from "react";
import { useOutsideClose } from "../useOutsideClose";
import { store } from "../store";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";

const FIXTURE_IDS = ["pancake_morning", "bears_nap", "fishing_trip"] as const;

export function TopBar() {
  const s = useStore();
  const t = useStrings();
  const [open, setOpen] = useState(false);
  const ddRef = useOutsideClose(open, useCallback(() => setOpen(false), []));
  const muted = s.muted || s.volume === 0;
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden>🐻</span>
        <span className="brand-name">{t.appName}</span>
        <span className="dot">·</span>
        <input className="title-input" data-testid="story-title" value={s.title} placeholder={t.storyTitlePlaceholder} onChange={(e) => store.setTitle(e.target.value)} />
      </div>
      <div className="top-actions">
        {s.playing || s.waiting ? (
          <button className="btn btn-primary" data-testid="pause" onClick={() => playback.pause()}>⏸ {t.pause}</button>
        ) : (
          <button className="btn btn-primary" data-testid="play-all" disabled={!s.paragraphs.some((p) => p.text.trim())} onClick={() => playback.playAll()}>▶ {t.playAll}</button>
        )}
        <button className="btn" data-testid="new-story" onClick={() => { if (!store.hasOwnWriting() || window.confirm(t.replaceStory)) store.newStory(); }}>⟲ {t.newStory}</button>
        <div className="dropdown" ref={ddRef}>
          <button className="btn" data-testid="examples" onClick={() => setOpen(!open)}>{t.examples} ▾</button>
          {open && (
            <div className="menu" role="menu">
              {FIXTURE_IDS.map((id) => (
                <button key={id} role="menuitem" data-testid={`example-${id}`} onClick={() => { setOpen(false); if (!store.hasOwnWriting() || window.confirm(t.replaceStory)) store.loadFixtureById(id); }}>{t.fixtures[id]}</button>
              ))}
            </div>
          )}
        </div>
        <div className="lang-toggle" role="group">
          <button className={s.lang === "en" ? "on" : ""} data-testid="lang-en" onClick={() => store.setLang("en")}>EN</button>
          <button className={s.lang === "ru" ? "on" : ""} data-testid="lang-ru" onClick={() => store.setLang("ru")}>RU</button>
        </div>
        <div className="volume">
          <button className="btn icon" data-testid="mute" title={muted ? t.unmute : t.mute} onClick={() => store.setMuted(!s.muted)}>{muted ? "🔇" : "🔊"}</button>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} aria-label={t.volume} onChange={(e) => store.setVolume(Number(e.target.value))} />
        </div>
      </div>
    </header>
  );
}
