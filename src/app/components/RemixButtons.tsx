import { store, type Paragraph } from "../store";
import { useStrings } from "../useStore";
import { playback } from "../playback";
import { TIMES_OF_DAY, type MusicMood, type TimeOfDay } from "../../shared/schema";

const MOODS: MusicMood[] = ["playful", "calm", "sleepy", "tense", "spooky", "chase", "triumphant", "sad", "romantic_waltz", "none"];
const TOD_ICON: Record<TimeOfDay, string> = { morning: "🌅", day: "☀️", sunset: "🌇", night: "🌙" };

export function RemixButtons({ p }: { p: Paragraph }) {
  const t = useStrings();
  const v = p.versions[p.current];
  if (!v) return null;
  const tod = v.remix.timeOfDay ?? v.beatScript.time_of_day ?? null;
  const replay = () => setTimeout(() => playback.playParagraph(p.id), 0);
  return (
    <div className="remix" onClick={(e) => e.stopPropagation()}>
      <button className="rbtn" data-testid="remix-camera" title={t.remix.camera} onClick={() => { store.setRemix(p.id, { cameraSeed: v.remix.cameraSeed + 1 }); replay(); }}>🎥</button>
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
        {TOD_ICON[(tod ?? "day") as TimeOfDay]}
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
        🎵
      </button>
    </div>
  );
}
