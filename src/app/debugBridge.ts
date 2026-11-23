import type { AudioDebug, StageStats } from "../engine/api";
import type { RapierReplay } from "../engine/physics/rapierReplay";
import type { Player } from "../engine/player/player";
import type { StageHandleEx } from "../engine/stage";
import { ACTOR_IDS, type ActorId } from "../shared/schema";
import type { StageController } from "./stageController";
import { store } from "./store";

export interface MabearDebugBridge {
  objects: () => unknown;
  physics: () => unknown;
  assets: () => unknown;
  rigs: () => unknown;
  screenOf: (actor: ActorId) => [number, number] | null;
  closeup: (actor: ActorId | null, angle?: number) => void;
  wide: (pos: [number, number, number], look: [number, number, number], fov?: number) => void;
  stats: () => StageStats | null;
  t: () => number;
  playing: () => boolean;
  segments: () => number;
  timeline: () => unknown;
  compiles: () => number;
  freeze: (on: boolean) => void;
  snapshot: () => string | null;
  quality: () => { scale: number; post: number } | null;
}

declare global {
  interface Window {
    __mabear?: MabearDebugBridge;
    __mabearAudio?: AudioDebug;
  }
}

/** Approximate standing heights (m) for screen picking and debug close-ups. */
const HEIGHT: Record<ActorId, number> = {
  masha: 1.0,
  bear: 2.4,
  wolf_a: 2.0,
  wolf_b: 1.95,
  lady_bear: 2.15,
  hare: 0.85,
  rosie: 1.05,
  squirrel: 0.65,
  rival_bear: 2.55,
};

export interface DebugBridgeDeps {
  stage: StageHandleEx;
  player: Player;
  evaluator?: RapierReplay;
  controller: StageController;
  getCanvas: () => HTMLCanvasElement | null;
}

/** Install `window.__mabear` for E2E/diagnostic tools and return a cleanup restoring/removing it on unmount. */
export function installDebugBridge({ stage, player, evaluator, controller, getCanvas }: DebugBridgeDeps): () => void {
  if (typeof window === "undefined") return () => {};
  const previous = window.__mabear;
  const bridge: MabearDebugBridge = {
    objects: () => ({
      state: player.frame?.objects,
      cupboard: stage.set.root.getObjectByName("object:kitchen_cupboard")?.userData.open,
      pantryJar: {
        ...player.frame?.props.pantry_honey,
        worldPosition: stage.props.objects.pantry_honey.position.toArray(),
      },
      carrots: Object.fromEntries(
        Object.entries(player.frame?.props ?? {})
          .filter(([id]) => /^carrot(?:_\d+)?$/.test(id))
          .map(([id, prop]) => [
            id,
            {
              ...prop,
              worldPosition: stage.props.objects[id as keyof typeof stage.props.objects]?.position.toArray(),
            },
          ]),
      ),
      ball: {
        ...player.frame?.props.ball,
        worldPosition: stage.props.objects.ball.position.toArray(),
      },
      masha: player.frame
        ? {
            position: player.frame.actors.masha.pos,
            yaw: player.frame.actors.masha.yaw,
            holding: player.frame.actors.masha.holding,
            verb: player.frame.actors.masha.verb,
            pickup: player.frame.actors.masha.pickup,
          }
        : null,
      panels: ["outside", "inside"].map((side) => {
        const o = stage.set.root.getObjectByName(`object:house_door:${side}`);
        return { side, open: o?.userData.open };
      }),
    }),
    physics: () => evaluator?.inspect(store.getState().timeline, player.time) ?? null,
    assets: () => stage.assets(),
    rigs: () =>
      Object.fromEntries(
        ACTOR_IDS.map((id) => [
          id,
          {
            name: stage.rigs[id].root.name,
            asset: stage.rigs[id].root.userData.asset,
            generated: stage.rigs[id].root.userData.generated,
          },
        ]),
      ),
    screenOf: (actor) => {
      const f = player.frame;
      if (!f) return null;
      const a = f.actors[actor];
      const h = HEIGHT[actor] * (actor === "masha" ? 0.55 : 0.58);
      const v = stage.camera.position.clone().set(a.pos[0], a.pos[1] + h, a.pos[2]).project(stage.camera);
      return [(v.x + 1) / 2, (1 - v.y) / 2];
    },
    closeup: (actor, angle = 0) => controller.closeup(actor, angle),
    wide: (pos, look, fov = 45) => controller.wide(pos, look, fov),
    stats: () => controller.stats(),
    t: () => player.time,
    playing: () => player.isPlaying,
    segments: () => store.getState().timeline.segments.length,
    timeline: () => store.getState().timeline,
    compiles: () => store.compileCount,
    quality: () => ({ scale: stage.resolutionScale(), post: stage.postQuality() }),
    snapshot: () => {
      // render now and read the pixels in the same task (no preserveDrawingBuffer needed, no compositor wait)
      const f = player.frame;
      const canvas = getCanvas();
      if (!f || !canvas) return null;
      stage.render(f);
      return canvas.toDataURL("image/png");
    },
    freeze: (on) => {
      player.frozen = on;
    },
  };

  window.__mabear = bridge;
  return () => {
    if (window.__mabear === bridge) {
      if (previous !== undefined) window.__mabear = previous;
      else delete window.__mabear;
    }
  };
}
