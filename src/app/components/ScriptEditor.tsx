import { store } from "../store";
import { useStore, useStrings } from "../useStore";
import { ParagraphCard } from "./ParagraphCard";

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
      <h2 className="script-title">{t.script}</h2>
      {s.paragraphs.length === 0 && (
        <div className="empty">
          <p>{t.emptyHint}</p>
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
      <button className="btn add" data-testid="add-paragraph" onClick={() => store.addParagraph()}>＋ {t.addParagraph}</button>
    </aside>
  );
}
