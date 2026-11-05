import { useEffect, useRef, useState } from "react";
import { store } from "../store";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";
import type { StageHandle, AudioEngine } from "../../engine/api";
import type { Player } from "../../engine/player/player";

declare global {
  interface Window {
    __mabear?: { closeup: (actor: "masha" | "bear" | null, angle?: number) => void; stats: () => { fps: number; drawCalls: number; triangles: number } | null; t: () => number; playing: () => boolean; segments: () => number; timeline: () => unknown };
  }
}

export function Stage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const s = useStore();
  const t = useStrings();
  const [ready, setReady] = useState(false);
  const handles = useRef<{ stage: StageHandle; player: Player; audio: AudioEngine | null } | null>(null);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const [{ createStage }, { Player }, audioMod] = await Promise.all([
        import("../../engine/stage"),
        import("../../engine/player/player"),
        import("../../engine/audio/index").catch(() => null),
      ]);
      if (disposed || !canvas.current) return;
      const stage = await createStage(canvas.current);
      let audio: AudioEngine | null = null;
      try {
        audio = audioMod ? audioMod.createAudioEngine() : null;
      } catch {
        audio = null;
      }
      let lastT = -1;
      const player = new Player({
        stage,
        audio,
        onTime: (time, playing) => {
          if (playing && playing === store.getState().playing && Math.abs(time - lastT) < 0.06) return;
          lastT = time;
          if (playing !== store.getState().playing) store.setPlayback(playing, time);
          else store.setTime(time);
        },
      });
      handles.current = { stage, player, audio };
      playback.attach(player, audio);
      const st = store.getState();
      player.setTimeline(st.timeline, st.lang);
      audio?.setVolume(st.volume);
      audio?.setMuted(st.muted);
      const fit = () => {
        const el = wrap.current;
        if (!el) return;
        stage.resize(el.clientWidth, el.clientHeight);
      };
      fit();
      ro = new ResizeObserver(fit);
      if (wrap.current) ro.observe(wrap.current);
      window.__mabear = {
        closeup: (actor, angle = 0) => {
          if (!actor) {
            player.cameraOverride = null;
            return;
          }
          player.cameraOverride = (f) => {
            const a = f.actors[actor];
            const h = actor === "masha" ? 1.0 : 2.4;
            const headY = h * (actor === "masha" ? 0.78 : 0.86);
            const dist = actor === "masha" ? 1.15 : 2.3;
            const yaw = a.yaw + angle;
            return {
              pos: [a.pos[0] + Math.sin(yaw) * dist, headY + h * 0.04, a.pos[2] + Math.cos(yaw) * dist],
              look: [a.pos[0], headY, a.pos[2]],
              fov: 35,
            };
          };
        },
        stats: () => stage.stats(),
        t: () => player.time,
        playing: () => player.isPlaying,
        segments: () => store.getState().timeline.segments.length,
        timeline: () => store.getState().timeline,
      };
      setReady(true);
    })().catch((err) => console.error("stage init failed", err));
    return () => {
      disposed = true;
      ro?.disconnect();
      handles.current?.player.dispose();
      handles.current?.stage.dispose();
      handles.current?.audio?.dispose();
      playback.attach(null, null);
      handles.current = null;
    };
  }, []);

  useEffect(() => {
    handles.current?.player.setTimeline(s.timeline, s.lang);
  }, [s.timeline, s.lang, ready]);
  useEffect(() => {
    handles.current?.audio?.setVolume(s.volume);
    handles.current?.audio?.setMuted(s.muted);
  }, [s.volume, s.muted, ready]);

  return (
    <div className="stage-wrap" ref={wrap} data-testid="stage">
      <canvas ref={canvas} data-testid="stage-canvas" />
      {!ready && <div className="stage-loading">{t.loading}</div>}
    </div>
  );
}
