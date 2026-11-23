// Rapier replay orchestrator (zero Three.js, zero bearsYard imports).
import RAPIER from '@dimforge/rapier3d-compat';
import type { ActorFrame, FrameState, PlaybackEvaluator, PropFrame } from '../api';
import type { PropId, Timeline, Vec3 } from '../../shared/schema';
import { qslerp } from '../motion/blend';
import { evaluate } from '../player/evaluate';
import { PROP_COLLIDER_PROFILES, type PropColliderProfile } from './propProfiles';
import { MAX_SECONDS, MOVE_VERBS, PHYSICS_DT, rootReason } from './replaySchedule';
import {
  Trajectory,
  type BallTransform,
  type PropTransform,
  type ReplayOptions,
  type Sample,
} from './trajectory';

export type { PlaybackEvaluator, PropColliderProfile, BallTransform, PropTransform, ReplayOptions };
export { PHYSICS_DT, PROP_COLLIDER_PROFILES };

let init: Promise<void> | null = null;
function loadRapier(): Promise<void> {
  return (init ??= RAPIER.init().catch((e) => {
    init = null;
    throw e;
  }));
}

export async function createRapierReplay(options: ReplayOptions = {}): Promise<RapierReplay> {
  await loadRapier();
  return new RapierReplay(options);
}

/** Cache the simulated trajectory, never the render clock. Old samples are read
 * directly; the frontier world only ever advances. Previews share this canonical trajectory. */
export class RapierReplay implements PlaybackEvaluator {
  private warmTimer: ReturnType<typeof setTimeout> | undefined;
  private fingerprint = '';
  private lastRevision: number | undefined;
  private timeline: Timeline = { segments: [], duration: 0 };
  private cache: Trajectory | undefined;
  revision = 0;

  constructor(private options: ReplayOptions) {}

  setTimeline(timeline: Timeline, revision?: number): void {
    if (revision !== undefined && revision === this.lastRevision) return;
    const key = JSON.stringify(timeline);
    if (key === this.fingerprint) {
      if (revision !== undefined) this.lastRevision = revision;
      return;
    }
    this.dispose();
    this.lastRevision = revision;
    this.fingerprint = key;
    this.timeline = structuredClone(timeline);
    this.revision++;
    if (this.options.background) this.warmTimer = setTimeout(() => this.warm(), 0);
  }

  private warm(): void {
    this.warmTimer = undefined;
    const c = this.trajectory();
    if (c.warmingComplete) return;
    const until = performance.now() + 4;
    while (!c.warmingComplete && performance.now() < until) {
      const before = c.samples.at(-1)!.t;
      c.sample(Math.min(this.timeline.duration, before + PHYSICS_DT * 2));
      if (c.warmingComplete || c.samples.at(-1)!.t <= before + 1e-9) return;
    }
    if (!c.warmingComplete) this.warmTimer = setTimeout(() => this.warm(), 16);
  }

  private trajectory(): Trajectory {
    return (this.cache ??= new Trajectory(
      this.timeline,
      this.options,
      this.timeline.duration > MAX_SECONDS ? `trial limit: ${MAX_SECONDS}s` : rootReason(this.timeline),
    ));
  }

  private sample(view: Timeline, t: number): Sample {
    const at = Math.max(0, Math.min(t, view.duration));
    const last = view.segments.at(-1);
    const left =
      view.segments.length < this.timeline.segments.length &&
      at === view.duration &&
      last &&
      Math.abs(last.offset + last.segment.duration - at) < 1e-7;
    return this.trajectory().sample(at, left ? 'left' : 'right');
  }

  evaluate(view: Timeline, t: number): FrameState {
    const s = this.sample(view, t);
    const traj = this.trajectory();
    const frame = traj.continuity && !traj.reason ? traj.frame(view, t) : evaluate(view, t);
    if (s.root) {
      const actor: ActorFrame = { ...frame.actors.masha, pos: s.root, physicsRoot: true };
      // Damp the existing gait as actual motion stops. Do not invent a new pose system.
      if (MOVE_VERBS.has(actor.verb) && s.stride < 0.999) {
        actor.bones = { ...actor.bones };
        for (const name of [
          'Hips',
          'LeftUpLeg',
          'LeftLeg',
          'LeftFoot',
          'LeftToeBase',
          'RightUpLeg',
          'RightLeg',
          'RightFoot',
          'RightToeBase',
        ]) {
          if (actor.bones[name]) actor.bones[name] = qslerp([0, 0, 0, 1], actor.bones[name], s.stride);
        }
        actor.hipsOffset = actor.hipsOffset.map((v) => v * s.stride) as Vec3;
      }
      frame.actors = { ...frame.actors, masha: actor };
    }

    let updatedProps: Record<PropId, PropFrame> | null = null;
    for (const id of Object.keys(s.props) as PropId[]) {
      const sim = s.props[id];
      const cur = frame.props[id];
      if (!sim || !cur.visible) continue;
      // If `t` fell on an exact release timestamp across a multi-segment offset where
      // `(t - offset) - localRelease` rounded down by 1 ULP, `s.props[id]` already owns the release.
      const nearRelease = this.trajectory().releases.some(
        (r) => r.prop === id && Math.abs(t - r.t) < 1e-8,
      );
      if (!cur.attachedTo || nearRelease) {
        if (!updatedProps) updatedProps = { ...frame.props };
        updatedProps[id] = { visible: true, attachedTo: null, pos: sim.pos, rotation: sim.rotation };
      }
    }
    if (updatedProps) frame.props = updatedProps;
    return frame;
  }

  inspect(view: Timeline, t: number) {
    const c = this.trajectory();
    const s = this.sample(view, t);
    return {
      ...s,
      simulatedProps: c.propCount,
      simulatedReleases: c.releases.length,
      activeProps: Object.keys(s.props) as PropId[],
      reason: c.reason,
      steps: c.steps,
      computeMs: c.computeMs,
      samples: c.samples.length,
      caches: 1,
      revision: this.revision,
      continuity: c.continuity,
      routes: c.routes,
      pickups: c.pickups,
      impulses: c.impulses,
    };
  }

  dispose(): void {
    if (this.warmTimer !== undefined) clearTimeout(this.warmTimer);
    this.warmTimer = undefined;
    this.cache?.dispose();
    this.cache = undefined;
    this.fingerprint = '';
    this.lastRevision = undefined;
  }
}
