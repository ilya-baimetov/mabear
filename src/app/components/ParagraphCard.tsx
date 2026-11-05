import { useCallback, useEffect, useRef, useState } from "react";
import { useOutsideClose } from "../useOutsideClose";
import { store, type Paragraph } from "../store";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";
import { RemixButtons } from "./RemixButtons";
import { MAX_PARAGRAPH_CHARS } from "../../shared/schema";

const CHIP: Record<Paragraph["status"], string> = { draft: "✏️", directing: "⏳", ready: "✅", adjusted: "✨", error: "⚠️" };

export function ParagraphCard({ p, index, active, selected, count }: { p: Paragraph; index: number; active: boolean; selected: boolean; count: number }) {
  const s = useStore();
  const t = useStrings();
  const ta = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState(false);
  const [notes, setNotes] = useState(false);
  const menuRef = useOutsideClose(menu, useCallback(() => setMenu(false), []));
  const v = p.versions[p.current];
  const si = s.segmentIds.indexOf(p.id);
  const result = si >= 0 ? s.results[si] : null;
  const dur = result?.segment.duration ?? 0;

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [p.text]);
  // Typing, blur and Ctrl+Enter never render: the story is directed and compiled only on ▶ Play (spec §4.2).

  const bs = v?.beatScript;
  const lines = result ? result.segment.dialogue.length : bs ? bs.beats.filter((b) => b.line).length : 0;
  const music = result?.carry.music?.mood ?? null;
  const amb = result?.carry.ambience ?? [];
  const hits = v?.ruleHits ?? [];
  const canPlay = p.text.trim().length > 0;

  return (
    <div
      className={`card status-${p.status} ${active ? "active" : ""} ${selected ? "selected" : ""}`}
      data-testid="paragraph-card"
      data-status={p.status}
      data-version={v?.version ?? 0}
      data-active={active ? "1" : "0"}
      onClick={() => store.select(p.id)}
    >
      <div className="card-head">
        <span className="idx">{index + 1}</span>
        <button className="btn icon small card-play" data-testid="card-play" title={t.playThis} aria-label={t.playThis} disabled={!canPlay} onClick={(e) => { e.stopPropagation(); playback.playParagraph(p.id); }}>▶</button>
        <span className={`status-chip chip-${p.status}`} data-testid="status-chip" title={p.status === "error" ? t.errorTip : p.status === "draft" && canPlay ? t.draftTip : ""}>
          {CHIP[p.status]} {t.status[p.status]}
        </span>
        {hits.length > 0 && (
          <button className="btn icon small notes-btn" data-testid="rule-notes-btn" title={t.ruleNotes} aria-label={t.ruleNotes} aria-expanded={notes} onClick={(e) => { e.stopPropagation(); setNotes(!notes); }}>💡</button>
        )}
        {dur > 0 && <span className="dur">{dur.toFixed(1)}{t.seconds}</span>}
        <span className="ver" data-testid="version">{t.version}{v?.version ?? 0}</span>
        <div className="card-menu" ref={menuRef}>
          <button className="btn icon small" data-testid="card-menu" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}>⋯</button>
          {menu && (
            <div className="menu right" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { store.deleteParagraph(p.id); setMenu(false); }}>{t.menu.delete}</button>
              <button disabled={p.current <= 0} onClick={() => { store.revert(p.id); setMenu(false); }}>{t.menu.revert}</button>
              <button disabled={index === 0} onClick={() => { store.moveParagraph(p.id, -1); setMenu(false); }}>{t.menu.up}</button>
              <button disabled={index === count - 1} onClick={() => { store.moveParagraph(p.id, 1); setMenu(false); }}>{t.menu.down}</button>
            </div>
          )}
        </div>
      </div>
      <textarea
        ref={ta}
        rows={2}
        data-testid="paragraph-text"
        maxLength={MAX_PARAGRAPH_CHARS}
        value={p.text}
        placeholder={t.paragraphPlaceholder}
        onChange={(e) => store.editText(p.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.blur(); return; }
          if (e.key === "Enter" && !e.shiftKey && index === count - 1) {
            const el = e.currentTarget;
            const atEnd = el.selectionStart === el.value.length;
            const lastLine = el.value.split("\n").pop() ?? "";
            if (atEnd && lastLine.trim() === "" && el.value.trim() !== "") {
              e.preventDefault();
              store.editText(p.id, el.value.replace(/\n+$/, ""));
              const id = store.addParagraph(p.id);
              setTimeout(() => (document.querySelector(`[data-pid="${id}"]`) as HTMLTextAreaElement | null)?.focus(), 0);
            }
          }
        }}
        data-pid={p.id}
      />
      {notes && hits.length > 0 && (
        <div className="kid-msg" data-testid="rule-notes" onClick={(e) => e.stopPropagation()}>
          {hits.map((h, i) => <div key={i}>✨ {h.kid_message}</div>)}
        </div>
      )}
      {p.status === "error" && (
        <div className="err">
          <button className="btn small" data-testid="retry" onClick={(e) => { e.stopPropagation(); store.retry(p.id); playback.playParagraph(p.id); }}>↻ {t.retry}</button>
        </div>
      )}
      {v && (
        <div className="card-foot">
          <div className="audio-chips">
            {music && music !== "none" && <span className="achip" title={t.remix.music}>🎵 {t.musicMood[music]}</span>}
            {amb.slice(0, 2).map((a) => (
              <span key={a} className="achip">{a === "rain" || a === "thunderstorm" ? "🌧" : a === "night_crickets" ? "🦗" : a === "bees" ? "🐝" : a === "creek" ? "💧" : "🌿"} {t.ambience[a]}</span>
            ))}
            {lines > 0 && <span className="achip">💬 {lines}</span>}
          </div>
          {(p.status === "ready" || p.status === "adjusted") && <RemixButtons p={p} />}
        </div>
      )}
    </div>
  );
}
