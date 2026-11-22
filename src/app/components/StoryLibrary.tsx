import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpRight, BookOpen, ChefHat, Fish, House, Moon, Sprout, X } from "lucide-react";
import type { ActorId, FixtureEpisode } from "../../shared/schema";
import { getFixture } from "../../director/fixtures";
import { sceneCount } from "../i18n";
import { useStore, useStrings } from "../useStore";
import { PORTRAITS } from "./castPortraits";

function isOutsideDialog(e: ReactPointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

export const STORY_STARTERS = [
  { id: "garden_party", Icon: Sprout, mood: { en: "A little garden mischief", ru: "Приключения в огороде" }, description: { en: "Unexpected guests, a missing carrot, and a dance for everyone.", ru: "Нежданные гости, пропавшая морковка и танцы для всех." } },
  { id: "pancake_morning", Icon: ChefHat, mood: { en: "A delicious mess", ru: "Вкусный переполох" }, description: { en: "A quiet breakfast never stays quiet when Masha is around.", ru: "Завтрак не бывает спокойным, когда рядом Маша." } },
  { id: "bears_nap", Icon: Moon, mood: { en: "Sweet dreams… almost", ru: "Сладких снов… почти" }, description: { en: "Bear wants a little peace. Masha has a different idea.", ru: "Мишке хочется тишины. Но у Маши другие планы." } },
  { id: "cozy_evening", Icon: House, mood: { en: "At home with Bear", ru: "В гостях у Мишки" }, description: { en: "From the kitchen to the living room: a little story inside Bear’s house.", ru: "С кухни в гостиную: маленькая история в доме Медведя." } },
  { id: "fishing_trip", Icon: Fish, mood: { en: "Trouble by the water", ru: "Переполох у воды" }, description: { en: "One fishing trip. Plenty of patience. A very curious Masha.", ru: "Одна рыбалка, много терпения и очень любопытная Маша." } },
] as const;

export function StoryLibrary({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (id: FixtureEpisode["id"]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const outsideDownRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const notifiedCloseRef = useRef(false);
  const s = useStore(), t = useStrings();

  const dismiss = () => {
    if (!openRef.current || notifiedCloseRef.current) return;
    notifiedCloseRef.current = true;
    onClose();
  };

  useEffect(() => {
    if (open) {
      notifiedCloseRef.current = false;
      outsideDownRef.current = false;
      if (!dialog.current?.open) dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current?.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="story-library"
      aria-labelledby="library-title"
      {...({ closedby: "any" } as Record<string, unknown>)}
      onCancel={dismiss}
      onClose={dismiss}
      onPointerDown={e => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        outsideDownRef.current = isOutsideDialog(e, e.currentTarget);
      }}
      onPointerUp={e => {
        const wasOutside = outsideDownRef.current;
        outsideDownRef.current = false;
        if (wasOutside && isOutsideDialog(e, e.currentTarget)) dismiss();
      }}
    >
      <div className="dialog-surface library-content">
        <header className="library-heading">
          <div>
            <span className="eyebrow"><BookOpen size={14} aria-hidden="true"/>{t.examples}</span>
            <h2 id="library-title">{s.lang === "en" ? "Every adventure starts somewhere." : "У каждого приключения есть начало."}</h2>
            <p>{s.lang === "en" ? "Pick a story, make it yours, and see what happens." : "Выбери историю, добавь своё — и посмотри, что получится."}</p>
          </div>
          <button type="button" className="btn icon" aria-label={s.lang === "en" ? "Close examples" : "Закрыть примеры"} onClick={dismiss}>
            <X size={21} aria-hidden="true"/>
          </button>
        </header>
        <div className="library-grid">
          {STORY_STARTERS.map(({ id, Icon, mood, description }, i) => {
            const fx = getFixture(id, s.lang) ?? getFixture(id, "en");
            const actors: ActorId[] = fx
              ? [...new Set(fx.paragraphs.flatMap(p => p.beatScript.beats.map(b => b.actor)))]
              : [];
            return (
              <button
                type="button"
                key={id}
                className={`library-card starter-${id}`}
                data-testid={`example-${id}`}
                onClick={() => onChoose(id)}
              >
                <div className="library-art">
                  <Icon size={62} strokeWidth={1.15} aria-hidden="true"/>
                  <span className="library-number">0{i + 1}</span>
                </div>
                <div className="library-card-copy">
                  <span>{mood[s.lang]}</span>
                  <h3>{t.fixtures[id]}</h3>
                  <p>{description[s.lang]}</p>
                  <div className="library-card-meta">
                    {fx && <span className="library-scenes-pill">{sceneCount(fx.paragraphs.length, s.lang)}</span>}
                    {actors.length > 0 && (
                      <div className="library-cast" aria-hidden="true">
                        {actors.map(actorId => (
                          <img key={actorId} src={PORTRAITS[actorId]} alt="" aria-hidden="true" />
                        ))}
                      </div>
                    )}
                    {s.fixtureId === id && (
                      <span className="library-current-pill" style={{ position: "static" }}>
                        {s.lang === "en" ? "Open now" : "Открыта"}
                      </span>
                    )}
                  </div>
                  <span className="library-open">
                    {s.lang === "en" ? "Open story" : "Открыть историю"}
                    <ArrowUpRight size={16} aria-hidden="true"/>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
