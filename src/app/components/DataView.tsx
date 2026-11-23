// Read-only data view of a paragraph's compiled timeline as tracks (spec §4.4, D8).
import { useMemo } from "react";
import { CHARACTERS } from "../../shared/bible/characters";
import { ACTOR_IDS, type ActorId, type Lang, type Segment, type Shot, type Verb } from "../../shared/schema";
import { STRINGS } from "../i18n";
import { playback } from "../playback";
import { shallowEqual, useStoreSelector } from "../useStore";

interface Block {
  start: number;
  dur: number;
  label: string;
  tick?: boolean;
}

export interface TrackRow {
  id: string;
  name: string;
  color: string;
  blocks: Block[];
}

const TRACK_COLORS: Record<string, string> = {
  masha: "#B52668",
  bear: "#6E4228",
  wolf_a: "#46525C",
  wolf_b: "#59646E",
  lady_bear: "#8C4968",
  hare: "#4E6A38",
  rosie: "#A64463",
  squirrel: "#8F4F24",
  rival_bear: "#4C4A7A",
  camera: "#246985",
  dialogue: "#8E5B08",
  vocals: "#A8431D",
  foley: "#4C5C3D",
  sfx: "#64469E",
  ambience: "#1E7360",
  music: "#36752B",
  light: "#756111",
  objects: "#5A4E73",
};

const TRACK_LABELS: Record<string, { en: string; ru: string }> = {
  camera: { en: "Camera", ru: "Камера" },
  dialogue: { en: "Dialogue", ru: "Речь" },
  vocals: { en: "Vocals", ru: "Возгласы" },
  foley: { en: "Foley", ru: "Шумы" },
  sfx: { en: "SFX", ru: "Эффекты" },
  ambience: { en: "Ambience", ru: "Атмосфера" },
  music: { en: "Music", ru: "Музыка" },
  light: { en: "Light", ru: "Свет" },
  objects: { en: "Props / Doors", ru: "Двери и шкаф" },
};

const SHOT_LABELS: Record<Shot, { en: string; ru: string }> = {
  auto: { en: "auto", ru: "авто" },
  wide: { en: "wide", ru: "общий" },
  medium: { en: "medium", ru: "средний" },
  close: { en: "close", ru: "крупный" },
  low_angle: { en: "low angle", ru: "снизу" },
  over_shoulder: { en: "over shoulder", ru: "из-за плеча" },
  tracking: { en: "tracking", ru: "следящая" },
};

const INTENSITY_LABELS: Record<"soft" | "medium" | "full", { en: string; ru: string }> = {
  soft: { en: "soft", ru: "тихо" },
  medium: { en: "medium", ru: "средне" },
  full: { en: "full", ru: "громко" },
};

function activeActorsOf(seg: Segment): ActorId[] {
  const active = ACTOR_IDS.filter(
    (id) =>
      seg.cast?.includes(id)
      || (seg.actorClips[id] ?? []).some((c) => !c.params.ambient || c.verb !== "idle")
      || seg.dialogue.some((d) => d.actor === id)
      || seg.emotes.some((e) => e.actor === id),
  );
  return active.length > 0 ? active : ["masha", "bear"];
}

