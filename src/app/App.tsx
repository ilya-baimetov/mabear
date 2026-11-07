import { useEffect, useRef, useState } from "react";
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
import { playback } from "./playback";
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
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof Element && e.target.closest("button, input, textarea, select, [contenteditable], dialog"))) {
        e.preventDefault();
        const current = store.getState();
        if (current.stageReady && current.paragraphs.some(p => p.text.trim())) {
          if (current.playing || current.waiting) playback.pause(); else playback.play();
        }
      }
      if (e.shiftKey && (e.key === "B" || e.key === "b") && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) store.setPitch(!store.getState().pitch);
    };
    const unlock = () => void playback.audio?.unlock();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", unlock); };
  }, []);
  useEffect(() => { document.documentElement.lang = s.lang; }, [s.lang]);
  return <div className={`app moment-studio ${s.pitch ? "with-bts" : ""}`}>
    <TopBar onExamples={() => setLibraryOpen(true)} onNew={() => requestReplacement(() => store.newStory())}/>
    <main className="main">
      <section className="stage-col" aria-label={s.lang === "en" ? "Animation preview" : "Предпросмотр анимации"}><PlayerScope/><Stage/><Timeline/></section>
      <MomentWorkbench onExamples={() => setLibraryOpen(true)}/>
      <MomentSequence onFullStory={() => setFullStoryOpen(true)}/>
      {s.pitch && <BehindTheScenes/>}
    </main>
    <StoryLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} onChoose={id => requestReplacement(() => { store.loadFixtureById(id); setLibraryOpen(false); }, STRINGS[s.lang].fixtures[id])}/>
    <ReplaceStoryDialog open={replaceOpen} targetTitle={replaceTitle} onKeep={keepEditing} onReplace={() => { const action = pendingReplacement.current; pendingReplacement.current = null; setReplaceOpen(false); action?.(); }}/>
    <FullStoryDialog open={fullStoryOpen} onClose={() => setFullStoryOpen(false)}/>
  </div>;
}
