import { useEffect, useRef } from "react";
import { ArrowUpRight, BookOpen, ChefHat, Fish, House, Moon, Sprout, X } from "lucide-react";
import type { FixtureEpisode } from "../../shared/schema";
import { useStore, useStrings } from "../useStore";

export const STORY_STARTERS = [
  { id: "garden_party", Icon: Sprout, mood: { en: "A little garden mischief", ru: "Приключения в огороде" }, description: { en: "Unexpected guests, a missing carrot, and a dance for everyone.", ru: "Нежданные гости, пропавшая морковка и танцы для всех." } },
  { id: "pancake_morning", Icon: ChefHat, mood: { en: "A delicious mess", ru: "Вкусный переполох" }, description: { en: "A quiet breakfast never stays quiet when Masha is around.", ru: "Завтрак не бывает спокойным, когда рядом Маша." } },
  { id: "bears_nap", Icon: Moon, mood: { en: "Sweet dreams… almost", ru: "Сладких снов… почти" }, description: { en: "Bear wants a little peace. Masha has a different idea.", ru: "Мишке хочется тишины. Но у Маши другие планы." } },
  { id: "cozy_evening", Icon: House, mood: { en: "At home with Bear", ru: "В гостях у Мишки" }, description: { en: "From the kitchen to the living room: a little story inside Bear’s house.", ru: "С кухни в гостиную: маленькая история в доме Медведя." } },
  { id: "fishing_trip", Icon: Fish, mood: { en: "Trouble by the water", ru: "Переполох у воды" }, description: { en: "One fishing trip. Plenty of patience. A very curious Masha.", ru: "Одна рыбалка, много терпения и очень любопытная Маша." } },
] as const;

export function StoryLibrary({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (id: FixtureEpisode["id"]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const s = useStore(), t = useStrings();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  return <dialog ref={dialog} className="story-library" aria-labelledby="library-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="library-content">
      <header className="library-heading">
        <div><span className="eyebrow"><BookOpen size={14}/>{t.examples}</span><h2 id="library-title">{s.lang === "en" ? "Every adventure starts somewhere." : "У каждого приключения есть начало."}</h2><p>{s.lang === "en" ? "Pick a story, make it yours, and see what happens." : "Выбери историю, добавь своё — и посмотри, что получится."}</p></div>
        <button className="btn icon" aria-label={s.lang === "en" ? "Close examples" : "Закрыть примеры"} onClick={onClose}><X size={21}/></button>
      </header>
      <div className="library-grid">{STORY_STARTERS.map(({ id, Icon, mood, description }, i) => <button key={id} className={`library-card starter-${id}`} data-testid={`example-${id}`} onClick={() => {
        onChoose(id);
      }}>
        <div className="library-art"><Icon size={62} strokeWidth={1.15}/><span className="library-number">0{i + 1}</span></div>
        <div className="library-card-copy"><span>{mood[s.lang]}</span><h3>{t.fixtures[id]}</h3><p>{description[s.lang]}</p><span className="library-open">{s.lang === "en" ? "Open story" : "Открыть историю"}<ArrowUpRight size={16}/></span></div>
      </button>)}</div>
    </div>
  </dialog>;
}
