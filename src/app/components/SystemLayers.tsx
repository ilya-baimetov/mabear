// Honesty legend (spec §2): renders the §0 layer table with Live / Stand-in / Placeholder tags.
import type { Lang } from "../../shared/schema";
import { STRINGS } from "../i18n";
import { useStoreSelector } from "../useStore";

type Tag = "Live" | "Stand-in" | "Placeholder";

interface LayerRow {
  layer: Record<Lang, string>;
  production: Record<Lang, string>;
  prototype: Record<Lang, string>;
  tag: Tag;
}

const TAG_LABELS: Record<Tag, Record<Lang, string>> = {
  Live: { en: "Live", ru: "Работает" },
  "Stand-in": { en: "Stand-in", ru: "Замена" },
  Placeholder: { en: "Placeholder", ru: "Макет" },
};

const LAYER_ROWS: LayerRow[] = [
  {
    layer: { en: "Text → staging plan", ru: "Текст → план сцены" },
    production: {
      en: "Model trained on Animaccord scripts aligned with episode timelines, plus the character bible (the writers' implicit knowledge, made explicit and partly derivable from the footage)",
      ru: "Модель, обученная на сценариях Animaccord с привязкой к таймлайнам серий, и библия персонажей",
    },
    prototype: {
      en: "Claude + a written character bible (prompt) → a validated beat script",
      ru: "Claude + текстовая библия персонажей (промпт) → проверенный бит-скрипт",
    },
    tag: "Stand-in",
  },
  {
    layer: { en: "Plan → body motion", ru: "План → движения тела" },
    production: {
      en: "Learned text-to-motion trained on episode character animation",
      ru: "Модель «текст → движение», обученная на анимации серий",
    },
    prototype: {
      en: "Open motion-capture/animation clip libraries retargeted onto the rigs, plus procedural layers",
      ru: "Открытые библиотеки мокап-анимаций на наших ригах + процедурные слои",
    },
    tag: "Stand-in",
  },
  {
    layer: { en: "Faces, lip-sync, exclamations", ru: "Лица, мимика и липсинк" },
    production: {
      en: "Learned from episode facial animation and audio",
      ru: "Модель, обученная на лицевой анимации и звуке из серий",
    },
    prototype: {
      en: "Procedural face rig: emotions, blinks, visemes from text",
      ru: "Процедурный риг лица: эмоции, моргание и артикуляция по тексту",
    },
    tag: "Stand-in",
  },
  {
    layer: { en: "Characters, sets, props", ru: "Герои, локации и реквизит" },
    production: {
      en: "Animaccord's existing production 3D sources",
      ru: "Оригинальные производственные 3D-модели Animaccord",
    },
    prototype: {
      en: "Stand-in models built in code, as close to the originals as possible",
      ru: "Стенд-ин 3D-модели, максимально близкие к оригиналу",
    },
    tag: "Stand-in",
  },
  {
    layer: { en: "Voice, music, SFX", ru: "Голос, музыка и эффекты" },
    production: {
      en: "Studio voices, score, SFX library",
      ru: "Студийная озвучка, музыкальная партитура и библиотека эффектов",
    },
    prototype: {
      en: STRINGS.en.bts.layerVoice,
      ru: STRINGS.ru.bts.layerVoice,
    },
    tag: "Stand-in",
  },
  {
    layer: { en: "Rendering", ru: "Рендеринг" },
    production: {
      en: "Real-time 3D on the user's device",
      ru: "3D в реальном времени на устройстве зрителя",
    },
    prototype: {
      en: "Same, live",
      ru: "То же самое, вживую",
    },
    tag: "Live",
  },
  {
    layer: { en: "Canon and safety", ru: "Канон и безопасность" },
    production: {
      en: "Studio rulebook + review of public posts",
      ru: "Правила студии + проверка публикаций",
    },
    prototype: {
      en: "Live: prompt + deterministic validator",
      ru: "Работает: правила в промпте + детерминированный валидатор",
    },
    tag: "Live",
  },
];

export function SystemLayers() {
  const lang = useStoreSelector((st) => st.lang);
  const t = STRINGS[lang];
  return (
    <section className="bts-sec" data-testid="system-layers">
      <h3>{t.bts.layers}</h3>
      <table className="layers">
        <thead>
          <tr>
            <th scope="col">{t.bts.layer}</th>
            <th scope="col">{t.bts.production}</th>
            <th scope="col">{t.bts.prototype}</th>
            <th scope="col"><span className="visually-hidden">{lang === "en" ? "Status" : "Статус"}</span></th>
          </tr>
        </thead>
        <tbody>
          {LAYER_ROWS.map((row) => (
            <tr key={row.layer.en}>
              <td>{row.layer[lang]}</td>
              <td>{row.production[lang]}</td>
              <td>{row.prototype[lang]}</td>
              <td>
                <span className={`tag tag-${row.tag.replace(/\W/g, "").toLowerCase()}`}>
                  {TAG_LABELS[row.tag][lang]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        {lang === "en"
          ? "In production, the text→plan and plan→motion layers are one model trained on Animaccord's episode archive. Here they are approximated by Claude + a character bible and by open motion libraries."
          : "В продакшне слои «текст → план» и «план → движение» объединяются в одну модель на архиве серий Animaccord. Здесь их заменяют Claude + библия персонажей и открытые библиотеки движений."}
      </p>
    </section>
  );
}
