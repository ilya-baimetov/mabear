import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { Stage } from "./components/Stage";
import { Timeline, PlayerScope } from "./components/Timeline";
import { BehindTheScenes } from "./components/BehindTheScenes";
import { StoryLibrary } from "./components/StoryLibrary";
import { MomentWorkbench } from "./components/MomentWorkbench";
import { MomentSequence } from "./components/MomentSequence";
import { ReplaceStoryDialog } from "./components/ReplaceStoryDialog";
import { FullStoryDialog } from "./components/FullStoryDialog";
import { useStore } from "./useStore";
import { store } from "./store";
import { playback, playbackRange } from "./playback";
import { redoStory, undoStory } from "./storyFlow";
import { STRINGS } from "./i18n";

export function App() {
  const s = useStore();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [fullStoryOpen, setFullStoryOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceTitle, setReplaceTitle] = useState<string | null>(null);
  const pendingReplacement = useRef<(() => void) | null>(null);
  const requestReplacement = (action: () => void, title: string | null = null) => {
    if (!store.hasOwnWriting()) { action(); return; }
    setLibraryOpen(false);
    pendingReplacement.current = action;
    setReplaceTitle(title);
    setReplaceOpen(true);
  };
  const keepEditing = () => { pendingReplacement.current = null; setReplaceOpen(false); };
  useEffect(() => {
    if (!store.getState().paragraphs.length) store.addParagraph();
  }, [s.episodeId]);
  useEffect(() => {
    if (!s.toast) return;
    const timer = window.setTimeout(() => store.clearToast(), 6000);
    return () => window.clearTimeout(timer);
  }, [s.toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (document.querySelector("dialog[open]")) return;
      const target = e.target instanceof Element ? e.target : null;
      const inEditable = Boolean(target?.closest("input, textarea, select, [contenteditable]"));
      const inControl = Boolean(target?.closest("button, input, textarea, select, [contenteditable], dialog"));

      if ((e.metaKey || e.ctrlKey) && !e.altKey && !inEditable) {
        const lower = e.key.toLowerCase();
        if (lower === "z") {
          e.preventDefault();
          if (e.shiftKey) redoStory();
          else undoStory();
          return;
        }
        if (lower === "y" && e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          redoStory();
          return;
        }
      }

      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "B" || e.key === "b") && !inEditable) {
        store.setPitch(!store.getState().pitch);
        return;
      }
      if (e.key === "Escape" && store.getState().pitch && !inEditable) {
        store.setPitch(false);
        return;
      }

      if (inControl || e.metaKey || e.ctrlKey || e.altKey) return;

      const current = store.getState();
      const range = playbackRange(current);
      const scopePlayable = range.end > range.start || (range.scope.kind === "story"
        ? current.paragraphs.some(p => p.text.trim().length > 0)
        : Boolean(current.paragraphs.find(p => p.id === (range.scope as { kind: "moment"; id: string }).id)?.text.trim()));

      if ((e.code === "Space" || e.code === "KeyK") && !e.repeat) {
        e.preventDefault();
        if (current.stageReady && scopePlayable) {
          if (current.playing || current.waiting) playback.pause();
          else playback.play();
        }
        return;
      }

      if (!current.stageReady) return;
      const seekClamped = (t: number) => playback.seek(Math.max(range.start, Math.min(range.end, t)));
      if (e.key === "ArrowLeft" || e.code === "KeyJ") {
        e.preventDefault();
        if (range.end > range.start) seekClamped(current.t - (e.code === "KeyJ" ? 2 : e.shiftKey ? 5 : 1));
      } else if (e.key === "ArrowRight" || e.code === "KeyL") {
        e.preventDefault();
        if (range.end > range.start) seekClamped(current.t + (e.code === "KeyL" ? 2 : e.shiftKey ? 5 : 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        if (range.end > range.start) seekClamped(range.start);
      } else if (e.key === "End") {
        e.preventDefault();
        if (range.end > range.start) seekClamped(range.end);
      } else if (e.code === "KeyM" && !e.repeat) {
        e.preventDefault();
        if (current.muted || current.volume === 0) {
          if (current.volume === 0) store.setVolume(0.8);
          store.setMuted(false);
        } else {
          store.setMuted(true);
        }
      } else if (e.code === "KeyC" && !e.repeat) {
        e.preventDefault();
        store.setCaptions(!current.captions);
      } else if (e.code === "KeyR" && !e.repeat && range.end > range.start && !current.waiting) {
        e.preventDefault();
        playback.replay();
      } else if (e.code === "KeyF" && !e.repeat) {
        e.preventDefault();
        const el = document.querySelector<HTMLElement>(".stage-col");
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void el?.requestFullscreen?.().catch(() => {});
      }
    };
    const unlock = () => void playback.audio?.unlock();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", unlock); };
  }, []);
  useEffect(() => { document.documentElement.lang = s.lang; }, [s.lang]);
  useEffect(() => {
    const clean = s.title.trim();
    document.title = clean ? `${clean} — MaBear` : "MaBear";
  }, [s.title]);
  return <div className={`app moment-studio ${s.pitch ? "with-bts" : ""}`}>
    <a href="#moment-direction" className="skip-link visually-hidden">{s.lang === "en" ? "Skip to story editor" : "Перейти к тексту сцены"}</a>
    <TopBar onExamples={() => setLibraryOpen(true)} onNew={() => requestReplacement(() => store.newStory())}/>
    <main className="main">
      <section className="stage-col" aria-label={s.lang === "en" ? "Animation preview" : "Предпросмотр анимации"}><PlayerScope/><Stage/><Timeline/></section>
      <MomentWorkbench onExamples={() => setLibraryOpen(true)}/>
      <MomentSequence onFullStory={() => setFullStoryOpen(true)}/>
      {s.pitch && <BehindTheScenes/>}
    </main>
    <div className="studio-toast-region" role="status" aria-live="polite" aria-atomic="true">
      {s.toast && <div className="studio-toast" data-testid="studio-toast">
        <span className="studio-toast-msg">{s.toast.message[s.lang]}</span>
        {s.toast.undoable && <button type="button" className="btn studio-toast-undo" data-testid="toast-undo" onClick={() => undoStory()}><Undo2 size={13} aria-hidden="true"/>{s.lang === "en" ? "Undo" : "Отменить"}</button>}
        <button type="button" className="btn icon studio-toast-close" aria-label={s.lang === "en" ? "Dismiss" : "Закрыть"} onClick={() => store.clearToast()}><X size={14} aria-hidden="true"/></button>
      </div>}
    </div>
    <StoryLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} onChoose={id => requestReplacement(() => { store.loadFixtureById(id); setLibraryOpen(false); }, STRINGS[s.lang].fixtures[id])}/>
    <ReplaceStoryDialog open={replaceOpen} targetTitle={replaceTitle} onKeep={keepEditing} onReplace={() => { const action = pendingReplacement.current; pendingReplacement.current = null; setReplaceOpen(false); action?.(); }}/>
    <FullStoryDialog open={fullStoryOpen} onClose={() => setFullStoryOpen(false)}/>
  </div>;
}
