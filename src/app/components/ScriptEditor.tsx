import { store } from "../store";
import { useStore, useStrings } from "../useStore";
import { focusBlock, ParagraphCard } from "./ParagraphCard";
import { Feather, Plus, Sparkles } from "lucide-react";

const FIXTURE_IDS = ["pancake_morning", "bears_nap", "fishing_trip"] as const;

export function ScriptEditor() {
  const s = useStore();
  const t = useStrings();
  const activeId = (() => {
    if (!s.playing) return null;
    for (let i = 0; i < s.timeline.segments.length; i++) {
      const seg = s.timeline.segments[i];
      if (s.t >= seg.offset && s.t < seg.offset + seg.segment.duration) return s.segmentIds[i];
    }
    return null;
  })();
  return (
    <aside className="script" data-testid="script">
      <div className="script-heading"><h2 className="script-title"><Feather size={15}/>{t.script}</h2><span className="save-note">{s.lang === "en" ? "On this device" : "На этом устройстве"}</span></div>
      <input className="title-input" aria-label={t.storyTitlePlaceholder} data-testid="story-title" value={s.title} placeholder={t.storyTitlePlaceholder} onChange={e => store.setTitle(e.target.value)}/>
      <p className="script-subtitle">{s.lang === "en" ? "You imagine it. They bring it to life." : "Ты придумываешь. Они оживляют."}</p>
      {s.paragraphs.length === 0 && (
        <div className="empty">
          <h3>{s.lang === "en" ? "Once upon a little adventure…" : "Однажды в маленьком лесу…"}</h3><p>{t.emptyHint}</p>
          <div className="chips">
            {FIXTURE_IDS.map((id) => (
              <button key={id} className="chip" data-testid={`chip-${id}`} onClick={() => store.loadFixtureById(id)}>{t.fixtures[id]}</button>
            ))}
          </div>
        </div>
      )}
      <div className="cards">
        {s.paragraphs.map((p, i) => (
          <ParagraphCard key={p.id} p={p} index={i} active={activeId === p.id} selected={s.selectedId === p.id} count={s.paragraphs.length} />
        ))}
      </div>
      <button className="btn add" data-testid="add-paragraph" onClick={() => focusBlock(store.addParagraph(), "start")}><Plus size={16}/> {t.addParagraph}</button>
      <div className="writing-tip"><Sparkles size={14}/>{s.lang === "en" ? 'Try a little mischief: “Bear, wake up!”' : 'Добавь озорства: «Мишка, вставай!»'}</div>
    </aside>
  );
}
