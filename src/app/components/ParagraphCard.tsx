// One story paragraph as a Notion-style block: borderless text, controls in a hover gutter, a faint details line.
// Typing, blur and Ctrl+Enter never render: the story is directed and compiled only on ▶ Play (spec §4.2).
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutsideClose } from "../useOutsideClose";
import { store, type Paragraph } from "../store";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";
import { RemixButtons } from "./RemixButtons";
import { MAX_PARAGRAPH_CHARS } from "../../shared/schema";

const CHIP: Record<Paragraph["status"], string> = { draft: "✏️", directing: "⏳", ready: "✅", adjusted: "✨", error: "⚠️" };

/** Focus a block's text, caret at the start or the end. */
export function focusBlock(id: string, at: "start" | "end" = "end"): void {
  setTimeout(() => {
    const el = document.querySelector(`[data-pid="${id}"]`) as HTMLTextAreaElement | null;
    if (!el) return;
    el.focus();
    const pos = at === "end" ? el.value.length : 0;
    el.setSelectionRange(pos, pos);
  }, 0);
}

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

  const bs = v?.beatScript;
  const lines = result ? result.segment.dialogue.length : bs ? bs.beats.filter((b) => b.line).length : 0;
  const music = result?.carry.music?.mood ?? null;
  const amb = result?.carry.ambience ?? [];
  const hits = v?.ruleHits ?? [];
  const canPlay = p.text.trim().length > 0;
  const neighbour = (d: -1 | 1) => s.paragraphs[index + d]?.id ?? null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      el.blur();
      return;
    }
    // Enter = new block below (Notion); Shift+Enter = line break inside the block
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && atEnd && el.value.trim() !== "") {
      e.preventDefault();
      store.editText(p.id, el.value.replace(/\n+$/, ""));
      focusBlock(store.addParagraph(p.id), "start");
      return;
    }
    // Backspace in an empty block removes it and jumps to the end of the previous one
    if (e.key === "Backspace" && el.value === "" && count > 1) {
      e.preventDefault();
      const prev = neighbour(-1) ?? neighbour(1);
      store.deleteParagraph(p.id);
      if (prev) focusBlock(prev, "end");
      return;
    }
    if (e.key === "ArrowUp" && atStart && neighbour(-1)) {
      e.preventDefault();
      focusBlock(neighbour(-1)!, "end");
      return;
    }
    if (e.key === "ArrowDown" && atEnd && neighbour(1)) {
      e.preventDefault();
      focusBlock(neighbour(1)!, "start");
    }
  };

  const statusTip = p.status === "error" ? t.errorTip : p.status === "draft" && canPlay ? t.draftTip : t.status[p.status];

  return (
    <div
      className={`block status-${p.status} ${active ? "active" : ""} ${selected ? "selected" : ""} ${menu ? "menu-open" : ""}`}
      data-testid="paragraph-card"
      data-status={p.status}
      data-version={v?.version ?? 0}
      data-active={active ? "1" : "0"}
      onClick={() => store.select(p.id)}
    >
      <div className="gutter">
        <button className="gbtn card-play" data-testid="card-play" title={t.playThis} aria-label={t.playThis} disabled={!canPlay} onClick={(e) => { e.stopPropagation(); playback.playParagraph(p.id); }}>▶</button>
        <div className="card-menu" ref={menuRef}>
          <button className="gbtn" data-testid="card-menu" aria-label="⋯" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}>⋮⋮</button>
          {menu && (
            <div className="menu" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { store.deleteParagraph(p.id); setMenu(false); }}>{t.menu.delete}</button>
              <button disabled={p.current <= 0} onClick={() => { store.revert(p.id); setMenu(false); }}>{t.menu.revert}</button>
              <button disabled={index === 0} onClick={() => { store.moveParagraph(p.id, -1); setMenu(false); }}>{t.menu.up}</button>
              <button disabled={index === count - 1} onClick={() => { store.moveParagraph(p.id, 1); setMenu(false); }}>{t.menu.down}</button>
            </div>
          )}
        </div>
      </div>
      <div className="block-body">
        <div className="block-line">
          <textarea
            ref={ta}
            rows={1}
            data-testid="paragraph-text"
            maxLength={MAX_PARAGRAPH_CHARS}
            value={p.text}
            placeholder={index === 0 || selected ? t.paragraphPlaceholder : ""}
            onChange={(e) => store.editText(p.id, e.target.value)}
            onFocus={() => store.select(p.id)}
            onKeyDown={onKeyDown}
            data-pid={p.id}
          />
          <span className={`status-chip chip-${p.status}`} data-testid="status-chip" title={statusTip} aria-label={t.status[p.status]}>
            {CHIP[p.status]}
          </span>
        </div>
        {(v || p.status === "error" || p.status === "directing") && (
          <div className="block-meta">
            {p.status === "directing" && <span className="meta-text">{t.status.directing}</span>}
            {dur > 0 && <span className="meta-text">{dur.toFixed(1)}{t.seconds}</span>}
            {music && music !== "none" && <span className="achip" title={t.remix.music}>🎵 {t.musicMood[music]}</span>}
            {amb.slice(0, 2).map((a) => (
              <span key={a} className="achip">{a === "rain" || a === "thunderstorm" ? "🌧" : a === "night_crickets" ? "🦗" : a === "bees" ? "🐝" : a === "creek" ? "💧" : "🌿"} {t.ambience[a]}</span>
            ))}
            {lines > 0 && <span className="achip">💬 {lines}</span>}
            {hits.length > 0 && (
              <button className="gbtn notes-btn" data-testid="rule-notes-btn" title={t.ruleNotes} aria-label={t.ruleNotes} aria-expanded={notes} onClick={(e) => { e.stopPropagation(); setNotes(!notes); }}>💡</button>
            )}
            {p.status === "error" && (
              <button className="linkbtn" data-testid="retry" onClick={(e) => { e.stopPropagation(); store.retry(p.id); playback.playParagraph(p.id); }}>↻ {t.retry}</button>
            )}
            <span className="meta-spacer" />
            {(p.status === "ready" || p.status === "adjusted") && <RemixButtons p={p} />}
            <span className="meta-text ver" data-testid="version">{t.version}{v?.version ?? 0}</span>
          </div>
        )}
        {notes && hits.length > 0 && (
          <div className="kid-msg" data-testid="rule-notes" onClick={(e) => e.stopPropagation()}>
            {hits.map((h, i) => <div key={i}>✨ {h.kid_message}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
