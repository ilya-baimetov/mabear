import { store, type Paragraph } from "../store";
import { useStrings } from "../useStore";
import { playback } from "../playback";
import { TIMES_OF_DAY, type MusicMood, type TimeOfDay } from "../../shared/schema";
import { Camera, Music2, Sun, Sunrise, Sunset, Moon } from "lucide-react";

const MOODS: MusicMood[] = ["playful", "calm", "sleepy", "tense", "spooky", "chase", "triumphant", "sad", "romantic_waltz", "none"];
const TOD_ICON = { morning: Sunrise, day: Sun, sunset: Sunset, night: Moon };

export function RemixButtons({ p }: { p: Paragraph }) {
  const t = useStrings();
  const v = p.versions[p.current];
  if (!v) return null;
  const tod = v.remix.timeOfDay ?? v.beatScript.time_of_day ?? null;
  const replay = () => setTimeout(() => playback.replaySegment(p.id), 0);
  const TimeIcon = TOD_ICON[(tod ?? "day") as TimeOfDay];
  return (
    <div className="remix" onClick={(e) => e.stopPropagation()}>
      <button className="rbtn" data-testid="remix-camera" title={t.remix.camera} aria-label={t.remix.camera} onClick={() => { store.setRemix(p.id, { cameraSeed: v.remix.cameraSeed + 1 }); replay(); }}><Camera size={16}/></button>
      <button
        className="rbtn"
        data-testid="remix-time"
        title={t.remix.time}
        onClick={() => {
          const i = tod ? TIMES_OF_DAY.indexOf(tod) : 1;
          store.setRemix(p.id, { timeOfDay: TIMES_OF_DAY[(i + 1) % TIMES_OF_DAY.length] });
          replay();
        }}
      >
        <TimeIcon size={16}/>
      </button>
      <button
        className="rbtn"
        data-testid="remix-music"
        title={`${t.remix.music}${v.remix.musicMood ? `: ${t.musicMood[v.remix.musicMood]}` : ""}`}
        onClick={() => {
          const cur = v.remix.musicMood ?? v.beatScript.music.mood;
          const i = MOODS.indexOf(cur);
          store.setRemix(p.id, { musicMood: MOODS[(i + 1) % MOODS.length] });
          replay();
        }}
      >
        <Music2 size={16}/>
      </button>
    </div>
  );
}
