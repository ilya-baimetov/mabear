import { store, type Paragraph } from "../store";
import { STRINGS } from "../i18n";
import { shallowEqual, useStoreSelector } from "../useStore";
import { playback } from "../playback";
import { revealStage } from "./studioView";
import { DEFAULT_REMIX, MUSIC_MOODS, TIMES_OF_DAY, type MusicMood, type TimeOfDay } from "../../shared/schema";
import { Camera, Music2, RotateCcw, Sun } from "lucide-react";

const MOODS: readonly MusicMood[] = [...MUSIC_MOODS.filter((m) => m !== "none"), "none"];

export function RemixButtons({ p }: { p: Paragraph }) {
  const s = useStoreSelector(
    (st) => ({ lang: st.lang, results: st.results, segmentIds: st.segmentIds }),
    shallowEqual,
  );
  const t = STRINGS[s.lang];
  const v = p.versions[p.current];
  if (!v) return null;
  const result = s.results[s.segmentIds.indexOf(p.id)];
  const time = v.remix.timeOfDay ?? v.beatScript.time_of_day ?? result?.segment.startState.timeOfDay ?? "day";
  const music = v.remix.musicMood ?? result?.carry.music?.mood ?? v.beatScript.music.mood;
  const isDefaultRemix = v.remix.timeOfDay === null && v.remix.musicMood === null && v.remix.cameraSeed === 0;
  const replay = () => {
    if (!store.getState().stageReady) return;
    revealStage();
    setTimeout(() => playback.replaySegment(p.id), 0);
  };
  return <div className="moment-look-controls" onClick={e => e.stopPropagation()}>
    <label><span><Sun size={13} aria-hidden="true"/>{s.lang === "en" ? "Time of day" : "Время суток"}</span><select data-testid="remix-time" aria-label={s.lang === "en" ? "Time of day" : "Время суток"} value={time} onChange={e => { store.setRemix(p.id, { timeOfDay: e.target.value as TimeOfDay }); replay(); }}>{TIMES_OF_DAY.map(value => <option key={value} value={value}>{t.timeOfDay[value]}</option>)}</select></label>
    <label><span><Music2 size={13} aria-hidden="true"/>{s.lang === "en" ? "Music mood" : "Настроение музыки"}</span><select data-testid="remix-music" aria-label={s.lang === "en" ? "Music mood" : "Настроение музыки"} value={music} onChange={e => { store.setRemix(p.id, { musicMood: e.target.value as MusicMood }); replay(); }}>{MOODS.map(value => <option key={value} value={value}>{t.musicMood[value]}</option>)}</select></label>
    <button type="button" className="angle-variation" data-testid="remix-camera" onClick={() => { store.setRemix(p.id, { cameraSeed: v.remix.cameraSeed + 1 }); replay(); }}>
      <Camera size={14} aria-hidden="true"/>
      <span>{s.lang === "en" ? "Try another angle" : "Попробовать другой ракурс"}</span>
      <span className="angle-badge">{s.lang === "en" ? `Angle ${v.remix.cameraSeed + 1}` : `Ракурс ${v.remix.cameraSeed + 1}`}</span>
    </button>
    <button type="button" className="angle-variation remix-reset" data-testid="remix-reset" disabled={isDefaultRemix} onClick={() => { store.setRemix(p.id, { ...DEFAULT_REMIX }); replay(); }}>
      <RotateCcw size={14} aria-hidden="true"/>
      <span>{s.lang === "en" ? "Reset look" : "Сбросить настройки"}</span>
    </button>
  </div>;
}
