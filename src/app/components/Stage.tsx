import { useEffect, useMemo, useRef, useState } from "react";
import { store } from "../store";
import { useStore, useStrings } from "../useStore";
import { playback } from "../playback";
import type { StageHandle, AudioEngine } from "../../engine/api";
import type { Player } from "../../engine/player/player";
import { ACTOR_IDS, type ActorId, type CamKey } from "../../shared/schema";
import { sceneLocationAt } from "../../shared/bible/set";
import { CHARACTERS } from "../../shared/bible/characters";
import { reactionTimeline } from "../react";
import { publishStoryboardFrames } from "../storyboardFrames";
import { storyboardTime } from "../storyboardTime";
import { castCloseup } from "../castCamera";
import { MapPin, Maximize, Hand, LoaderCircle, Trees, ChevronRight, Users } from "lucide-react";

declare global {
  interface Window {
    __mabear?: { objects:()=>unknown; physics: () => unknown; assets: () => unknown; rigs: () => unknown; screenOf: (actor: ActorId) => [number, number] | null; closeup: (actor: ActorId | null, angle?: number) => void; wide: (pos: [number, number, number], look: [number, number, number], fov?: number) => void; stats: () => { fps: number; drawCalls: number; triangles: number } | null; t: () => number; playing: () => boolean; segments: () => number; timeline: () => unknown; compiles: () => number; freeze: (on: boolean) => void; snapshot: () => string | null; quality: () => { scale: number; post: number } | null };
  }
}

import { PORTRAITS } from "./castPortraits";

/** Approximate standing heights (m) for screen picking and debug close-ups. */
const HEIGHT: Record<ActorId, number> = { masha: 1.0, bear: 2.4, wolf_a: 2.0, wolf_b: 1.95, lady_bear: 2.15, hare: .85, rosie: 1.05, squirrel: .65, rival_bear: 2.55 };

