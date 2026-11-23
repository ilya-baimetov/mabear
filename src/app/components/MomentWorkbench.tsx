import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleAlert, Clock3, Copy, LoaderCircle, MapPin, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Sparkles, Trash2, Undo2, Users, X, Zap } from "lucide-react";
import { ACTOR_IDS, MAX_PARAGRAPH_CHARS, type ActorId, type MarkId } from "../../shared/schema";
import { CHARACTERS } from "../../shared/bible/characters";
import { PROPS } from "../../shared/bible/props";
import { MARKS } from "../../shared/bible/set";
import { store } from "../store";
import { playback } from "../playback";
import { deleteMomentWithUndo, discardMomentDraft, duplicateMoment, earlierChanges, insertMoment, moveMoment, revertMoment, selectMoment, selectedMoment } from "../storyFlow";
import { shallowEqual, useStoreSelector } from "../useStore";
import { PORTRAITS } from "./castPortraits";
import { ModalDialog } from "./ModalDialog";
import { RemixButtons } from "./RemixButtons";
import { revealStage } from "./studioView";

const PLACE_IDS = Object.keys(MARKS) as MarkId[];

const ACTIONS = [
  { id: "waves", en: "waves to", ru: "машет" },
  { id: "runs", en: "runs to", ru: "бежит к" },
  { id: "jumps", en: "jumps", ru: "прыгает" },
  { id: "laughs", en: "laughs", ru: "смеётся" },
  { id: "dances", en: "dances", ru: "танцует" },
  { id: "swings", en: "swings", ru: "качается" },
  { id: "cooks_pancakes", en: "cooks pancakes", ru: "печёт блины" },
  { id: "goes_fishing", en: "goes fishing", ru: "идёт на рыбалку" },
  { id: "sings", en: "sings", ru: "поёт" },
  { id: "plays_ball", en: "plays with ball", ru: "играет в мяч" },
  { id: "hugs", en: "hugs", ru: "обнимает" },
  { id: "naps", en: "takes a nap", ru: "ложится спать" },
] as const;

const SEEDS = [
  { title: { en: "A little hello", ru: "Привет, Мишка!" }, text: { en: "Masha waves to Bear. Bear waves back.", ru: "Маша машет Медведю. Медведь машет в ответ." } },
  { title: { en: "Off to the garden", ru: "Бегом в огород" }, text: { en: "Masha runs to the garden. Bear looks at Masha.", ru: "Маша бежит в огород. Медведь смотрит на Машу." } },
  { title: { en: "Let's play!", ru: "Давай играть!" }, text: { en: 'Masha says, "Let\'s play!" Bear claps.', ru: 'Маша говорит: «Давай играть!» Медведь хлопает.' } },
];

const ACTOR_MENTION_PATTERNS: Record<ActorId, RegExp> = {
  masha: /(?<![\p{L}])(?:masha|маш(?:[аиеу]|ей|ой|еньк[аиеу]?))(?![\p{L}])/iu,
  bear: /(?<![\p{L}])(?:(?<!lady\s)(?<!rival\s)(?<!himalayan\s)bear|медвед(?:[ьяюе]|ем)(?![-\s]*спортсмен)|мишк[аиеуой]*|миш[аиеу])(?![\p{L}])/iu,
  lady_bear: /(?<![\p{L}])(?:lady\s+bear|медведиц[аыеуой]?|медведицей|медведицею)(?![\p{L}])/iu,
  rival_bear: /(?<![\p{L}])(?:(?:rival|himalayan)\s+bear|(?:гималайск[а-яё]*|спортивн[а-яё]*)\s+медвед[а-яё]*|медвед[а-яё]*[-\s]+спортсмен[а-яё]*)(?![\p{L}])/iu,
  hare: /(?<![\p{L}])(?:hare|rabbit|заяц|зайц[ауем]+|зайчик[ауоме]*|зайк[аиеуой]+)(?![\p{L}])/iu,
  rosie: /(?<![\p{L}])(?:rosie|pig|свинк[аиеуой]+|свинь[иеюяёй]+|хрюш[аиеуой]+|розочк[аиеуой]+)(?![\p{L}])/iu,
  squirrel: /(?<![\p{L}])(?:squirrel|бел(?:оч)?к[аиеуой]*)(?![\p{L}])/iu,
  wolf_a: /(?<![\p{L}])(?:big\s+wolf|(?:the\s+)?wolves|(?<!little\s)wolf|больш[а-яё]+\s+волк[а-яё]*|(?<!маленьк[а-яё]+\s)волк(?:[ауе]|ом)?|волки|волк(?:ов|ам|ами|ах))(?![\p{L}])/iu,
  wolf_b: /(?<![\p{L}])(?:little\s+wolf|(?:the\s+)?wolves|маленьк[а-яё]+\s+волк[а-яё]*|волч(?:ок|к[ауоме]+|онок|онк[ауоме]+)|волки|волк(?:ов|ам|ами|ах))(?![\p{L}])/iu,
};

