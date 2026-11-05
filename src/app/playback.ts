// Bridges UI buttons to the engine Player (created by the Stage component). No engine imports at module load.
import type { Player } from "../engine/player/player";
import type { AudioEngine } from "../engine/api";
import { store } from "./store";

let player: Player | null = null;
let audio: AudioEngine | null = null;

export const playback = {
  attach(p: Player | null, a: AudioEngine | null) {
    player = p;
    audio = a;
  },
  get player() {
    return player;
  },
  get audio() {
    return audio;
  },
  playAll() {
    void audio?.unlock();
    const s = store.getState();
    player?.play(0);
    store.setPlayback(true, 0);
    if (s.paragraphs[0]) store.select(s.paragraphs[0].id);
  },
  playParagraph(id: string) {
    void audio?.unlock();
    const r = store.segmentRange(id);
    if (!r || !player) return;
    player.play(r.start, r.end);
    store.setPlayback(true, r.start);
  },
  pause() {
    player?.pause();
    store.setPlayback(false);
  },
  seek(t: number) {
    player?.seek(t);
    store.setPlayback(false, t);
  },
};
