import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleAlert, Clock3, LoaderCircle, MapPin, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Sparkles, Trash2, Users, X } from "lucide-react";
import { ACTOR_IDS, MAX_PARAGRAPH_CHARS, type ActorId, type MarkId } from "../../shared/schema";
import { CHARACTERS } from "../../shared/bible/characters";
import { PROPS } from "../../shared/bible/props";
import { store } from "../store";
import { playback } from "../playback";
import { earlierChanges, insertMoment, moveMoment, selectMoment, selectedMoment } from "../storyFlow";
import { useStore } from "../useStore";
import { PORTRAITS } from "./castPortraits";
import { RemixButtons } from "./RemixButtons";
import { revealStage } from "./studioView";

const PLACES: Record<MarkId, { en: string; ru: string }> = {
  cupboard:{en:'cupboard',ru:'шкаф'},
  kitchen_bowl:{en:'kitchen bowl',ru:'миска на кухне'}, kitchen_pot:{en:'kitchen pot',ru:'кастрюля на кухне'},
  house_kitchen: { en: "kitchen", ru: "кухня" }, house_living: { en: "living room", ru: "гостиная" },
  clearing: { en: "yard", ru: "двор" }, porch: { en: "porch", ru: "крыльцо" }, door: { en: "door", ru: "дверь" }, garden: { en: "garden", ru: "огород" }, beehive: { en: "beehive", ru: "улей" }, swing: { en: "swing", ru: "качели" }, pond_shore: { en: "pond", ru: "пруд" }, pier: { en: "pier", ru: "причал" }, table: { en: "table", ru: "стол" }, bench: { en: "bench", ru: "скамейка" }, woodpile: { en: "woodpile", ru: "поленница" }, path_entry: { en: "forest path", ru: "лесная тропинка" }, big_tree: { en: "big tree", ru: "большое дерево" }, bush: { en: "bush", ru: "куст" }, hammock: { en: "hammock", ru: "гамак" }, creek: { en: "creek", ru: "ручей" }, van: { en: "ambulance", ru: "скорая помощь" },
};
const SEEDS = [
  { title: { en: "A little hello", ru: "Привет, Мишка!" }, text: { en: "Masha waves to Bear. Bear waves back.", ru: "Маша машет Медведю. Медведь машет в ответ." } },
  { title: { en: "Off to the garden", ru: "Бегом в огород" }, text: { en: "Masha runs to the garden. Bear looks at Masha.", ru: "Маша бежит в огород. Медведь смотрит на Машу." } },
  { title: { en: "Let's play!", ru: "Давай играть!" }, text: { en: 'Masha says, "Let\'s play!" Bear claps.', ru: 'Маша говорит: «Давай играть!» Медведь хлопает.' } },
];

