import { useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { ScriptEditor } from "./components/ScriptEditor";
import { Stage } from "./components/Stage";
import { Timeline } from "./components/Timeline";
import { BehindTheScenes } from "./components/BehindTheScenes";
import { useStore } from "./useStore";
import { store } from "./store";
import { playback } from "./playback";

export function App() {
  const s = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "B" || e.key === "b") && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) {
        store.setPitch(!store.getState().pitch);
      }
    };
    const unlock = () => void playback.audio?.unlock();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = s.lang;
  }, [s.lang]);
  return (
    <div className={`app ${s.pitch ? "with-bts" : ""}`}>
      <TopBar />
      <main className="main">
        <ScriptEditor />
        <section className="stage-col">
          <Stage />
          <Timeline />
        </section>
        {s.pitch && <BehindTheScenes />}
      </main>
    </div>
  );
}
