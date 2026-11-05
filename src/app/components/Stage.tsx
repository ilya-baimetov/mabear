import { useEffect, useRef, useState } from "react";
import { store } from "../store";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";
import type { StageHandle, AudioEngine } from "../../engine/api";
import type { Player } from "../../engine/player/player";
import type { ActorId } from "../../shared/schema";
import { reactionTimeline } from "../react";

declare global {
  interface Window {
    __mabear?: { screenOf: (actor: ActorId) => [number, number] | null; closeup: (actor: ActorId | null, angle?: number) => void; wide: (pos: [number, number, number], look: [number, number, number], fov?: number) => void; stats: () => { fps: number; drawCalls: number; triangles: number } | null; t: () => number; playing: () => boolean; segments: () => number; timeline: () => unknown; compiles: () => number };
  }
}

/** Approximate standing heights (m) for screen picking and debug close-ups. */
const HEIGHT: Record<ActorId, number> = { masha: 1.0, bear: 2.4, wolf_a: 2.0, wolf_b: 1.95 };

export function Stage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const s = useStore();
  const t = useStrings();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const handles = useRef<{ stage: StageHandle; player: Player; audio: AudioEngine | null; pick: (u: number, v: number) => ActorId | null } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const reactCount = useRef(0);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const [{ createStage }, { Player }, audioMod, { pickActor }] = await Promise.all([
        import("../../engine/stage"),
        import("../../engine/player/player"),
        import("../../engine/audio/index").catch(() => null),
        import("../../engine/pick"),
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
          if (playing !== store.getState().playing) {
            store.setPlayback(playing, time);
            if (!playing) playback.onPlayerStopped(time);
          } else store.setTime(time);
        },
      });
      handles.current = { stage, player, audio, pick: (u, v) => pickActor(stage, u, v) };
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
        screenOf: (actor) => {
          const f = player.frame;
          if (!f) return null;
          const a = f.actors[actor];
          const h = HEIGHT[actor] * (actor === "masha" ? 0.55 : 0.58);
          const v = stage.camera.position.clone().set(a.pos[0], a.pos[1] + h, a.pos[2]).project(stage.camera);
          return [(v.x + 1) / 2, (1 - v.y) / 2];
        },
        closeup: (actor, angle = 0) => {
          if (!actor) {
            player.cameraOverride = null;
            return;
          }
          player.cameraOverride = (f) => {
            const a = f.actors[actor];
            const h = HEIGHT[actor];
            const headY = h * (actor === "masha" ? 0.78 : 0.86);
            const dist = actor === "masha" ? 1.15 : h * 0.96;
            const yaw = a.yaw + angle;
            return {
              pos: [a.pos[0] + Math.sin(yaw) * dist, headY + h * 0.04, a.pos[2] + Math.cos(yaw) * dist],
              look: [a.pos[0], headY, a.pos[2]],
              fov: 35,
            };
          };
        },
        wide: (pos, look, fov = 45) => {
          player.cameraOverride = () => ({ pos, look, fov });
        },
        stats: () => stage.stats(),
        t: () => player.time,
        playing: () => player.isPlaying,
        segments: () => store.getState().timeline.segments.length,
        timeline: () => store.getState().timeline,
        compiles: () => store.compileCount,
      };
      setReady(true);
    })().catch((err) => {
      console.error("stage init failed", err);
      setFailed(true);
    });
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
      <canvas
        ref={canvas}
        data-testid="stage-canvas"
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const h = handles.current;
          const d = down.current;
          down.current = null;
          if (!h || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || h.player.isPlaying) return;
          const r = e.currentTarget.getBoundingClientRect();
          const actor = h.pick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          if (!actor) return;
          void h.audio?.unlock();
          const st = store.getState();
          const rt = reactionTimeline(st, actor, reactCount.current++);
          h.player.setTimeline(rt.timeline, st.lang);
          h.player.play(rt.start, rt.end);
        }}
      />
      {s.waiting && <div className="getting-ready" data-testid="getting-ready">⏳ {t.gettingReady}</div>}
      {ready && !s.playing && !s.waiting && (s.timeline.duration === 0 || s.t >= s.timeline.duration - 0.05) && <div className="tap-hint">👆 {t.tapToReact}</div>}
      {!ready && !failed && <div className="stage-loading">{t.loading}</div>}
      {failed && <div className="stage-error">{t.stageError}</div>}
    </div>
  );
}