export function Stage({ exploring = false }: { exploring?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cast = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const s = useStore();
  const t = useStrings();
  const activeIndex = s.timeline.segments.findIndex(seg => s.t >= seg.offset && s.t < seg.offset + seg.segment.duration);
  const activeMoment = s.paragraphs.findIndex(p => p.id === s.segmentIds[activeIndex]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const handles = useRef<{ stage: StageHandle; player: Player; audio: AudioEngine | null; pick: (u: number, v: number) => ActorId | null } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const reactCount = useRef(0);
  const capturedTimeline = useRef<string | null>(null);
  const storyboardKey = useMemo(() => JSON.stringify(s.timeline), [s.timeline]);
  const [focus, setFocus] = useState<ActorId | null>(null);
  const [location, setLocation] = useState<NonNullable<CamKey["location"]>>("yard");
  const locationRef = useRef(location);
  const placeNames = {
    yard: { en: "Bear’s backyard", ru: "Во дворе у Мишки" },
    house: { en: "Inside Bear’s house", ru: "В доме у Мишки" },
    pond: { en: "The forest pond", ru: "Лесной пруд" },
    wolves: { en: "The wolves’ camp", ru: "Лагерь волков" },
  };
  useEffect(() => { if (s.playing) setFocus(null); }, [s.playing]);
  useEffect(() => {
    setFocus(null);
    playback.reset();
    publishStoryboardFrames({});
    if (handles.current) { handles.current.player.cameraOverride = null; handles.current.player.castOverride = null; }
  }, [s.episodeId]);

  useEffect(() => {
    let disposed = false;
    store.setStageReady(false);
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
      if (disposed) {
        stage.dispose();
        return;
      }
      // Supported stories use physics by default; keep a diagnostic animation control.
      const trial = new URLSearchParams(window.location.search).get('physics') !== 'off';
      let evaluator: import('../../engine/physics/rapierReplay').RapierReplay | undefined;
      if (trial) {
        try {
          await stage.assetsReady;
          const {createStageReplay} = await import('../../engine/physics/stageReplay');
          evaluator = await createStageReplay(stage);
        } catch (error) { console.warn('Physics unavailable; using animation playback.', error); }
        if (disposed) { evaluator?.dispose(); stage.dispose(); return; }
      }
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
        evaluator,
        onFrame: frame => {
          const next = frame.camera.location ?? "yard";
          if (locationRef.current !== next) { locationRef.current = next; setLocation(next); }
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
        objects:()=>({state:player.frame?.objects,cupboard:stage.set.root.getObjectByName('object:kitchen_cupboard')?.userData.open,pantryJar:{...player.frame?.props.pantry_honey,worldPosition:stage.props.objects.pantry_honey.position.toArray()},
          carrots:Object.fromEntries(Object.entries(player.frame?.props??{}).filter(([id])=>/^carrot(?:_\d+)?$/.test(id)).map(([id,prop])=>[id,{...prop,worldPosition:stage.props.objects[id as keyof typeof stage.props.objects]?.position.toArray()}])),
          ball:{...player.frame?.props.ball,worldPosition:stage.props.objects.ball.position.toArray()},
          masha:player.frame?{position:player.frame.actors.masha.pos,yaw:player.frame.actors.masha.yaw,holding:player.frame.actors.masha.holding,verb:player.frame.actors.masha.verb,pickup:player.frame.actors.masha.pickup}:null,
          panels:['outside','inside'].map(side=>{const o=stage.set.root.getObjectByName(`object:house_door:${side}`);return {side,open:o?.userData.open};})}),
        physics:()=>evaluator?.inspect(store.getState().timeline,player.time)??null,
        assets:()=>stage.assets(),
        rigs:()=>Object.fromEntries(ACTOR_IDS.map(id=>[id,{name:stage.rigs[id].root.name,asset:stage.rigs[id].root.userData.asset,generated:stage.rigs[id].root.userData.generated}])),
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
            player.castOverride = null;
            return;
          }
          player.castOverride = [actor];
          player.cameraOverride = (f) => ({ ...castCloseup(stage.rigs[actor], f.actors[actor], angle), location: sceneLocationAt(f.actors[actor].pos[0], f.actors[actor].pos[2]) });
        },
        wide: (pos, look, fov = 45) => {
          player.castOverride = null;
          player.cameraOverride = () => ({ pos, look, fov });
        },
        stats: () => stage.stats(),
        t: () => player.time,
        playing: () => player.isPlaying,
        segments: () => store.getState().timeline.segments.length,
        timeline: () => store.getState().timeline,
        compiles: () => store.compileCount,
        quality: () => {
          const ex = stage as unknown as { resolutionScale?: () => number; postQuality?: () => number };
          return ex.resolutionScale && ex.postQuality ? { scale: ex.resolutionScale(), post: ex.postQuality() } : null;
        },
        snapshot: () => {
          // render now and read the pixels in the same task (no preserveDrawingBuffer needed, no compositor wait)
          const f = player.frame;
          if (!f || !canvas.current) return null;
          stage.render(f);
          return canvas.current.toDataURL("image/png");
        },
        freeze: (on) => {
          player.frozen = on;
        },
      };
      await stage.assetsReady;
      if (!disposed) {setReady(true);store.setStageReady(true);}
    })().catch((err) => {
      if (disposed) return;
      console.error("stage init failed", err);
      setFailed(true);
    });
    return () => {
      disposed = true;
      store.setStageReady(false);
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
  // Capture actual compiled frames in the existing renderer, then restore the monitor in the
  // same task. One frame per animation tick keeps the editor responsive; playback always wins.
  useEffect(() => {
    if (!ready || s.playing || s.waiting || !handles.current || !canvas.current || capturedTimeline.current === storyboardKey) return;
    let cancelled = false, raf = 0, index = 0;
    const frames: Record<string, string> = {};
    const thumb = document.createElement("canvas");
    thumb.width = 256; thumb.height = 144;
    const ctx = thumb.getContext("2d");
    const capture = () => {
      if (cancelled || !handles.current || !canvas.current || !ctx) return;
      const entry = s.timeline.segments[index];
      if (!entry) { capturedTimeline.current = storyboardKey; publishStoryboardFrames(frames); return; }
      const { stage, player } = handles.current;
      const end = entry.offset + entry.segment.duration;
      const bounded = { segments: s.timeline.segments.slice(0, index + 1), duration: end };
      try {
        stage.render(player.evaluateFrame(bounded, entry.offset + storyboardTime(entry.segment)));
        const source = canvas.current;
        const cropWidth = Math.min(source.width, source.height * 16 / 9);
        const cropHeight = Math.min(source.height, source.width * 9 / 16);
        ctx.drawImage(source, (source.width - cropWidth) / 2, (source.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, 256, 144);
        frames[s.segmentIds[index]] = thumb.toDataURL("image/webp", .72);
      } finally {
        if (player.frame) stage.render(player.frame);
      }
      index++;
      raf = requestAnimationFrame(capture);
    };
    raf = requestAnimationFrame(capture);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [s.timeline, s.segmentIds, s.episodeId, s.playing, s.waiting, ready, storyboardKey]);

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
          const request=reactCount.current;
          const playReaction=()=>{
            const current=store.getState();
            if(handles.current!==h||request!==reactCount.current||current.episodeId!==st.episodeId||current.lang!==st.lang||current.timeline!==st.timeline||h.player.isPlaying||!playback.canReact())return;
            h.player.setTimeline(rt.timeline, st.lang);
            h.player.play(rt.start, rt.end);
          };
          if(h.audio?.prepare)void h.audio.prepare(rt.timeline,st.lang,rt.start,rt.end).then(playReaction).catch(()=>{});
          else playReaction();
        }}
      />
      <div className="stage-label"><span><MapPin size={12}/>{s.lang === "en" ? "THE LITTLE FOREST" : "МАЛЕНЬКИЙ ЛЕС"}</span><strong>{focus ? CHARACTERS[focus].name[s.lang] : placeNames[location][s.lang]}</strong></div>
      <button className="fullscreen-btn" title={s.lang === "en" ? "Fullscreen" : "На весь экран"} aria-label={s.lang === "en" ? "Fullscreen" : "На весь экран"} onClick={() => { const el = wrap.current?.closest<HTMLElement>(".stage-col"); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void el?.requestFullscreen?.().catch(() => {}); }}><Maximize size={18}/></button>
      {ready && !s.waiting && <div className="stage-scope"><span className={s.playing ? "scope-live" : ""}/>{s.previewScope?.kind !== "moment" ? (s.lang === "en" ? `Entire story${activeMoment >= 0 ? ` · scene ${activeMoment + 1}` : ""}` : `Просмотр всей истории${activeMoment >= 0 ? ` · сцена ${activeMoment + 1}` : ""}`) : (s.lang === "en" ? `Scene ${Math.max(0, s.paragraphs.findIndex(p => p.id === (s.previewScope?.kind === "moment" ? s.previewScope.id : s.selectedId))) + 1} preview` : `Просмотр сцены ${Math.max(0, s.paragraphs.findIndex(p => p.id === (s.previewScope?.kind === "moment" ? s.previewScope.id : s.selectedId))) + 1}`)}</div>}
      {s.waiting && <div className="getting-ready" data-testid="getting-ready" role="status"><LoaderCircle size={17} className="spin"/> {t.gettingReady}</div>}
      {exploring && ready && !s.playing && !s.waiting && (s.timeline.duration === 0 || s.t >= s.timeline.duration - 0.05) && <div className="tap-hint"><Hand size={14}/> {t.tapToReact}</div>}
      {!ready && !failed && <div className="stage-loading" role="status"><span className="loading-mark"><Trees size={43} strokeWidth={1.2}/></span><strong>{t.loading}</strong><span>{s.lang === "en" ? "A little world is waking up." : "Маленький мир просыпается."}</span><LoaderCircle size={20} className="spin"/></div>}
      {failed && <div className="stage-error">{t.stageError}</div>}
    </div>
    {exploring && <div className="cast-deck">
      <div className="cast-heading"><span><Users size={13}/>{s.lang === "en" ? "THE CAST" : "ГЕРОИ"}</span><small>{s.lang === "en" ? "Use their names in your story" : "Добавь их имена в историю"}</small></div>
      <div className="cast-bar" ref={cast}>
        <button className={`cast-friend cast-world ${!focus ? "selected" : ""}`} aria-pressed={!focus} aria-label={s.lang === "en" ? "Story view" : "История"} onClick={() => { setFocus(null); window.__mabear?.closeup(null); }}><span className="cast-portrait"><Trees size={25} strokeWidth={1.5}/></span><span>{s.lang === "en" ? "Story view" : "История"}</span></button>
        {ACTOR_IDS.map(id => <button key={id} className={`cast-friend ${focus === id ? "selected" : ""}`} aria-pressed={focus === id} aria-label={CHARACTERS[id].name[s.lang]} title={CHARACTERS[id].name[s.lang]} disabled={!ready || s.playing || s.waiting} onClick={() => { setFocus(id); window.__mabear?.closeup(id, .18); }}><span className="cast-portrait"><img src={PORTRAITS[id]} alt="" width={44} height={44} loading="lazy"/></span><span>{CHARACTERS[id].name[s.lang]}</span></button>)}
      </div>
      <button className="cast-next" aria-label={s.lang === "en" ? "More friends" : "Другие герои"} onClick={() => { const row = cast.current; if (row) row.scrollTo({ left: row.scrollLeft + row.clientWidth >= row.scrollWidth - 5 ? 0 : row.scrollLeft + row.clientWidth * .7, behavior: "smooth" }); }}><ChevronRight size={17}/></button>
    </div>}
    </div>
  );
}
