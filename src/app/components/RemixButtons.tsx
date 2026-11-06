import { store, type Paragraph } from "../store";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";
import { revealStage } from "./studioView";
import { TIMES_OF_DAY, type MusicMood, type TimeOfDay } from "../../shared/schema";
import { Camera, Music2, Sun } from "lucide-react";

const MOODS: MusicMood[] = ["playful", "calm", "sleepy", "tense", "spooky", "chase", "triumphant", "sad", "romantic_waltz", "none"];

export function RemixButtons({ p }: { p: Paragraph }) {
  const t = useStrings(), s = useStore();
  const v = p.versions[p.current];
  if (!v) return null;
  const result = s.results[s.segmentIds.indexOf(p.id)];
  const time = v.remix.timeOfDay ?? v.beatScript.time_of_day ?? result?.segment.startState.timeOfDay ?? "day";
  const music = v.remix.musicMood ?? result?.carry.music?.mood ?? v.beatScript.music.mood;
  const replay = () => { revealStage(); setTimeout(() => playback.replaySegment(p.id), 0); };
  return <div className="moment-look-controls" onClick={e => e.stopPropagation()}>
    <label><span><Sun size={13}/>{s.lang === "en" ? "Time of day" : "Время суток"}</span><select data-testid="remix-time" aria-label={t.remix.time} value={time} onChange={e => { store.setRemix(p.id, { timeOfDay: e.target.value as TimeOfDay }); replay(); }}>{TIMES_OF_DAY.map(value => <option key={value} value={value}>{t.timeOfDay[value]}</option>)}</select></label>
    <label><span><Music2 size={13}/>{s.lang === "en" ? "Music mood" : "Настроение музыки"}</span><select data-testid="remix-music" aria-label={t.remix.music} value={music} onChange={e => { store.setRemix(p.id, { musicMood: e.target.value as MusicMood }); replay(); }}>{MOODS.map(value => <option key={value} value={value}>{t.musicMood[value]}</option>)}</select></label>
    <button className="angle-variation" data-testid="remix-camera" aria-label={s.lang === "en" ? "Try another angle" : "Попробовать другой ракурс"} onClick={() => { store.setRemix(p.id, { cameraSeed: v.remix.cameraSeed + 1 }); replay(); }}><Camera size={14}/>{s.lang === "en" ? "Try another angle" : "Попробовать другой ракурс"}</button>
  </div>;
}