export function MomentWorkbench({ onExamples }: { onExamples: () => void }) {
  const s = useStore();
  const p = selectedMoment(s);
  const text = useRef<HTMLTextAreaElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<"cast" | "places" | "context" | "options" | "polish" | "ideas" | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const removeDialog = useRef<HTMLDialogElement>(null);
  const [orderNote, setOrderNote] = useState(false);
  const [insertionBlocked, setInsertionBlocked] = useState(false);
  useEffect(() => { if (removeOpen && !removeDialog.current?.open) removeDialog.current?.showModal(); else if (!removeOpen && removeDialog.current?.open) removeDialog.current?.close(); }, [removeOpen]);
  useEffect(() => { if (s.playing && s.previewScope?.kind === "moment" && s.previewScope.id === p?.id) setOrderNote(false); }, [s.playing, s.previewScope, p?.id]);
  useEffect(() => { setPanel(null); setRemoveOpen(false); setOrderNote(false); }, [p?.id]);
  useEffect(() => { setInsertionBlocked(false); }, [p?.id, p?.text]);
  useEffect(() => {
    if (panel === "ideas" && p?.text.trim()) setPanel(null);
    if (panel === "polish" && p && ((p.status !== "ready" && p.status !== "adjusted") || earlierChanges(s, p.id).length > 0)) setPanel(null);
  }, [panel, p, s]);
  useEffect(() => {
    if (!panel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !toolbar.current?.contains(event.target)) setPanel(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      toolbar.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus({ preventScroll: true });
      setPanel(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panel]);
  if (!p) return null;
  const index = s.paragraphs.findIndex(x => x.id === p.id);
  const previous = s.paragraphs[index - 1], next = s.paragraphs[index + 1];
  const version = p.versions[p.current];
  const blank = !p.text.trim();
  const ownPreview = s.previewScope?.kind === "moment" && s.previewScope.id === p.id;
  const working = p.pendingVersion !== null || p.status === "directing" || (ownPreview && s.waiting);
  const changed = p.status === "draft";
  const ready = p.status === "ready" || p.status === "adjusted";
  const error = p.status === "error" || !!p.error;
  const upstream = earlierChanges(s, p.id);
  const range = store.segmentRange(p.id);
  const playingThis = ownPreview && (s.playing || s.waiting);
  const start = store.startStateFor(index);
  const mentioned = ACTOR_IDS.filter(id => Object.values(CHARACTERS[id].name).some(name => p.text.toLocaleLowerCase().includes(name.toLocaleLowerCase())));
  const relevant = [...new Set<ActorId>([
    ...(changed || !version ? mentioned : version.beatScript.beats.map(b => b.actor)),
    ...(previous?.versions[previous.current]?.beatScript.beats.map(b => b.actor) ?? []),
  ])];
  const actors: ActorId[] = relevant.length ? relevant : ["masha", "bear"];
  const preview = () => {
    if (error) store.retry(p.id);
    revealStage();
    playback.playParagraph(p.id);
  };
  const insert = (word: string) => {
    const el = text.current;
    const from = el?.selectionStart ?? p.text.length, to = el?.selectionEnd ?? from;
    const left = p.text.slice(0, from), right = p.text.slice(to);
    const token = `${left && !/\s$/.test(left) ? " " : ""}${word}${right && !/^\s/.test(right) ? " " : ""}`;
    const value = `${left}${token}${right}`;
    setPanel(null);
    if (value.length > MAX_PARAGRAPH_CHARS) {
      setInsertionBlocked(true);
      el?.focus({ preventScroll: true });
      return;
    }
    setInsertionBlocked(false);
    store.editText(p.id, value);
    requestAnimationFrame(() => {
      if (!el?.isConnected || el.dataset.pid !== p.id) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(from + token.length, from + token.length);
    });
  };
  const addNext = () => {
    const id = insertMoment(p.id);
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-pid="${id}"]`)?.focus());
  };
  const statusDetail = working
    ? (s.lang === "en" ? "Preparing this scene. Your writing is safe to keep editing." : "Готовим эту сцену. Можно продолжать редактировать.")
    : error
      ? (version ? (s.lang === "en" ? "Showing a simpler version. Try again for a better result." : "Показываем упрощённую версию. Попробуй ещё раз.") : (s.lang === "en" ? "This scene could not be prepared. Your writing is still here." : "Не удалось подготовить сцену. Текст сохранён."))
      : changed
        ? (s.lang === "en" ? "Preview to see your latest direction." : "Посмотри сцену с последними изменениями.")
        : (s.lang === "en" ? "Ready. Refine the action, or add what happens next." : "Готово. Уточни действие или придумай продолжение.");
  const continuityDetail = s.lang === "en" ? `Scene ${upstream[0] + 1} changed. Preview will refresh the starting scene first, then play only this scene. Your later writing stays.` : `Сцена ${upstream[0] + 1} изменена. Сначала обновим начало, затем покажем только эту сцену. Дальнейший текст сохранится.`;
  const orderDetail = s.lang === "en" ? "Scene moved. The starting scene has been updated; preview to check the new transition." : "Сцена перемещена. Начальная сцена обновлена; посмотри, как теперь связаны действия.";
  const insertDetail = s.lang === "en" ? `Adds after scene ${index + 1}, before ${index + 2}. Later writing stays.` : `Добавим после сцены ${index + 1}, перед ${index + 2}. Дальнейший текст сохранится.`;
  const panelTitles = {
    cast: s.lang === "en" ? "Add a character" : "Добавь героя",
    places: s.lang === "en" ? "Add a location" : "Добавь место",
    context: s.lang === "en" ? "Starting context" : "В начале сцены",
    options: s.lang === "en" ? "Scene options" : "Действия со сценой",
    polish: s.lang === "en" ? "Fine-tune this scene" : "Настрой эту сцену",
    ideas: s.lang === "en" ? "Choose a beginning" : "Выбери начало",
  };
  const closePanel = () => {
    toolbar.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus({ preventScroll: true });
    setPanel(null);
  };
  return <aside className="moment-workbench" data-testid="moment-workbench" aria-label={s.lang === "en" ? "Direct this scene" : "Создай эту сцену"}>
    <header className="moment-header">
      <div className="scene-title-row">
        <h1>{s.lang === "en" ? `Scene ${index + 1}` : `Сцена ${index + 1}`}</h1>
        <div className="scene-header-actions">
          <div className="moment-position"><div><button className="btn icon" aria-label={s.lang === "en" ? "Previous scene" : "Предыдущая сцена"} disabled={!previous} onClick={() => selectMoment(previous.id)}><ArrowLeft size={15}/></button><span>{String(index + 1).padStart(2, "0")} <i>/ {String(s.paragraphs.length).padStart(2, "0")}</i></span><button className="btn icon" aria-label={s.lang === "en" ? "Next scene" : "Следующая сцена"} disabled={!next} onClick={() => selectMoment(next.id)}><ArrowRight size={15}/></button></div></div>
          <button className="scene-delete" data-testid="request-remove-moment" onClick={() => setRemoveOpen(true)}><Trash2 size={15}/>{s.lang === "en" ? "Delete scene" : "Удалить сцену"}</button>
        </div>
      </div>
    </header>
    <div className="scene-toolbar" ref={toolbar}>
      <div className="scene-action-buttons">
        {playingThis ? <button className="btn moment-preview" data-testid="moment-pause" onClick={() => playback.pause()}><Pause size={16}/>{s.lang === "en" ? "Pause preview" : "Пауза просмотра"}</button> : <button className={`btn moment-preview ${ready && !upstream.length ? "has-preview" : ""}`} data-testid="preview-moment" disabled={blank || !s.stageReady || working} onClick={preview}>{working ? <LoaderCircle size={16} className="spin"/> : error ? <RotateCcw size={16}/> : <Play size={16} fill="currentColor"/>}{error ? (s.lang === "en" ? "Try this scene again" : "Попробовать ещё раз") : upstream.length ? (s.lang === "en" ? "Preview with earlier changes" : "Смотреть с изменениями") : ready ? (s.lang === "en" ? "Replay scene" : "Повторить") : (s.lang === "en" ? "Preview scene" : "Посмотреть")}</button>}
        <button className={`btn next-moment ${ready ? "next-ready" : ""}`} data-testid="add-next-moment" disabled={blank || working} onClick={addNext} title={next ? insertDetail : undefined} aria-describedby={next ? "scene-insert-position" : undefined}><Plus size={16}/>{s.lang === "en" ? "Add scene" : "Добавить сцену"}</button>
        {next && <span className="sr-only" id="scene-insert-position" data-testid="insert-position">{insertDetail}</span>}
      </div>
      <div className="scene-status-row" role="status" data-testid="moment-state">
        <span data-testid="moment-feedback" title={statusDetail}>{working ? <LoaderCircle size={13} className="spin"/> : error ? <CircleAlert size={13}/> : ready ? <Check size={13}/> : <Sparkles size={13}/>}{working ? (s.lang === "en" ? "Preparing preview…" : "Готовим просмотр…") : error ? (version ? (s.lang === "en" ? "Simpler preview · try again" : "Упрощённо · попробуй ещё") : (s.lang === "en" ? "Preview failed · try again" : "Не удалось · попробуй ещё")) : ready ? (s.lang === "en" ? "Scene ready" : "Сцена готова") : blank ? (s.lang === "en" ? "Start with one action" : "Начни с одного действия") : (s.lang === "en" ? "Changes to preview" : "Есть изменения")}</span>
        {range && !changed && !working && <small><Clock3 size={11}/>{(range.end - range.start).toFixed(1)}{s.lang === "en" ? "s" : "с"}</small>}
        {upstream.length > 0 && <span className="scene-status-warning" data-testid="continuity-warning" title={continuityDetail} aria-label={continuityDetail}><CircleAlert size={12}/>{s.lang === "en" ? "Earlier scene changed" : "Начало изменилось"}</span>}
        {orderNote && <span className="scene-status-warning" data-testid="order-change-note" title={orderDetail} aria-label={orderDetail}>{s.lang === "en" ? "Scene moved" : "Сцена перемещена"}</span>}
        {insertionBlocked && <span className="scene-status-warning" data-testid="insertion-limit-note" title={s.lang === "en" ? "There is not enough room to insert the complete name. Shorten your scene or select text to replace." : "Недостаточно места для полного названия. Сократи сцену или выдели текст для замены."}>{s.lang === "en" ? "No room to insert" : "Не хватает места"}</span>}
      </div>
      <div className="scene-picker-row">
        <button id="scene-cast-toggle" className={panel === "cast" ? "on" : ""} aria-expanded={panel === "cast"} aria-controls="scene-toolbar-panel" data-testid="direction-tools" onClick={() => setPanel(panel === "cast" ? null : "cast")}><Users size={13}/>{s.lang === "en" ? "Characters" : "Герои"}<span>{ACTOR_IDS.length}</span></button>
        <button id="scene-places-toggle" className={panel === "places" ? "on" : ""} aria-expanded={panel === "places"} aria-controls="scene-toolbar-panel" data-testid="place-tools" onClick={() => setPanel(panel === "places" ? null : "places")}><MapPin size={13}/>{s.lang === "en" ? "Locations" : "Места"}<span>{Object.keys(PLACES).length}</span></button>
        <button id="scene-context-toggle" className={panel === "context" ? "on" : ""} aria-expanded={panel === "context"} aria-controls="scene-toolbar-panel" data-testid="context-tools" onClick={() => setPanel(panel === "context" ? null : "context")}>{s.lang === "en" ? "Context" : "Контекст"}</button>
        <button id="scene-options-toggle" className={panel === "options" ? "on" : ""} aria-expanded={panel === "options"} aria-controls="scene-toolbar-panel" data-testid="scene-options" onClick={() => setPanel(panel === "options" ? null : "options")}>{s.lang === "en" ? "Scene options" : "Действия"}<ChevronDown size={12}/></button>
        {ready && !upstream.length && <button id="scene-polish-toggle" className={panel === "polish" ? "on" : ""} aria-expanded={panel === "polish"} aria-controls="scene-toolbar-panel" data-testid="polish-moment" onClick={() => setPanel(panel === "polish" ? null : "polish")}><SlidersHorizontal size={13}/>{s.lang === "en" ? "Fine-tune" : "Настроить"}</button>}
        {blank && <button id="scene-ideas-toggle" className={panel === "ideas" ? "on" : ""} aria-expanded={panel === "ideas"} aria-controls="scene-toolbar-panel" data-testid="scene-ideas" onClick={() => setPanel(panel === "ideas" ? null : "ideas")}><Sparkles size={13}/>{s.lang === "en" ? "Ideas" : "Идеи"}</button>}
      </div>
      {panel && <div className="scene-toolbar-panel" id="scene-toolbar-panel" data-testid="scene-toolbar-panel" role="region" aria-labelledby={`scene-${panel}-toggle`}>
        <div className="scene-panel-heading"><strong>{panelTitles[panel]}</strong><button className="btn icon" aria-label={s.lang === "en" ? "Close panel" : "Закрыть панель"} onClick={closePanel}><X size={16}/></button></div>
        {panel === "cast" && <div className="author-cast">{ACTOR_IDS.map(id => <button key={id} data-testid={`insert-cast-${id}`} onClick={() => insert(CHARACTERS[id].name[s.lang])}><img src={PORTRAITS[id]} alt=""/><span>{CHARACTERS[id].name[s.lang]}</span></button>)}</div>}
        {panel === "places" && <div className="author-places">{(Object.keys(PLACES) as MarkId[]).map(id => <button key={id} data-testid={`insert-place-${id}`} onClick={() => insert(PLACES[id][s.lang])}>{PLACES[id][s.lang]}</button>)}</div>}
        {panel === "context" && <section className="moment-continuity" aria-label={s.lang === "en" ? "Starting context" : "Что было до этого"}>
          <div className="context-label"><MapPin size={12}/>{upstream.length > 0 ? (s.lang === "en" ? "LAST PREVIEW CONTEXT · WILL REFRESH" : "КОНТЕКСТ ПРОШЛОГО ПРОСМОТРА · ОБНОВИМ") : previous ? (s.lang === "en" ? `PICKS UP AFTER SCENE ${index}` : `ПРОДОЛЖАЕТ СЦЕНУ ${index}`) : (s.lang === "en" ? "WE BEGIN IN BEAR'S FOREST" : "НАЧИНАЕМ В МИШКИНОМ ЛЕСУ")}</div>
          {previous && <p className="previous-moment">{previous.text || (s.lang === "en" ? "The previous scene is still empty." : "Предыдущая сцена пока пуста.")}</p>}
          <div className="context-actors" aria-label={s.lang === "en" ? "At scene start" : "В начале сцены"}>{actors.map(id => {
            const actor = start.actors[id];
            return <span className="context-actor" key={id}><img src={PORTRAITS[id]} alt=""/><span><b>{CHARACTERS[id].name[s.lang]}</b><small>{actor.holding ? PROPS[actor.holding].name[s.lang] : actor.posture === "sleep" ? (s.lang === "en" ? "asleep" : "спит") : actor.mark ? PLACES[actor.mark][s.lang] : (s.lang === "en" ? "in the forest" : "в лесу")}</small></span></span>;
          })}</div>
          {upstream.length > 0 && <p className="scene-context-note">{continuityDetail}</p>}
          {!!version?.ruleHits.length && <details className="moment-adjustments"><summary><Sparkles size={13}/>{s.lang === "en" ? "A small adjustment to your direction" : "Немного поправили замысел"}<ChevronDown size={13}/></summary>{version.ruleHits.map((hit, i) => <p key={i}>{hit.kid_message}</p>)}</details>}
        </section>}
        {panel === "options" && <div className="scene-option-list">
          <button data-testid="move-moment-earlier" disabled={index === 0 || working} onClick={() => { moveMoment(p.id, -1); setOrderNote(true); }}><ArrowLeft size={13}/>{s.lang === "en" ? "Move earlier" : "Переместить раньше"}</button>
          <button data-testid="move-moment-later" disabled={!next || working} onClick={() => { moveMoment(p.id, 1); setOrderNote(true); }}><ArrowRight size={13}/>{s.lang === "en" ? "Move later" : "Переместить дальше"}</button>
          <button disabled={p.current <= 0 || working} onClick={() => store.revert(p.id)}><RotateCcw size={13}/>{s.lang === "en" ? "Restore previous version" : "Вернуть прошлую версию"}</button>
        </div>}
        {panel === "polish" && ready && !upstream.length && <div className="moment-polish-body"><p>{s.lang === "en" ? "Change camera, light, or music. Only this scene replays." : "Измени камеру, свет или музыку. Повторится только эта сцена."}</p><RemixButtons p={p}/></div>}
        {panel === "ideas" && <div className="moment-seeds">{SEEDS.map((seed, i) => <button key={i} data-testid={`moment-seed-${i}`} onClick={() => { store.editText(p.id, seed.text[s.lang]); setPanel(null); text.current?.focus(); }}>{seed.title[s.lang]}<ArrowRight size={13}/></button>)}<button className="seed-examples" onClick={() => { setPanel(null); onExamples(); }}>{s.lang === "en" ? "Or explore a complete story" : "Или открой готовую историю"}<ArrowRight size={13}/></button></div>}
      </div>}
    </div>
    <div className={`scene-writing-area ${working ? "working" : ""}`}>
      <label className="sr-only" htmlFor="moment-direction">{index === 0 ? (s.lang === "en" ? "What happens first?" : "Что случится сначала?") : (s.lang === "en" ? "What happens now?" : "Что происходит теперь?")}</label>
      <textarea ref={text} id="moment-direction" data-testid="moment-text" data-pid={p.id} value={p.text} maxLength={MAX_PARAGRAPH_CHARS} placeholder={s.lang === "en" ? "Masha peeks around the tree. Bear turns and waves." : "Маша выглядывает из-за дерева. Медведь оборачивается и машет."} onChange={e => store.editText(p.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && p.text.trim() && !working && s.stageReady) { e.preventDefault(); preview(); } }}/>
    </div>
    <dialog ref={removeDialog} className="replace-story-dialog" data-testid="remove-moment-dialog" aria-labelledby="remove-moment-title" onCancel={() => setRemoveOpen(false)} onClick={e => { if (e.target === e.currentTarget) setRemoveOpen(false); }}>
      <h2 id="remove-moment-title">{s.lang === "en" ? `Delete scene ${index + 1}?` : `Удалить сцену ${index + 1}?`}</h2>
      <p>{s.paragraphs.length === 1 ? (s.lang === "en" ? "This deletes its writing and preview. You’ll start with an empty scene." : "Её текст и предпросмотр будут удалены. Останется пустая сцена для новой истории.") : (s.lang === "en" ? "This deletes its writing and preview. All other scenes stay in the story." : "Её текст и предпросмотр будут удалены. Все остальные сцены останутся в истории.")}</p>
      <footer><button className="btn" data-testid="keep-moment" onClick={() => setRemoveOpen(false)}>{s.lang === "en" ? "Keep scene" : "Оставить сцену"}</button><button className="btn start-writing" data-testid="remove-moment" onClick={() => { playback.pause(); const adjacent = previous ?? next; setRemoveOpen(false); store.deleteParagraph(p.id); if (adjacent) selectMoment(adjacent.id); else { const id = store.addParagraph(); playback.setScope({ kind: "moment", id }); } }}>{s.lang === "en" ? "Delete scene" : "Удалить сцену"}</button></footer>
    </dialog>
  </aside>;
}
