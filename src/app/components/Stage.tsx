import { useEffect, useMemo, useRef, useState } from "react";
import { store } from "../store";
import { shallowEqual, useStoreSelector } from "../useStore";
import { STRINGS } from "../i18n";
import { playback } from "../playback";
import { getStageController, registerStageController, type StageController } from "../stageController";
import { installDebugBridge } from "../debugBridge";
import type { AudioEngine } from "../../engine/api";
import type { RapierReplay } from "../../engine/physics/rapierReplay";
import type { Player } from "../../engine/player/player";
import type { StageHandleEx } from "../../engine/stage";
import { ACTOR_IDS, type ActorId, type CamKey, type DialogueCue } from "../../shared/schema";
import { SCENE_LOCATION_NAMES, sceneLocationAt } from "../../shared/bible/set";
import { CHARACTERS } from "../../shared/bible/characters";
import { reactionTimeline } from "../react";
import { publishStoryboardFrames } from "../storyboardFrames";
import { storyboardTime } from "../storyboardTime";
import { castCloseup } from "../castCamera";
import { MapPin, Maximize, Minimize, Hand, LoaderCircle, Trees, ChevronRight, Users, VolumeX } from "lucide-react";

import { PORTRAITS } from "./castPortraits";

export function Stage({ exploring = false }: { exploring?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cast = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const s = useStoreSelector((st) => {
    const activeIndex = st.timeline.segments.findIndex(
      (seg) => st.t >= seg.offset && st.t < seg.offset + seg.segment.duration,
    );
    let activeCue: DialogueCue | null = null;
    if (st.captions && !st.waiting) {
      for (const seg of st.timeline.segments) {
        const cue = seg.segment.dialogue.find((c) => {
          const start = seg.offset + c.start;
          return st.t >= start && st.t <= start + c.dur && c.text.trim().length > 0;
        });
        if (cue) {
          activeCue = cue;
          break;
        }
      }
    }
    const atEnd = st.timeline.duration === 0 || st.t >= st.timeline.duration - 0.05;
    return {
      lang: st.lang,
      episodeId: st.episodeId,
      timeline: st.timeline,
      timelineRevision: st.timelineRevision,
      segmentIds: st.segmentIds,
      paragraphs: st.paragraphs,
      selectedId: st.selectedId,
      previewScope: st.previewScope,
      playing: st.playing,
      waiting: st.waiting,
      preparingVoice: st.preparingVoice,
      volume: st.volume,
      muted: st.muted,
      activeIndex,
      activeCue,
      atEnd,
    };
  }, shallowEqual);
  const t = STRINGS[s.lang];
  const activeMoment = s.paragraphs.findIndex((p) => p.id === s.segmentIds[s.activeIndex]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const handles = useRef<{ stage: StageHandleEx; player: Player; audio: AudioEngine | null; pick: (u: number, v: number) => ActorId | null } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const reactCount = useRef(0);
  const capturedRevision = useRef<string | null>(null);
  const captureKey = `${s.episodeId}:${s.timelineRevision}`;
  const [focus, setFocus] = useState<ActorId | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [location, setLocation] = useState<NonNullable<CamKey["location"]>>("yard");
  const locationRef = useRef(location);

  useEffect(() => {
    const sync = () => {
      const stageCol = wrap.current?.closest(".stage-col") ?? null;
      setIsFullscreen(Boolean(stageCol && document.fullscreenElement === stageCol));
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const activeCue = ready ? s.activeCue : null;

  const waitingLabel = useMemo(() => {
    if (s.preparingVoice) {
      return s.lang === "en" ? "Preparing Masha’s voice…" : "Готовим голос Маши…";
    }
    const scope = s.previewScope;
    const scopeEnd =
      scope?.kind === "moment"
        ? s.paragraphs.findIndex((p) => p.id === scope.id)
        : s.paragraphs.length - 1;
    const scoped =
      scopeEnd >= 0
        ? s.paragraphs.slice(0, scopeEnd + 1).filter((p) => p.text.trim().length > 0)
        : [];
    const pendingCount = scoped.filter(
      (p) => p.pendingVersion !== null || p.status === "directing" || store.isRedirectQueued(p.id),
    ).length;
    if (pendingCount > 0 && scoped.length > 0) {
      const doneCount = scoped.filter(
        (p) =>
          p.pendingVersion === null &&
          p.status !== "directing" &&
          !store.isRedirectQueued(p.id) &&
          p.status !== "draft",
      ).length;
      const current = Math.min(scoped.length, doneCount + 1);
      if (scoped.length > 1) {
        return s.lang === "en"
          ? `Directing scene ${current} of ${scoped.length}…`
          : `Готовим сцену ${current} из ${scoped.length}…`;
      }
      return s.lang === "en" ? "Directing scene 1 of 1…" : "Готовим сцену 1 из 1…";
    }
    return t.gettingReady;
  }, [s.preparingVoice, s.previewScope, s.paragraphs, s.lang, t.gettingReady]);

  useEffect(() => {
    if (s.playing) setFocus(null);
  }, [s.playing]);

  useEffect(() => {
    setFocus(null);
    playback.reset();
    publishStoryboardFrames({});
    getStageController()?.resetRemixCamera();
  }, [s.episodeId]);

  useEffect(() => {
    let disposed = false;
    store.setStageReady(false);
    let ro: ResizeObserver | null = null;
    let stage: StageHandleEx | null = null;
    let evaluator: RapierReplay | undefined;
    let audio: AudioEngine | null = null;
    let player: Player | null = null;
    let unregisterController: (() => void) | null = null;
    let uninstallBridge: (() => void) | null = null;

    const cleanupResources = () => {
      ro?.disconnect();
      ro = null;
      unregisterController?.();
      unregisterController = null;
      uninstallBridge?.();
      uninstallBridge = null;
      playback.attach(null, null);
      if (player) {
        player.dispose();
        player = null;
      } else {
        evaluator?.dispose();
      }
      evaluator = undefined;
      if (audio) {
        audio.dispose();
        audio = null;
      }
      if (stage) {
        stage.dispose();
        stage = null;
      }
      handles.current = null;
    };

    (async () => {
      try {
        // Supported stories use physics by default; keep a diagnostic animation control.
        const trial = new URLSearchParams(window.location.search).get("physics") !== "off";
        const stageReplayPromise = trial ? import("../../engine/physics/stageReplay") : null;
        stageReplayPromise?.catch(() => {});
        const [{ createStage }, { Player }, audioMod, { pickActor }] = await Promise.all([
          import("../../engine/stage"),
          import("../../engine/player/player"),
          import("../../engine/audio/index").catch(() => null),
          import("../../engine/pick"),
        ]);
        if (disposed || !canvas.current) return;
        stage = await createStage(canvas.current);
        if (disposed) {
          cleanupResources();
          return;
        }
        if (stageReplayPromise) {
          try {
            const [, { createStageReplay }] = await Promise.all([stage.assetsReady, stageReplayPromise]);
            if (disposed) {
              cleanupResources();
              return;
            }
            evaluator = await createStageReplay(stage);
          } catch (error) {
            console.warn("Physics unavailable; using animation playback.", error);
          }
          if (disposed) {
            cleanupResources();
            return;
          }
        }
        try {
          audio = audioMod ? audioMod.createAudioEngine() : null;
        } catch {
          audio = null;
        }
        let lastT = -1;
        const createdStage = stage;
        player = new Player({
          stage: createdStage,
          audio,
          evaluator,
          onFrame: (frame) => {
            const next = frame.camera.location ?? "yard";
            if (locationRef.current !== next) {
              locationRef.current = next;
              setLocation(next);
            }
          },
          onTime: (time, playing) => {
            if (playing && playing === store.getState().playing && Math.abs(time - lastT) < 0.06) return;
            lastT = time;
            if (playing !== store.getState().playing) {
              store.setPlayback(playing, time);
              if (!playing) playback.onPlayerStopped(time);
            } else store.setTime(time);
          },
        });
        const createdPlayer = player;
        handles.current = {
          stage: createdStage,
          player: createdPlayer,
          audio,
          pick: (u, v) => pickActor(createdStage, u, v),
        };
        playback.attach(createdPlayer, audio);
        const st = store.getState();
        createdPlayer.setTimeline(st.timeline, st.lang);
        audio?.setVolume(st.volume);
        audio?.setMuted(st.muted);
        const fit = () => {
          const el = wrap.current;
          if (!el) return;
          createdStage.resize(el.clientWidth, el.clientHeight);
        };
        fit();
        ro = new ResizeObserver(fit);
        if (wrap.current) ro.observe(wrap.current);

        const controller: StageController = {
          closeup: (actor, angle = 0) => {
            if (!actor) {
              createdPlayer.cameraOverride = null;
              createdPlayer.castOverride = null;
              return;
            }
            createdPlayer.castOverride = [actor];
            createdPlayer.cameraOverride = (f) => ({
              ...castCloseup(createdStage.rigs[actor], f.actors[actor], angle),
              location: sceneLocationAt(f.actors[actor].pos[0], f.actors[actor].pos[2]),
            });
          },
          wide: (pos, look, fov = 45) => {
            createdPlayer.castOverride = null;
            createdPlayer.cameraOverride = () => ({ pos, look, fov });
          },
          stats: () => createdStage.stats(),
          resetRemixCamera: () => {
            createdPlayer.cameraOverride = null;
            createdPlayer.castOverride = null;
          },
        };
        unregisterController = registerStageController(controller);
        uninstallBridge = installDebugBridge({
          stage: createdStage,
          player: createdPlayer,
          evaluator,
          controller,
          getCanvas: () => canvas.current,
        });

        await createdStage.assetsReady;
        if (disposed) {
          cleanupResources();
          return;
        }
        setReady(true);
        store.setStageReady(true);
      } catch (err) {
        cleanupResources();
        if (disposed) return;
        console.error("stage init failed", err);
        setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      store.setStageReady(false);
      cleanupResources();
    };
  }, []);

  useEffect(() => {
    handles.current?.player.setTimeline(s.timeline, s.lang);
  }, [s.timeline, s.lang, ready]);

  // Capture actual compiled frames in the existing renderer, then restore the monitor in the
  // same task. One frame per animation tick keeps the editor responsive; playback always wins.
  useEffect(() => {
    if (!ready || s.playing || s.waiting || !handles.current || !canvas.current || capturedRevision.current === captureKey) return;
    let cancelled = false;
    let raf = 0;
    let index = 0;
    const frames: Record<string, string> = {};
    const thumb = document.createElement("canvas");
    thumb.width = 256;
    thumb.height = 144;
    const ctx = thumb.getContext("2d");
    const capture = () => {
      if (cancelled || !handles.current || !canvas.current || !ctx) return;
      const entry = s.timeline.segments[index];
      if (!entry) {
        capturedRevision.current = captureKey;
        publishStoryboardFrames(frames);
        return;
      }
      const { stage, player } = handles.current;
      const end = entry.offset + entry.segment.duration;
      const bounded = { segments: s.timeline.segments.slice(0, index + 1), duration: end };
      try {
        stage.render(player.evaluateFrame(bounded, entry.offset + storyboardTime(entry.segment)));
        const source = canvas.current;
        const cropWidth = Math.min(source.width, (source.height * 16) / 9);
        const cropHeight = Math.min(source.height, (source.width * 9) / 16);
        ctx.drawImage(
          source,
          (source.width - cropWidth) / 2,
          (source.height - cropHeight) / 2,
          cropWidth,
          cropHeight,
          0,
          0,
          256,
          144,
        );
        frames[s.segmentIds[index]] = thumb.toDataURL("image/webp", 0.72);
      } finally {
        if (player.frame) stage.render(player.frame);
      }
      index++;
      raf = requestAnimationFrame(capture);
    };
    raf = requestAnimationFrame(capture);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [s.timeline, s.segmentIds, s.episodeId, s.timelineRevision, s.playing, s.waiting, ready, captureKey]);

  useEffect(() => {
    handles.current?.audio?.setVolume(s.volume);
    handles.current?.audio?.setMuted(s.muted);
  }, [s.volume, s.muted, ready]);

  return (
    <div className="stage-presentation">
      <div className="stage-wrap" ref={wrap} data-testid="stage">
        <canvas
          ref={canvas}
          data-testid="stage-canvas"
          role="img"
          aria-label={s.lang === "en" ? "Masha and Bear 3D stage" : "3D-сцена с Машей и Медведем"}
          onPointerDown={(e) => {
            down.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const h = handles.current;
            const d = down.current;
            down.current = null;
            if (!exploring || !h || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || h.player.isPlaying || !playback.canReact()) return;
            const r = e.currentTarget.getBoundingClientRect();
            const actor = h.pick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            if (!actor) return;
            void h.audio?.unlock();
            const st = store.getState();
            const rt = reactionTimeline(st, actor, reactCount.current++);
            const request = reactCount.current;
            const playReaction = () => {
              const current = store.getState();
              if (
                handles.current !== h ||
                request !== reactCount.current ||
                current.episodeId !== st.episodeId ||
                current.lang !== st.lang ||
                current.timeline !== st.timeline ||
                h.player.isPlaying ||
                !playback.canReact()
              ) {
                return;
              }
              h.player.setTimeline(rt.timeline, st.lang);
              h.player.play(rt.start, rt.end);
            };
            if (h.audio?.prepare) void h.audio.prepare(rt.timeline, st.lang, rt.start, rt.end).then(playReaction).catch(() => {});
            else playReaction();
          }}
        />
        <div className="stage-label">
          <span>
            <MapPin size={12} aria-hidden="true" />
            {s.lang === "en" ? "THE LITTLE FOREST" : "МАЛЕНЬКИЙ ЛЕС"}
          </span>
          <strong>{focus ? CHARACTERS[focus].name[s.lang] : SCENE_LOCATION_NAMES[location][s.lang]}</strong>
        </div>
        <button
          type="button"
          className="fullscreen-btn"
          title={
            isFullscreen
              ? s.lang === "en"
                ? "Exit fullscreen (F)"
                : "Выйти из полноэкранного режима (F)"
              : s.lang === "en"
                ? "Fullscreen (F)"
                : "На весь экран (F)"
          }
          aria-label={s.lang === "en" ? "Fullscreen" : "На весь экран"}
          aria-pressed={isFullscreen}
          onClick={() => {
            const el = wrap.current?.closest<HTMLElement>(".stage-col");
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            else void el?.requestFullscreen?.().catch(() => {});
          }}
        >
          {isFullscreen ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}
        </button>
        {ready && !s.waiting && s.playing && (s.muted || s.volume === 0) && (
          <button
            type="button"
            className="stage-muted-pill"
            onClick={() => {
              void playback.audio?.unlock();
              store.setMuted(false);
              if (store.getState().volume === 0) store.setVolume(0.8);
            }}
          >
            <VolumeX size={14} aria-hidden="true" />
            <span>{s.lang === "en" ? "Muted — tap for sound" : "Без звука — нажми"}</span>
          </button>
        )}
        {ready && !s.waiting && (
          <div className="stage-scope">
            <span className={s.playing ? "scope-live" : ""} />
            {s.previewScope?.kind !== "moment"
              ? s.lang === "en"
                ? `Entire story${activeMoment >= 0 ? ` · scene ${activeMoment + 1}` : ""}`
                : `Просмотр всей истории${activeMoment >= 0 ? ` · сцена ${activeMoment + 1}` : ""}`
              : s.lang === "en"
                ? `Scene ${Math.max(0, s.paragraphs.findIndex((p) => p.id === (s.previewScope?.kind === "moment" ? s.previewScope.id : s.selectedId))) + 1} preview`
                : `Просмотр сцены ${Math.max(0, s.paragraphs.findIndex((p) => p.id === (s.previewScope?.kind === "moment" ? s.previewScope.id : s.selectedId))) + 1}`}
          </div>
        )}
        <div className="stage-caption-region" aria-live="polite" aria-atomic="true">
          {activeCue && (
            <div className="stage-caption" data-testid="stage-caption">
              <img className="stage-caption-avatar" src={PORTRAITS[activeCue.actor]} alt="" aria-hidden="true" />
              <strong>{CHARACTERS[activeCue.actor].name[s.lang]}</strong>
              <span>{activeCue.text}</span>
            </div>
          )}
        </div>
        {s.waiting && (
          <div className="getting-ready" data-testid="getting-ready" role="status">
            <LoaderCircle size={17} className="spin" aria-hidden="true" /> {waitingLabel}
          </div>
        )}
        {exploring && ready && !s.playing && !s.waiting && s.atEnd && (
          <div className="tap-hint">
            <Hand size={14} aria-hidden="true" /> {t.tapToReact}
          </div>
        )}
        {!ready && !failed && (
          <div className="stage-loading" role="status">
            <span className="loading-mark" aria-hidden="true">
              <Trees size={43} strokeWidth={1.2} />
            </span>
            <strong>{t.loading}</strong>
            <span>{s.lang === "en" ? "Masha and Bear are getting the forest ready for you!" : "Маша и Мишка уже готовят лесную полянку!"}</span>
            <progress className="stage-progress" aria-label={t.loading} />
            <LoaderCircle size={20} className="spin" aria-hidden="true" />
          </div>
        )}
        {failed && (
          <div className="stage-error" role="alert">
            <p>{t.stageError}</p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              {s.lang === "en" ? "Try again" : "Попробовать снова"}
            </button>
          </div>
        )}
      </div>
      {exploring && (
        <div className="cast-deck">
          <div className="cast-heading">
            <span>
              <Users size={13} aria-hidden="true" />
              {s.lang === "en" ? "THE CAST" : "ГЕРОИ"}
            </span>
            <small>{s.lang === "en" ? "Use their names in your story" : "Добавь их имена в историю"}</small>
          </div>
          <div className="cast-bar" ref={cast}>
            <button
              type="button"
              className={`cast-friend cast-world ${!focus ? "selected" : ""}`}
              aria-pressed={!focus}
              aria-label={s.lang === "en" ? "Story view" : "История"}
              onClick={() => {
                setFocus(null);
                getStageController()?.closeup(null);
              }}
            >
              <span className="cast-portrait">
                <Trees size={25} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span>{s.lang === "en" ? "Story view" : "История"}</span>
            </button>
            {ACTOR_IDS.map((id) => (
              <button
                type="button"
                key={id}
                className={`cast-friend ${focus === id ? "selected" : ""}`}
                aria-pressed={focus === id}
                aria-label={CHARACTERS[id].name[s.lang]}
                title={CHARACTERS[id].name[s.lang]}
                disabled={!ready || s.playing || s.waiting}
                onClick={() => {
                  setFocus(id);
                  getStageController()?.closeup(id, 0.18);
                }}
              >
                <span className="cast-portrait">
                  <img src={PORTRAITS[id]} alt="" width={44} height={44} loading="lazy" />
                </span>
                <span>{CHARACTERS[id].name[s.lang]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cast-next"
            aria-label={s.lang === "en" ? "More friends" : "Другие герои"}
            onClick={() => {
              const row = cast.current;
              if (row)
                row.scrollTo({
                  left: row.scrollLeft + row.clientWidth >= row.scrollWidth - 5 ? 0 : row.scrollLeft + row.clientWidth * 0.7,
                  behavior: "smooth",
                });
            }}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