export function tracksOf(seg: Segment, lang: Lang = "en"): TrackRow[] {
  const d = seg.duration;
  const strings = STRINGS[lang];
  const verbLabel = (verb: Verb) => strings.verbs[verb] ?? verb;

  const actorTracks: TrackRow[] = activeActorsOf(seg).map((id) => ({
    id: `actor-${id}`,
    name: CHARACTERS[id].name[lang],
    color: TRACK_COLORS[id],
    blocks: (seg.actorClips[id] ?? []).map((c) => ({
      start: c.start,
      dur: c.dur,
      label: verbLabel(c.verb),
    })),
  }));

  return [
    ...actorTracks,
    {
      id: "camera",
      name: TRACK_LABELS.camera[lang],
      color: TRACK_COLORS.camera,
      blocks: seg.camera.map((c) => ({ start: c.start, dur: c.dur, label: SHOT_LABELS[c.shot]?.[lang] ?? c.shot })),
    },
    {
      id: "dialogue",
      name: TRACK_LABELS.dialogue[lang],
      color: TRACK_COLORS.dialogue,
      blocks: seg.dialogue.map((c) => ({ start: c.start, dur: c.dur, label: `${CHARACTERS[c.actor].name[lang]}: ${c.text}` })),
    },
    {
      id: "vocals",
      name: TRACK_LABELS.vocals[lang],
      color: TRACK_COLORS.vocals,
      blocks: seg.emotes.map((c) => ({ start: c.start, dur: Math.max(0.3, c.dur), label: `${CHARACTERS[c.actor].name[lang]}: ${c.emote}` })),
    },
    {
      id: "foley",
      name: TRACK_LABELS.foley[lang],
      color: TRACK_COLORS.foley,
      blocks: seg.foley.map((c) => ({ start: c.start, dur: 0.08, label: `${c.id} (${c.surface})`, tick: true })),
    },
    {
      id: "sfx",
      name: TRACK_LABELS.sfx[lang],
      color: TRACK_COLORS.sfx,
      blocks: seg.sfx.map((c) => ({ start: c.start, dur: 0.4, label: c.id })),
    },
    {
      id: "ambience",
      name: TRACK_LABELS.ambience[lang],
      color: TRACK_COLORS.ambience,
      blocks: seg.ambience.map((c, i, a) => ({
        start: c.start,
        dur: (a[i + 1]?.start ?? d) - c.start,
        label: c.layers.map((l) => strings.ambience[l] ?? l).join(" + ") || (lang === "en" ? "silence" : "тишина"),
      })),
    },
    {
      id: "music",
      name: TRACK_LABELS.music[lang],
      color: TRACK_COLORS.music,
      blocks: seg.music.map((c, i, a) => ({
        start: c.start,
        dur: (a[i + 1]?.start ?? d) - c.start,
        label: `${strings.musicMood[c.mood] ?? c.mood} · ${INTENSITY_LABELS[c.intensity][lang]}`,
      })),
    },
    {
      id: "light",
      name: TRACK_LABELS.light[lang],
      color: TRACK_COLORS.light,
      blocks: seg.lighting.map((c, i, a) => ({
        start: c.start,
        dur: (a[i + 1]?.start ?? d) - c.start,
        label: strings.timeOfDay[c.timeOfDay] ?? c.timeOfDay,
      })),
    },
    {
      id: "objects",
      name: TRACK_LABELS.objects[lang],
      color: TRACK_COLORS.objects,
      blocks: (seg.objectCues ?? []).map((c) => ({
        start: c.start,
        dur: c.dur,
        label: c.object === "house_door"
          ? (lang === "en" ? "House door" : "Дверь дома")
          : (lang === "en" ? "Kitchen cupboard" : "Шкаф на кухне"),
      })),
    },
  ];
}

export function DataView({ segment }: { segment: Segment }) {
  const s = useStoreSelector(
    (st) => ({ lang: st.lang, timeline: st.timeline, t: st.t }),
    shallowEqual,
  );
  const t = STRINGS[s.lang];
  const d = Math.max(segment.duration, 0.1);
  const tracks = useMemo(() => tracksOf(segment, s.lang), [segment, s.lang]);
  const tlSeg = s.timeline.segments.find((x) => x.segment === segment || x.segment.paragraphId === segment.paragraphId);
  const segOffset = tlSeg?.offset ?? 0;
  const segDuration = tlSeg?.segment.duration ?? segment.duration;
  const playheadVisible = Boolean(tlSeg && segDuration > 0 && s.t >= segOffset && s.t <= segOffset + segDuration);
  const playheadPct = playheadVisible ? Math.max(0, Math.min(100, ((s.t - segOffset) / segDuration) * 100)) : null;

  return (
    <section className="bts-sec" data-testid="data-view">
      <h3>{t.bts.dataView}</h3>
      <p className="label-moat">{t.bts.dataViewLabel}</p>
      <div
        className="tracks"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 88px) minmax(0, 1fr)", gap: "6px", alignItems: "start" }}
      >
        <div className="track-names" style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {tracks.map((tr) => (
            <div
              className="track-name"
              key={tr.id}
              title={tr.name}
              style={{ height: "18px", lineHeight: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {tr.name}
            </div>
          ))}
        </div>
        <div className="track-bars" style={{ position: "relative", display: "flex", flexDirection: "column", gap: "3px" }}>
          {tracks.map((tr) => (
            <div className="track-lane" key={tr.id}>
              {tr.blocks.map((b, i) => (
                <button
                  type="button"
                  key={i}
                  className={`blk track-item ${b.tick ? "tick" : ""}`}
                  title={`${b.label} @ ${b.start.toFixed(2)}${t.seconds}`}
                  aria-label={`${tr.name}: ${b.label} @ ${b.start.toFixed(2)}${t.seconds}`}
                  style={{
                    left: `${(b.start / d) * 100}%`,
                    width: b.tick ? "2px" : `${Math.max(0.5, (b.dur / d) * 100)}%`,
                    background: tr.color,
                    fontSize: "10px",
                    lineHeight: "16px",
                    textAlign: "left",
                  }}
                  onClick={() => playback.seek(segOffset + b.start)}
                >
                  {!b.tick && <span>{b.label}</span>}
                </button>
              ))}
            </div>
          ))}
          {playheadPct !== null && (
            <div className="data-playhead" style={{ left: `${playheadPct}%` }} aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  );
}
