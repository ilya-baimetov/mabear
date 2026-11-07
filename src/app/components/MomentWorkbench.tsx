import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, CircleAlert, Clock3, LoaderCircle, MapPin, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Sparkles, Trash2, Users } from "lucide-react";
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
  house_kitchen: { en: "kitchen", ru: "кухня" }, house_living: { en: "living room", ru: "гостиная" },
  clearing: { en: "yard", ru: "двор" }, porch: { en: "porch", ru: "крыльцо" }, door: { en: "door", ru: "дверь" }, garden: { en: "garden", ru: "огород" }, beehive: { en: "beehive", ru: "улей" }, swing: { en: "swing", ru: "качели" }, pond_shore: { en: "pond", ru: "пруд" }, pier: { en: "pier", ru: "причал" }, table: { en: "table", ru: "стол" }, bench: { en: "bench", ru: "скамейка" }, woodpile: { en: "woodpile", ru: "поленница" }, path_entry: { en: "forest path", ru: "лесная тропинка" }, big_tree: { en: "big tree", ru: "большое дерево" }, bush: { en: "bush", ru: "куст" }, hammock: { en: "hammock", ru: "гамак" }, creek: { en: "creek", ru: "ручей" }, van: { en: "van", ru: "фургон" },
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
  const [tools, setTools] = useState(false);
  const [polish, setPolish] = useState(false);
  const [options, setOptions] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const removeDialog = useRef<HTMLDialogElement>(null);
  const [orderNote, setOrderNote] = useState(false);
  useEffect(() => { if (removeOpen && !removeDialog.current?.open) removeDialog.current?.showModal(); else if (!removeOpen && removeDialog.current?.open) removeDialog.current?.close(); }, [removeOpen]);
  useEffect(() => { if (s.playing && s.previewScope?.kind === "moment" && s.previewScope.id === p?.id) setOrderNote(false); }, [s.playing, s.previewScope, p?.id]);
  useEffect(() => { setTools(false); setPolish(false); setOptions(false); setRemoveOpen(false); setOrderNote(false); }, [p?.id]);
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
    const value = `${left}${token}${right}`.slice(0, MAX_PARAGRAPH_CHARS);
    store.editText(p.id, value);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(from + token.length, from + token.length); });
  };
  const addNext = () => {
    const id = insertMoment(p.id);
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-pid="${id}"]`)?.focus());
  };
  return <aside className="moment-workbench" data-testid="moment-workbench" aria-label={s.lang === "en" ? "Direct this scene" : "Создай эту сцену"}>
    <header className="moment-header">
      <div className="moment-position"><span className="eyebrow">{s.lang === "en" ? "EDITING SCENE" : "РЕДАКТОР СЦЕНЫ"}</span><div><button className="btn icon" aria-label={s.lang === "en" ? "Previous scene" : "Предыдущая сцена"} disabled={!previous} onClick={() => selectMoment(previous.id)}><ArrowLeft size={15}/></button><span>{String(index + 1).padStart(2, "0")} <i>/ {String(s.paragraphs.length).padStart(2, "0")}</i></span><button className="btn icon" aria-label={s.lang === "en" ? "Next scene" : "Следующая сцена"} disabled={!next} onClick={() => selectMoment(next.id)}><ArrowRight size={15}/></button></div></div>
      <h1>{index === 0 && blank ? (s.lang === "en" ? "Create your first scene." : "Начни с одной сцены.") : s.lang === "en" ? `Scene ${index + 1}` : `Сцена ${index + 1}`}</h1>
      <p>{s.lang === "en" ? "One action. A few words. See it come to life." : "Одно действие. Несколько слов. И история оживает."}</p>
    </header>
    <div className="moment-editor-scroll">
      <section className="moment-continuity" aria-label={s.lang === "en" ? "Starting context" : "Что было до этого"}>
        <div className="context-label"><MapPin size={12}/>{upstream.length > 0 ? (s.lang === "en" ? "LAST PREVIEW CONTEXT · WILL REFRESH" : "КОНТЕКСТ ПРОШЛОГО ПРОСМОТРА · ОБНОВИМ") : previous ? (s.lang === "en" ? `PICKS UP AFTER SCENE ${index}` : `ПРОДОЛЖАЕТ СЦЕНУ ${index}`) : (s.lang === "en" ? "WE BEGIN IN BEAR'S FOREST" : "НАЧИНАЕМ В МИШКИНОМ ЛЕСУ")}</div>
        {previous && <p className="previous-moment">{previous.text || (s.lang === "en" ? "The previous scene is still empty." : "Предыдущая сцена пока пуста.")}</p>}
        <div className="context-actors">{actors.slice(0, 3).map(id => {
          const actor = start.actors[id];
          return <span className="context-actor" key={id}><img src={PORTRAITS[id]} alt=""/><span><b>{CHARACTERS[id].name[s.lang]}</b><small>{actor.holding ? PROPS[actor.holding].name[s.lang] : actor.posture === "sleep" ? (s.lang === "en" ? "asleep" : "спит") : actor.mark ? PLACES[actor.mark][s.lang] : (s.lang === "en" ? "in the forest" : "в лесу")}</small></span></span>;
        })}{actors.length > 3 && <span className="context-more" title={actors.slice(3).map(id => CHARACTERS[id].name[s.lang]).join(", ")} aria-label={actors.slice(3).map(id => CHARACTERS[id].name[s.lang]).join(", ")}>+{actors.length - 3}</span>}</div>
        {upstream.length > 0 && <div className="continuity-warning" data-testid="continuity-warning"><CircleAlert size={14}/><span>{s.lang === "en" ? `Scene ${upstream[0] + 1} changed. Preview will refresh the starting scene first, then play only this scene. Your later writing stays.` : `Сцена ${upstream[0] + 1} изменена. Сначала обновим начало, затем покажем только эту сцену. Дальнейший текст сохранится.`}</span></div>}
      </section>
      <label className="direction-label" htmlFor="moment-direction">{index === 0 ? (s.lang === "en" ? "What happens first?" : "Что случится сначала?") : (s.lang === "en" ? "What happens now?" : "Что происходит теперь?")}</label>
      <div className={`direction-input ${working ? "working" : ""}`}>
        <textarea ref={text} id="moment-direction" data-testid="moment-text" data-pid={p.id} value={p.text} maxLength={MAX_PARAGRAPH_CHARS} placeholder={s.lang === "en" ? "Masha peeks around the tree. Bear turns and waves." : "Маша выглядывает из-за дерева. Медведь оборачивается и машет."} onChange={e => store.editText(p.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && p.text.trim() && !working && s.stageReady) { e.preventDefault(); preview(); } }}/>
        <div className="direction-input-foot"><span>{s.lang === "en" ? "Actions, feelings, or dialogue" : "Действия, чувства или реплики"}</span><button className={tools ? "on" : ""} aria-expanded={tools} data-testid="direction-tools" onClick={() => setTools(!tools)}><Plus size={13}/>{s.lang === "en" ? "Names & places" : "Герои и места"}</button></div>
      </div>
      {tools && <div className="direction-toolbox">
        <span className="toolbox-label"><Users size={12}/>{s.lang === "en" ? "Add a name to your direction" : "Добавь имя в свой замысел"}</span>
        <div className="author-cast">{ACTOR_IDS.map(id => <button key={id} data-testid={`insert-cast-${id}`} onClick={() => insert(CHARACTERS[id].name[s.lang])}><img src={PORTRAITS[id]} alt=""/><span>{CHARACTERS[id].name[s.lang]}</span></button>)}</div>
        <span className="toolbox-label"><MapPin size={12}/>{s.lang === "en" ? "Or a place in the forest" : "Или место в лесу"}</span>
        <div className="author-places">{(["garden", "table", "swing", "pond_shore", "hammock", "big_tree"] as const).map(id => <button key={id} onClick={() => insert(PLACES[id][s.lang])}>{PLACES[id][s.lang]}</button>)}</div>
      </div>}
      {blank && <div className="moment-seeds"><span>{s.lang === "en" ? "Need a beginning?" : "Нужна идея для начала?"}</span>{SEEDS.map((seed, i) => <button key={i} data-testid={`moment-seed-${i}`} onClick={() => { store.editText(p.id, seed.text[s.lang]); text.current?.focus(); }}>{seed.title[s.lang]}<ArrowRight size={13}/></button>)}<button className="seed-examples" onClick={onExamples}>{s.lang === "en" ? "Or explore a complete story" : "Или открой готовую историю"}<ArrowRight size={13}/></button></div>}
      {!blank && <div className={`moment-feedback ${error ? "feedback-error" : working ? "feedback-working" : ""}`} data-testid="moment-feedback">
        {working ? <LoaderCircle size={15} className="spin"/> : error ? <CircleAlert size={15}/> : changed ? <PenIcon/> : <Check size={15}/>}
        <span>{working ? (s.lang === "en" ? "Preparing this scene. Your writing is safe to keep editing." : "Готовим эту сцену. Можно продолжать редактировать.") : error ? (version ? (s.lang === "en" ? "Showing a simpler version. Try again for a better result." : "Показываем упрощённую версию. Попробуй ещё раз.") : (s.lang === "en" ? "This scene could not be prepared. Your writing is still here." : "Не удалось подготовить сцену. Текст сохранён.")) : changed ? (p.current >= 0 ? (s.lang === "en" ? "Changed. Preview again to see the new direction." : "Замысел изменён. Посмотри обновлённую сцену.") : (s.lang === "en" ? "Ready to try. Preview brings just this scene to life." : "Можно пробовать. Покажем только эту сцену.")) : (s.lang === "en" ? "Ready. Refine the action, or add what happens next." : "Готово. Уточни действие или придумай продолжение.")}</span>
        {range && !changed && !working && <small><Clock3 size={11}/>{(range.end - range.start).toFixed(1)}{s.lang === "en" ? "s" : "с"}</small>}
      </div>}
      {!!version?.ruleHits.length && <details className="moment-adjustments"><summary><Sparkles size={13}/>{s.lang === "en" ? "A small adjustment to your direction" : "Немного поправили замысел"}<ChevronDown size={13}/></summary>{version.ruleHits.map((hit, i) => <p key={i}>{hit.kid_message}</p>)}</details>}
      {orderNote && <p className="order-change-note" data-testid="order-change-note">{s.lang === "en" ? "Scene moved. The starting scene has been updated; preview to check the new transition." : "Сцена перемещена. Начальная сцена обновлена; посмотри, как теперь связаны действия."}</p>}
      {(!blank || s.paragraphs.length > 1) && <div className="moment-options"><button onClick={() => setOptions(!options)} aria-expanded={options}>{s.lang === "en" ? "Scene options" : "Действия со сценой"}<ChevronDown size={12}/></button>{options && <div>
        <button data-testid="move-moment-earlier" disabled={index === 0 || working} onClick={() => { moveMoment(p.id, -1); setOrderNote(true); }}><ArrowLeft size={13}/>{s.lang === "en" ? "Move earlier" : "Переместить раньше"}</button>
        <button data-testid="move-moment-later" disabled={!next || working} onClick={() => { moveMoment(p.id, 1); setOrderNote(true); }}><ArrowRight size={13}/>{s.lang === "en" ? "Move later" : "Переместить дальше"}</button>
        <button disabled={p.current <= 0 || working} onClick={() => store.revert(p.id)}><RotateCcw size={13}/>{s.lang === "en" ? "Restore previous version" : "Вернуть прошлую версию"}</button>
        <button data-testid="request-remove-moment" onClick={() => setRemoveOpen(true)}><Trash2 size={13}/>{s.lang === "en" ? "Remove this scene" : "Удалить эту сцену"}</button>
      </div>}</div>}
    </div>
    <footer className="moment-actions">
      <div className="moment-result-row" role="status" data-testid="moment-state">
        <span>{working ? <LoaderCircle size={13} className="spin"/> : error || upstream.length > 0 ? <CircleAlert size={13}/> : ready ? <Check size={13}/> : <Sparkles size={13}/>}{working ? (s.lang === "en" ? "Preparing preview…" : "Готовим просмотр…") : error ? (s.lang === "en" ? "A simpler preview" : "Упрощённая версия") : upstream.length > 0 ? (s.lang === "en" ? "Earlier context changed" : "Начало изменилось") : ready ? (s.lang === "en" ? "Scene ready" : "Сцена готова") : blank ? (s.lang === "en" ? "Start with one action" : "Начни с одного действия") : (s.lang === "en" ? "New direction to preview" : "Новый замысел для просмотра")}</span>
        {ready && !upstream.length && <button aria-expanded={polish} data-testid="polish-moment" onClick={() => setPolish(!polish)}><SlidersHorizontal size={13}/>{s.lang === "en" ? "Fine-tune" : "Настроить"}<ChevronDown size={12}/></button>}
      </div>
      {polish && ready && !upstream.length && <div className="moment-polish-body"><p>{s.lang === "en" ? "Change camera, light, or music. Only this scene replays." : "Измени камеру, свет или музыку. Повторится только эта сцена."}</p><RemixButtons p={p}/></div>}
      {playingThis ? <button className="btn moment-preview" data-testid="moment-pause" onClick={() => playback.pause()}><Pause size={16}/>{s.lang === "en" ? "Pause preview" : "Пауза просмотра"}</button> : <button className={`btn moment-preview ${ready && !upstream.length ? "has-preview" : ""}`} data-testid="preview-moment" disabled={blank || !s.stageReady || working} onClick={preview}>{working ? <LoaderCircle size={16} className="spin"/> : error ? <RotateCcw size={16}/> : <Play size={16} fill="currentColor"/>}{error ? (s.lang === "en" ? "Try this scene again" : "Попробовать ещё раз") : upstream.length ? (s.lang === "en" ? "Preview with earlier changes" : "Смотреть с изменениями") : ready ? (s.lang === "en" ? "Replay this scene" : "Повторить эту сцену") : (s.lang === "en" ? "Preview this scene" : "Посмотреть эту сцену")}</button>}
      <button className={`btn next-moment ${ready ? "next-ready" : ""}`} data-testid="add-next-moment" disabled={blank || working} onClick={addNext}><Plus size={16}/>{s.lang === "en" ? "What happens next?" : "Что будет дальше?"}<ArrowDown size={15}/></button>
      {next && <p className="insert-explanation" data-testid="insert-position">{s.lang === "en" ? `Adds after scene ${index + 1}, before ${index + 2}. Later writing stays.` : `Добавим после сцены ${index + 1}, перед ${index + 2}. Дальнейший текст сохранится.`}</p>}
    </footer>
    <dialog ref={removeDialog} className="replace-story-dialog" data-testid="remove-moment-dialog" aria-labelledby="remove-moment-title" onCancel={() => setRemoveOpen(false)} onClick={e => { if (e.target === e.currentTarget) setRemoveOpen(false); }}>
      <h2 id="remove-moment-title">{s.lang === "en" ? `Remove scene ${index + 1}?` : `Удалить сцену ${index + 1}?`}</h2>
      <p>{s.lang === "en" ? "This removes its writing and preview. All other scenes stay in the story." : "Её текст и предпросмотр будут удалены. Все остальные сцены останутся в истории."}</p>
      <footer><button className="btn" data-testid="keep-moment" onClick={() => setRemoveOpen(false)}>{s.lang === "en" ? "Keep scene" : "Оставить сцену"}</button><button className="btn start-writing" data-testid="remove-moment" onClick={() => { playback.pause(); const adjacent = previous ?? next; setRemoveOpen(false); store.deleteParagraph(p.id); if (adjacent) selectMoment(adjacent.id); else { const id = store.addParagraph(); playback.setScope({ kind: "moment", id }); } }}>{s.lang === "en" ? "Remove scene" : "Удалить сцену"}</button></footer>
    </dialog>
  </aside>;
}
function PenIcon() { return <Sparkles size={15}/>; }