function isActorMentioned(id: ActorId, body: string): boolean {
  if (ACTOR_MENTION_PATTERNS[id].test(body)) return true;
  const lower = body.toLocaleLowerCase();
  return Object.values(CHARACTERS[id].name).some(name => lower.includes(name.toLocaleLowerCase()));
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

export function MomentWorkbench({ onExamples }: { onExamples: () => void }) {
  const s = useStoreSelector(
    (st) => ({
      lang: st.lang,
      paragraphs: st.paragraphs,
      selectedId: st.selectedId,
      previewScope: st.previewScope,
      playing: st.playing,
      waiting: st.waiting,
      stageReady: st.stageReady,
      timelineRevision: st.timelineRevision,
    }),
    shallowEqual,
  );
  const p = selectedMoment(s);
  const text = useRef<HTMLTextAreaElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const keepBtn = useRef<HTMLButtonElement>(null);
  const insertFlashTimer = useRef<number | null>(null);
  const [panel, setPanel] = useState<"cast" | "actions" | "places" | "context" | "options" | "polish" | "ideas" | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [orderNote, setOrderNote] = useState(false);
  const [insertionBlocked, setInsertionBlocked] = useState(false);
  const [insertedFlash, setInsertedFlash] = useState(false);

  const clearFlashTimer = () => {
    if (insertFlashTimer.current !== null) {
      window.clearTimeout(insertFlashTimer.current);
      insertFlashTimer.current = null;
    }
  };

  useEffect(() => () => clearFlashTimer(), []);

  useEffect(() => {
    if (s.playing && s.previewScope?.kind === "moment" && s.previewScope.id === p?.id) setOrderNote(false);
  }, [s.playing, s.previewScope, p?.id]);

  useEffect(() => {
    setPanel(null);
    setRemoveOpen(false);
    setOrderNote(false);
    setInsertedFlash(false);
    clearFlashTimer();
  }, [p?.id]);

  useEffect(() => {
    setInsertedFlash(false);
    clearFlashTimer();
  }, [panel]);

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
  const authExpired = error && typeof p.error === "string" && p.error.startsWith("http_401");
  const upstream = earlierChanges(s, p.id);
  const range = store.segmentRange(p.id);
  const playingThis = ownPreview && (s.playing || s.waiting);
  const start = store.startStateFor(index);
  const mentioned = ACTOR_IDS.filter(id => isActorMentioned(id, p.text));
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

  const applySeed = (value: string) => {
    store.editText(p.id, value);
    setPanel(null);
    requestAnimationFrame(() => {
      const el = text.current;
      if (!el?.isConnected || el.dataset.pid !== p.id) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(value.length, value.length);
    });
  };

  const insert = (word: string, keepOpen = false) => {
    const el = text.current;
    const from = el?.selectionStart ?? p.text.length, to = el?.selectionEnd ?? from;
    const left = p.text.slice(0, from), right = p.text.slice(to);
    const token = `${left && !/\s$/.test(left) ? " " : ""}${word}${right && !/^\s/.test(right) ? " " : ""}`;
    const value = `${left}${token}${right}`;
    if (!keepOpen) setPanel(null);
    if (value.length > MAX_PARAGRAPH_CHARS) {
      setInsertionBlocked(true);
      el?.focus({ preventScroll: true });
      return;
    }
    setInsertionBlocked(false);
    store.editText(p.id, value);
    if (keepOpen) {
      setInsertedFlash(true);
      clearFlashTimer();
      insertFlashTimer.current = window.setTimeout(() => {
        setInsertedFlash(false);
        insertFlashTimer.current = null;
      }, 1100);
    }
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

  const focusEditor = () => {
    requestAnimationFrame(() => text.current?.focus({ preventScroll: true }));
  };

  const statusDetail = working
    ? (s.lang === "en" ? "Preparing this scene. Your writing is safe to keep editing." : "Готовим эту сцену. Можно продолжать редактировать.")
    : authExpired
      ? (s.lang === "en" ? "Session expired — sign in again." : "Сессия закончилась — войди снова.")
      : error
        ? (version ? (s.lang === "en" ? "Showing a simpler version. Try again for a better result." : "Показываем упрощённую версию. Попробуй ещё раз.") : (s.lang === "en" ? "This scene could not be prepared. Your writing is still here." : "Не удалось подготовить сцену. Текст сохранён."))
        : changed
          ? (s.lang === "en" ? "Preview to see your latest direction." : "Посмотри сцену с последними изменениями.")
          : (s.lang === "en" ? "Ready. Refine the action, or add what happens next." : "Готово. Уточни действие или придумай продолжение.");
  const continuityDetail = s.lang === "en"
    ? `Scene ${upstream[0] + 1} changed. Preview will refresh the starting scene first, then play only this scene. Your later writing stays.`
    : `Сцена ${upstream[0] + 1} изменена. Сначала обновим начало, затем покажем только эту сцену. Дальнейший текст сохранится.`;
  const orderDetail = s.lang === "en"
    ? "Scene moved. The starting scene has been updated; preview to check the new transition."
    : "Сцена перемещена. Начальная сцена обновлена; посмотри, как теперь связаны действия.";
  const insertDetail = s.lang === "en"
    ? `Adds after scene ${index + 1}, before ${index + 2}. Later writing stays.`
    : `Добавим после сцены ${index + 1}, перед ${index + 2}. Дальнейший текст сохранится.`;
  const panelTitles = {
    cast: s.lang === "en" ? "Add a character" : "Добавь героя",
    actions: s.lang === "en" ? "Add an action" : "Добавь действие",
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
          <div className="moment-position"><div><button type="button" className="btn icon" aria-label={s.lang === "en" ? "Previous scene" : "Предыдущая сцена"} disabled={!previous} onClick={() => selectMoment(previous.id)}><ArrowLeft size={15} aria-hidden="true"/></button><span>{String(index + 1).padStart(2, "0")} <i>/ {String(s.paragraphs.length).padStart(2, "0")}</i></span><button type="button" className="btn icon" aria-label={s.lang === "en" ? "Next scene" : "Следующая сцена"} disabled={!next} onClick={() => selectMoment(next.id)}><ArrowRight size={15} aria-hidden="true"/></button></div></div>
          <button type="button" className="scene-delete" data-testid="request-remove-moment" onClick={() => { setPanel(null); setRemoveOpen(true); }}><Trash2 size={15} aria-hidden="true"/>{s.lang === "en" ? "Delete scene" : "Удалить сцену"}</button>
        </div>
      </div>
    </header>
    <div className="scene-toolbar" ref={toolbar}>
      <div className="scene-action-buttons">
        {playingThis ? <button type="button" className="btn moment-preview" data-testid="moment-pause" onClick={() => playback.pause()}><Pause size={16} aria-hidden="true"/>{s.lang === "en" ? "Pause preview" : "Пауза просмотра"}</button> : <button type="button" className={`btn moment-preview ${ready && !upstream.length ? "has-preview" : ""}`} data-testid="preview-moment" disabled={blank || !s.stageReady || working} onClick={preview}>{working ? <LoaderCircle size={16} className="spin" aria-hidden="true"/> : error ? <RotateCcw size={16} aria-hidden="true"/> : <Play size={16} fill="currentColor" aria-hidden="true"/>}{error ? (s.lang === "en" ? "Try this scene again" : "Попробовать ещё раз") : upstream.length ? (s.lang === "en" ? "Preview with earlier changes" : "Смотреть с изменениями") : ready ? (s.lang === "en" ? "Replay scene" : "Повторить") : (s.lang === "en" ? "Preview scene" : "Посмотреть")}<kbd className="preview-kbd" aria-hidden="true">{IS_MAC ? "⌘↵" : "Ctrl+↵"}</kbd></button>}
        <button type="button" className={`btn next-moment ${ready ? "next-ready" : ""}`} data-testid="add-next-moment" disabled={blank || working} onClick={addNext} title={next ? insertDetail : undefined} aria-describedby={next ? "scene-insert-position" : undefined}><Plus size={16} aria-hidden="true"/>{s.lang === "en" ? "What happens next?" : "Что будет дальше?"}</button>
        {next && <span className="sr-only" id="scene-insert-position" data-testid="insert-position">{insertDetail}</span>}
      </div>
      <div className="scene-status-row" role="status" data-testid="moment-state">
        <span data-testid="moment-feedback" className={error ? "feedback-error" : working ? "feedback-working" : undefined} title={statusDetail}>{working ? <LoaderCircle size={13} className="spin" aria-hidden="true"/> : error ? <CircleAlert size={13} aria-hidden="true"/> : ready ? <Check size={13} aria-hidden="true"/> : <Sparkles size={13} aria-hidden="true"/>}{working ? (s.lang === "en" ? "Preparing preview…" : "Готовим просмотр…") : authExpired ? (s.lang === "en" ? "Session expired" : "Сессия закончилась") : error ? (version ? (s.lang === "en" ? "Simpler preview · try again" : "Упрощённо · попробуй ещё") : (s.lang === "en" ? "Preview failed · try again" : "Не удалось · попробуй ещё")) : ready ? (s.lang === "en" ? "Scene ready" : "Сцена готова") : blank ? (s.lang === "en" ? "Start with one action" : "Начни с одного действия") : (s.lang === "en" ? "Changes to preview" : "Есть изменения")}</span>
        {(p.text.length >= 420 || insertionBlocked) && <span className={`scene-char-count ${p.text.length >= MAX_PARAGRAPH_CHARS || insertionBlocked ? "at-limit" : ""}`}>{p.text.length}/{MAX_PARAGRAPH_CHARS}</span>}
        {range && !changed && !working && <small><Clock3 size={11} aria-hidden="true"/>{(range.end - range.start).toFixed(1)}{s.lang === "en" ? "s" : "с"}</small>}
        {upstream.length > 0 && <span className="scene-status-warning" data-testid="continuity-warning" title={continuityDetail} aria-label={continuityDetail}><CircleAlert size={12} aria-hidden="true"/>{s.lang === "en" ? "Earlier scene changed" : "Раньше были правки"}</span>}
        {orderNote && <span className="scene-status-warning" data-testid="order-change-note" title={orderDetail} aria-label={orderDetail}>{s.lang === "en" ? "Scene moved" : "Сцена перемещена"}</span>}
      </div>
      {authExpired && (
        <p className="scene-limit-note" data-testid="auth-expired-note" role="alert">
          <CircleAlert size={13} aria-hidden="true"/>
          <a href="/login">
            {s.lang === "en" ? "Session expired — sign in again" : "Сессия закончилась — войди снова"}
          </a>
        </p>
      )}
      {insertionBlocked && <p className="scene-limit-note" data-testid="insertion-limit-note" role="status"><CircleAlert size={13} aria-hidden="true"/><span>{s.lang === "en" ? `Scene reached ${MAX_PARAGRAPH_CHARS} characters — shorten it or select text to replace` : `В сцене уже ${MAX_PARAGRAPH_CHARS} символов — сократи текст или выдели слово`}</span></p>}
      {!!version?.ruleHits.length && <details className="moment-adjustments"><summary><Sparkles size={13} aria-hidden="true"/><span>{s.lang === "en" ? "We gently adjusted your scene" : "Мы бережно поправили сцену"}</span><ChevronDown size={13} aria-hidden="true"/></summary>{version.ruleHits.map((hit, i) => <p key={i}>{hit.kid_message}</p>)}</details>}
      <div className="scene-picker-row">
        <button type="button" id="scene-cast-toggle" className={panel === "cast" ? "on" : ""} aria-expanded={panel === "cast"} aria-controls={panel === "cast" ? "scene-toolbar-panel" : undefined} data-testid="direction-tools" onClick={() => setPanel(panel === "cast" ? null : "cast")}><Users size={13} aria-hidden="true"/>{s.lang === "en" ? "Characters" : "Герои"}<span>{ACTOR_IDS.length}</span></button>
        <button type="button" id="scene-actions-toggle" className={panel === "actions" ? "on" : ""} aria-expanded={panel === "actions"} aria-controls={panel === "actions" ? "scene-toolbar-panel" : undefined} data-testid="action-tools" onClick={() => setPanel(panel === "actions" ? null : "actions")}><Zap size={13} aria-hidden="true"/>{s.lang === "en" ? "Actions" : "Действия"}<span>{ACTIONS.length}</span></button>
        <button type="button" id="scene-places-toggle" className={panel === "places" ? "on" : ""} aria-expanded={panel === "places"} aria-controls={panel === "places" ? "scene-toolbar-panel" : undefined} data-testid="place-tools" onClick={() => setPanel(panel === "places" ? null : "places")}><MapPin size={13} aria-hidden="true"/>{s.lang === "en" ? "Locations" : "Места"}<span>{PLACE_IDS.length}</span></button>
        <button type="button" id="scene-context-toggle" className={panel === "context" ? "on" : ""} aria-expanded={panel === "context"} aria-controls={panel === "context" ? "scene-toolbar-panel" : undefined} data-testid="context-tools" onClick={() => setPanel(panel === "context" ? null : "context")}>{s.lang === "en" ? "Context" : "Контекст"}{upstream.length > 0 && <span className="context-alert-dot" aria-hidden="true">!</span>}</button>
        <button type="button" id="scene-options-toggle" className={panel === "options" ? "on" : ""} aria-expanded={panel === "options"} aria-controls={panel === "options" ? "scene-toolbar-panel" : undefined} data-testid="scene-options" onClick={() => setPanel(panel === "options" ? null : "options")}>{s.lang === "en" ? "Scene options" : "Опции сцены"}<ChevronDown size={12} aria-hidden="true"/></button>
        {ready && !upstream.length && <button type="button" id="scene-polish-toggle" className={panel === "polish" ? "on" : ""} aria-expanded={panel === "polish"} aria-controls={panel === "polish" ? "scene-toolbar-panel" : undefined} data-testid="polish-moment" onClick={() => setPanel(panel === "polish" ? null : "polish")}><SlidersHorizontal size={13} aria-hidden="true"/>{s.lang === "en" ? "Fine-tune" : "Настроить"}</button>}
        {blank && <button type="button" id="scene-ideas-toggle" className={panel === "ideas" ? "on" : ""} aria-expanded={panel === "ideas"} aria-controls={panel === "ideas" ? "scene-toolbar-panel" : undefined} data-testid="scene-ideas" onClick={() => setPanel(panel === "ideas" ? null : "ideas")}><Sparkles size={13} aria-hidden="true"/>{s.lang === "en" ? "Ideas" : "Идеи"}</button>}
      </div>
      {panel && <div className="scene-toolbar-panel" id="scene-toolbar-panel" data-testid="scene-toolbar-panel" role="region" aria-labelledby="scene-panel-title">
        <div className="scene-panel-heading"><strong id="scene-panel-title">{panelTitles[panel]}</strong>{insertedFlash && <span className="panel-inserted-pill" role="status"><Check size={11} aria-hidden="true"/>{s.lang === "en" ? "Inserted!" : "Добавлено!"}</span>}<button type="button" className="btn icon" aria-label={s.lang === "en" ? "Close panel" : "Закрыть панель"} onClick={closePanel}><X size={16} aria-hidden="true"/></button></div>
        {panel === "cast" && <div className="author-cast">{ACTOR_IDS.map(id => <button type="button" key={id} data-testid={`insert-cast-${id}`} onClick={() => insert(CHARACTERS[id].name[s.lang], true)}><img src={PORTRAITS[id]} alt=""/><span>{CHARACTERS[id].name[s.lang]}</span></button>)}</div>}
        {panel === "actions" && <div className="author-places author-actions">{ACTIONS.map(a => <button type="button" key={a.id} data-testid={`insert-action-${a.id}`} onClick={() => insert(a[s.lang], true)}>{a[s.lang]}</button>)}</div>}
        {panel === "places" && <div className="author-places">{PLACE_IDS.map(id => <button type="button" key={id} data-testid={`insert-place-${id}`} onClick={() => insert(MARKS[id].name[s.lang], true)}>{MARKS[id].name[s.lang]}</button>)}</div>}
        {panel === "context" && <section className="moment-continuity" aria-label={s.lang === "en" ? "Starting context" : "Что было до этого"}>
          <div className="context-label"><MapPin size={12} aria-hidden="true"/>{upstream.length > 0 ? (s.lang === "en" ? "LAST PREVIEW CONTEXT · WILL REFRESH" : "КОНТЕКСТ ПРОШЛОГО ПРОСМОТРА · ОБНОВИМ") : previous ? (s.lang === "en" ? `PICKS UP AFTER SCENE ${index}` : `ПРОДОЛЖАЕТ СЦЕНУ ${index}`) : (s.lang === "en" ? "WE BEGIN IN BEAR'S FOREST" : "НАЧИНАЕМ В МИШКИНОМ ЛЕСУ")}</div>
          {previous && <p className="previous-moment">{previous.text || (s.lang === "en" ? "The previous scene is still empty." : "Предыдущая сцена пока пуста.")}</p>}
          <div className="context-actors" aria-label={s.lang === "en" ? "At scene start" : "В начале сцены"}>{actors.map(id => {
            const actor = start.actors[id];
            return <span className="context-actor" key={id}><img src={PORTRAITS[id]} alt=""/><span><b>{CHARACTERS[id].name[s.lang]}</b><small>{actor.holding ? PROPS[actor.holding].name[s.lang] : actor.posture === "sleep" ? (s.lang === "en" ? "asleep" : "спит") : actor.mark ? MARKS[actor.mark].name[s.lang] : (s.lang === "en" ? "in the forest" : "в лесу")}</small></span></span>;
          })}</div>
          {upstream.length > 0 && <p className="scene-context-note">{continuityDetail}</p>}
        </section>}
        {panel === "options" && <div className="scene-option-list">
          <button type="button" data-testid="move-moment-earlier" disabled={index === 0 || working} onClick={() => { moveMoment(p.id, -1); setOrderNote(true); }}><ArrowLeft size={13} aria-hidden="true"/>{s.lang === "en" ? "Move earlier" : "Переместить раньше"}</button>
          <button type="button" data-testid="move-moment-later" disabled={!next || working} onClick={() => { moveMoment(p.id, 1); setOrderNote(true); }}><ArrowRight size={13} aria-hidden="true"/>{s.lang === "en" ? "Move later" : "Переместить дальше"}</button>
          <button type="button" data-testid="duplicate-moment" disabled={working} onClick={() => { setPanel(null); duplicateMoment(p.id); focusEditor(); }}><Copy size={13} aria-hidden="true"/>{s.lang === "en" ? "Duplicate scene" : "Сделать копию сцены"}</button>
          <button type="button" data-testid="discard-draft" disabled={!changed || p.current < 0 || working} onClick={() => { setPanel(null); discardMomentDraft(p.id); focusEditor(); }}><Undo2 size={13} aria-hidden="true"/>{s.lang === "en" ? "Discard edits" : "Отменить правки"}</button>
          <button type="button" disabled={p.current <= 0 || working} onClick={() => { setPanel(null); revertMoment(p.id); focusEditor(); }}><RotateCcw size={13} aria-hidden="true"/>{s.lang === "en" ? "Restore previous version" : "Вернуть прошлую версию"}</button>
        </div>}
        {panel === "polish" && ready && !upstream.length && <div className="moment-polish-body"><p>{s.lang === "en" ? "Change camera, light, or music. Only this scene replays." : "Измени камеру, свет или музыку. Повторится только эта сцена."}</p><RemixButtons p={p}/></div>}
        {panel === "ideas" && <div className="moment-seeds">{SEEDS.map((seed, i) => <button type="button" key={i} data-testid={`moment-seed-${i}`} onClick={() => applySeed(seed.text[s.lang])}>{seed.title[s.lang]}<ArrowRight size={13} aria-hidden="true"/></button>)}<button type="button" className="seed-examples" onClick={() => { setPanel(null); onExamples(); }}>{s.lang === "en" ? "Or explore a complete story" : "Или открой готовую историю"}<ArrowRight size={13} aria-hidden="true"/></button></div>}
      </div>}
    </div>
    <div className={`scene-writing-area ${working ? "working" : ""}`}>
      <label className="sr-only" htmlFor="moment-direction">{index === 0 ? (s.lang === "en" ? "What happens first?" : "Что случится сначала?") : (s.lang === "en" ? "What happens now?" : "Что происходит теперь?")}</label>
      <textarea
        ref={text}
        id="moment-direction"
        data-testid="moment-text"
        data-pid={p.id}
        value={p.text}
        maxLength={MAX_PARAGRAPH_CHARS}
        placeholder={s.lang === "en" ? "Masha peeks around the tree. Bear turns and waves." : "Маша выглядывает из-за дерева. Медведь оборачивается и машет."}
        onChange={e => store.editText(p.id, e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && e.keyCode !== 229 && p.text.trim() && !working && s.stageReady) {
            e.preventDefault();
            preview();
          }
        }}
      />
      {blank && <div className="blank-starters" data-testid="blank-starters">
        <span className="blank-starters-title">{s.lang === "en" ? "Need an idea? Tap to begin:" : "Нужна идея? Нажми, чтобы начать:"}</span>
        <div className="blank-starters-grid">
          {SEEDS.map((seed, i) => <button type="button" key={i} className="blank-seed" data-testid={`blank-seed-${i}`} onClick={() => applySeed(seed.text[s.lang])}>
            <strong>{seed.title[s.lang]}</strong>
            <small>{seed.text[s.lang]}</small>
          </button>)}
        </div>
        <button type="button" className="seed-examples blank-examples" onClick={onExamples}>{s.lang === "en" ? "Browse ready stories" : "Готовые истории"}<ArrowRight size={13} aria-hidden="true"/></button>
      </div>}
    </div>
    <ModalDialog
      open={removeOpen}
      onClose={() => setRemoveOpen(false)}
      className="replace-story-dialog"
      dataTestId="remove-moment-dialog"
      ariaLabelledBy="remove-moment-title"
      initialFocusRef={keepBtn}
    >
      <h2 id="remove-moment-title">{s.lang === "en" ? `Delete scene ${index + 1}?` : `Удалить сцену ${index + 1}?`}</h2>
      <p>{s.paragraphs.length === 1 ? (s.lang === "en" ? "This deletes its writing and preview. You’ll start with an empty scene." : "Её текст и предпросмотр будут удалены. Останется пустая сцена для новой истории.") : (s.lang === "en" ? "This deletes its writing and preview. All other scenes stay in the story." : "Её текст и предпросмотр будут удалены. Все остальные сцены останутся в истории.")}</p>
      <footer>
        <button ref={keepBtn} type="button" className="btn" data-testid="keep-moment" autoFocus onClick={() => setRemoveOpen(false)}>{s.lang === "en" ? "Keep scene" : "Оставить сцену"}</button>
        <button type="button" className="btn start-writing" data-testid="remove-moment" onClick={() => { setRemoveOpen(false); deleteMomentWithUndo(p.id); }}>{s.lang === "en" ? "Delete scene" : "Удалить сцену"}</button>
      </footer>
    </ModalDialog>
  </aside>;
}
