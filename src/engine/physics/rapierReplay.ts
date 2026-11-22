import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import type { ActorFrame, FrameState, PropFrame, Quat } from '../api';
import {
  ACTOR_IDS,
  MARK_IDS,
  PROP_IDS,
  type ActorClip,
  type ActorId,
  type MarkId,
  type PropId,
  type Timeline,
  type Vec3,
} from '../../shared/schema';
import { MARKS, sceneLocationAt } from '../../shared/bible/set';
import { PROP_REST_HEIGHT } from '../../shared/propPlacement';
import { STYLES } from '../motion/library';
import { evaluate } from '../player/evaluate';
import { qslerp } from '../motion/blend';
import { walkHeightAt } from '../set/bearsYard';
import {
  MASHA_CENTER,
  MASHA_GROUP,
  MASHA_HALF_HEIGHT,
  MASHA_RADIUS,
  PROP_COLLIDER_PROFILES,
  PROP_GROUP,
  SKIN,
  actorBlockerGroup,
  createPropColliderDesc,
  createWorldColliders,
  propGroupExcludingActor,
} from './yardColliders';

export const PHYSICS_DT = 1 / 60;
const MAX_SECONDS = 180;
const THROW_RELEASE_CLEARANCE_S = 0.18;
const MAX_THROW_HORIZ_SPEED = 14;
const UP = new Vector3(0, 1, 0);

const ROOT_VERBS = new Set([
  'idle',
  'walk_to',
  'run_to',
  'tiptoe_to',
  'wave',
  'look_at',
  'point_at',
  'nod',
  'shake_head',
  'shrug',
  'laugh',
  'surprised',
  'sigh',
  'drop',
  'clap',
  'spin',
  'dance',
  'sneeze',
  'cry',
  'sulk',
  'scared',
  'angry_stomp',
  'yawn_stretch',
]);
const MOVE_VERBS = new Set(['walk_to', 'run_to', 'tiptoe_to']);
const MARK_SET = new Set<string>(MARK_IDS);
const ACTOR_SET = new Set<string>(ACTOR_IDS);
const isMark = (s: string | undefined | null): s is MarkId => !!s && MARK_SET.has(s);
const isActor = (s: string | undefined | null): s is ActorId => !!s && ACTOR_SET.has(s);

const ACTOR_CAPSULE: Record<ActorId, { radius: number; halfHeight: number }> = {
  masha: { radius: MASHA_RADIUS, halfHeight: MASHA_HALF_HEIGHT },
  bear: { radius: 0.48, halfHeight: 0.72 },
  lady_bear: { radius: 0.45, halfHeight: 0.625 },
  rival_bear: { radius: 0.5, halfHeight: 0.775 },
  wolf_a: { radius: 0.32, halfHeight: 0.705 },
  wolf_b: { radius: 0.3, halfHeight: 0.665 },
  rosie: { radius: 0.26, halfHeight: 0.265 },
  hare: { radius: 0.2, halfHeight: 0.225 },
  squirrel: { radius: 0.17, halfHeight: 0.155 },
};

export interface BallTransform {
  pos: Vec3;
  rotation: Quat;
}
export type PropTransform = BallTransform;

export interface ReplayOptions {
  /** Main app warms the canonical cache in short tasks; tests can stay synchronous. */
  background?: boolean;
  /** Sample the actual held ball origin from the loaded rig, without rendering. */
  sampleBall?: (frame: FrameState) => BallTransform;
  /** Sample any actor's held prop transform from the loaded rig, without rendering. */
  sampleProp?: (frame: FrameState, actor: ActorId, prop: PropId) => PropTransform;
}

export interface PlaybackEvaluator {
  setTimeline(timeline: Timeline): void;
  evaluate(view: Timeline, t: number): FrameState;
  dispose(): void;
}

interface Sample {
  t: number;
  root: Vec3 | null;
  grounded: boolean;
  stride: number;
  props: Partial<Record<PropId, PropTransform>>;
  propsBefore?: Partial<Record<PropId, PropTransform>>;
  ball: BallTransform | null;
  ballBefore?: BallTransform | null;
  sleeping: boolean;
}

interface PropRelease {
  t: number;
  kind: 'throw' | 'drop';
  actor: ActorId;
  prop: PropId;
  clip: ActorClip;
  offset: number;
}

interface ActivePropBody {
  prop: PropId;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  releaser: ActorId;
  releaseTime: number;
  releaserCleared: boolean;
}

interface ActorBlocker {
  actor: ActorId;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  radius: number;
  halfHeight: number;
  enabled: boolean;
  lastPos: Vec3;
}

let init: Promise<void> | undefined;
export async function createRapierReplay(options: ReplayOptions = {}): Promise<RapierReplay> {
  await (init ??= RAPIER.init());
  return new RapierReplay(options);
}

const tuple = (v: RAPIER.Vector): Vec3 => [v.x, v.y, v.z];
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => a.map((v, i) => v + (b[i] - v) * k) as Vec3;
const yard = (p: number[]) =>
  sceneLocationAt(p[0], p.at(-1)!) === 'yard' && p[0] >= -3 && p[0] <= 5 && p.at(-1)! >= -1 && p.at(-1)! <= 6;

/** Conservative ownership: paired/support choreography keeps its entire timeline for root control.
 * Prop physics (throw / non-re-picked drop) is decoupled and can still run even when rootReason declines. */
function rootReason(timeline: Timeline): string | null {
  if (!timeline.segments.length) return 'empty timeline';
  if (timeline.segments.every(({ segment }) => segment.cast && !segment.cast.includes('masha')))
    return 'Masha is not in this story';
  for (const { segment } of timeline.segments) {
    if (!yard(segment.startState.actors.masha.pos) || segment.startState.actors.masha.posture !== 'stand')
      return 'outside supported standing yard motion';
    if (
      ACTOR_IDS.some((id) =>
        segment.actorClips[id].some(
          (c) =>
            c.verb === 'carry' ||
            c.verb === 'hug' ||
            (id !== 'masha' && c.params.target === 'masha' && !c.params.ambient),
        ),
      )
    )
      return 'paired choreography';
    for (const c of segment.actorClips.masha) {
      if (
        !ROOT_VERBS.has(c.verb) ||
        c.params.sceneCut ||
        (c.params.posture && c.params.posture !== 'stand') ||
        ACTOR_IDS.includes(c.params.target as (typeof ACTOR_IDS)[number])
      )
        return `authored choreography: ${c.verb}`;
      if ([c.params.from, c.params.to, ...(c.params.path ?? [])].some((p) => p && !yard(p)))
        return 'travel outside the trial yard';
    }
  }
  return null;
}

/** Ensure offset + localT is >= localT after subtracting offset in float64 (avoids 1-ULP pre-release evaluate mismatch). */
function adjustSegmentTime(offset: number, localT: number, maxDur: number): number {
  let t = Math.min(maxDur, offset + localT);
  if (offset > 0 && t < maxDur) {
    while (t - offset < localT) t += Number.EPSILON * Math.max(1, Math.abs(t));
  }
  return t;
}

/**
 * Schedule all simulated prop releases (`throw` clips and non-re-picked `drop` clips)
 * across all actors, props, and locations, plus exact handoff breakpoints for simulated props.
 */
function schedulePropTimeline(timeline: Timeline): { releases: PropRelease[]; handoffs: number[]; propCount: number } {
  if (timeline.duration > MAX_SECONDS || !timeline.segments.length) {
    return { releases: [], handoffs: [], propCount: 0 };
  }
  const allClips = timeline.segments
    .flatMap(({ offset, segment }) =>
      ACTOR_IDS.flatMap((actor) =>
        (segment.actorClips[actor] ?? []).map((clip) => ({
          actor,
          clip,
          offset,
          segDuration: segment.duration,
          absStart: offset + clip.start,
        })),
      ),
    )
    .sort((a, b) => a.absStart - b.absStart || ACTOR_IDS.indexOf(a.actor) - ACTOR_IDS.indexOf(b.actor));

  const releases: PropRelease[] = [];
  for (let i = 0; i < allClips.length; i++) {
    const entry = allClips[i];
    const { actor, clip, offset } = entry;
    const prop = clip.params.item;
    if (!prop) continue;
    if (clip.verb === 'throw') {
      const t = adjustSegmentTime(offset, clip.start + clip.dur * 0.4, timeline.duration);
      if (t <= timeline.duration) releases.push({ t, kind: 'throw', actor, prop, clip, offset });
    } else if (clip.verb === 'drop') {
      // Keep drop followed by re-pickup of the same item on animation until pickup retargeting exists.
      let rePicked = false;
      for (let j = i + 1; j < allClips.length; j++) {
        const later = allClips[j].clip;
        if ((later.params.item === prop || later.params.target === prop) && later.verb !== 'idle') {
          rePicked = true;
          break;
        }
      }
      if (!rePicked) {
        const t = adjustSegmentTime(offset, clip.start + clip.dur * 0.5, timeline.duration);
        if (t <= timeline.duration) releases.push({ t, kind: 'drop', actor, prop, clip, offset });
      }
    }
  }
  releases.sort((a, b) => a.t - b.t || ACTOR_IDS.indexOf(a.actor) - ACTOR_IDS.indexOf(b.actor));

  const simulatedProps = new Set(releases.map((r) => r.prop));
  const handoffSet = new Set<number>();
  if (simulatedProps.size > 0) {
    for (const { clip, offset, segDuration } of allClips) {
      const prop = clip.params.item;
      if (!prop || !simulatedProps.has(prop)) continue;
      if (clip.verb === 'take' && !clip.params.putDown) {
        handoffSet.add(adjustSegmentTime(offset, clip.start + clip.dur * 0.5, timeline.duration));
      } else if (clip.verb === 'give') {
        handoffSet.add(adjustSegmentTime(offset, clip.start + clip.dur * 0.6, timeline.duration));
      } else if (clip.verb === 'cook' || clip.verb === 'fish' || clip.verb === 'water_plants') {
        handoffSet.add(adjustSegmentTime(offset, clip.start, timeline.duration));
      } else if (clip.verb === 'throw') {
        handoffSet.add(adjustSegmentTime(offset, clip.start + clip.dur, timeline.duration));
      } else if (clip.verb === 'eat') {
        handoffSet.add(adjustSegmentTime(offset, Math.min(clip.start + clip.dur, segDuration), timeline.duration));
      }
    }
  }
  const handoffs = [...handoffSet].filter((t) => t > 0 && t <= timeline.duration).sort((a, b) => a - b);
  return { releases, handoffs, propCount: simulatedProps.size };
}

function resolveThrowTarget(clip: ActorClip, frame: FrameState, actor: ActorId, releasePos: Vec3): Vec3 {
  const tgt = clip.params.target;
  const look = clip.params.lookAt;
  if (look) {
    let ty = look[1];
    if (isMark(tgt) && Math.abs(look[1] - 0.5) < 1e-4) {
      ty = PROP_REST_HEIGHT[tgt] ?? walkHeightAt(look[0], look[2]);
    } else if (isActor(tgt)) {
      const ta = frame.actors[tgt];
      const lift = ta.physicsRoot ? 0 : walkHeightAt(ta.pos[0], ta.pos[2]);
      ty = Math.max(0.25, ta.pos[1] + lift + STYLES[tgt].height * 0.55);
    }
    return [look[0], ty, look[2]];
  }
  if (isMark(tgt)) {
    const p = MARKS[tgt].pos;
    return [p[0], PROP_REST_HEIGHT[tgt] ?? walkHeightAt(p[0], p[1]), p[1]];
  }
  if (isActor(tgt)) {
    const ta = frame.actors[tgt];
    const lift = ta.physicsRoot ? 0 : walkHeightAt(ta.pos[0], ta.pos[2]);
    return [ta.pos[0], ta.pos[1] + lift + STYLES[tgt].height * 0.55, ta.pos[2]];
  }
  const yaw = frame.actors[actor].yaw;
  const tx = releasePos[0] + Math.sin(yaw) * 2.5;
  const tz = releasePos[2] + Math.cos(yaw) * 2.5;
  return [tx, walkHeightAt(tx, tz), tz];
}

function computeBallisticLaunch(
  centre: Vector3,
  targetBase: Vec3,
  halfHeight: number,
  clipDur: number,
  actorYaw: number,
  prop: PropId,
  linearDamping: number,
): { linvel: { x: number; y: number; z: number }; angvel: { x: number; y: number; z: number } } {
  const T = Math.max(0.18, clipDur * 0.6);
  const dx = targetBase[0] - centre.x;
  const dy = targetBase[1] + halfHeight - centre.y;
  const dz = targetBase[2] - centre.z;
  const d = Math.max(0, linearDamping);
  const effectiveT = d > 1e-4 ? (1 - Math.exp(-d * T)) / d : T;
  let vx = dx / effectiveT;
  let vz = dz / effectiveT;
  const hSpeed = Math.hypot(vx, vz);
  if (hSpeed > MAX_THROW_HORIZ_SPEED) {
    const scale = MAX_THROW_HORIZ_SPEED / hSpeed;
    vx *= scale;
    vz *= scale;
  }
  const gravComp = d > 1e-4 ? (9.81 * (T - effectiveT)) / d : 0.5 * 9.81 * T * T;
  const vy = Math.max(-8, Math.min(12, (dy + gravComp) / effectiveT));

  // Spin perpendicular to horizontal throw direction + light deterministic tumble.
  const dirLen = Math.hypot(dx, dz);
  const ux = dirLen > 1e-4 ? dx / dirLen : Math.sin(actorYaw);
  const uz = dirLen > 1e-4 ? dz / dirLen : Math.cos(actorYaw);
  const propSeed = (PROP_IDS.indexOf(prop) % 5) - 2;
  const spinSpeed = Math.min(10, 3.2 + Math.min(hSpeed, MAX_THROW_HORIZ_SPEED) * 0.85);
  const tumbleRoll = 1.4 + propSeed * 0.35;
  const tumbleYaw = 1.8 - propSeed * 0.25;
  return {
    linvel: { x: vx, y: vy, z: vz },
    angvel: {
      x: uz * spinSpeed + ux * tumbleRoll,
      y: tumbleYaw,
      z: -ux * spinSpeed + uz * tumbleRoll,
    },
  };
}

class Trajectory {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  readonly samples: Sample[] = [];
  readonly releases: PropRelease[];
  readonly handoffs: number[];
  readonly propCount: number;
  private controller: RAPIER.KinematicCharacterController | null = null;
  private masha: RAPIER.RigidBody | null = null;
  private capsule: RAPIER.Collider | null = null;
  private activeProps = new Map<PropId, ActivePropBody>();
  private actorBlockers = new Map<ActorId, ActorBlocker>();
  private previous: FrameState;
  private tick = 0;
  private releaseIndex = 0;
  private handoffIndex = 0;
  private boundaryIndex = 1;
  private verticalSpeed = 0;
  private stride = 1;
  reason: string | null;
  steps = 0;
  computeMs = 0;

  constructor(
    readonly view: Timeline,
    private options: ReplayOptions,
    canonicalReason: string | null,
  ) {
    createWorldColliders(this.world);
    this.world.integrationParameters.numSolverIterations = 8;
    this.world.integrationParameters.maxCcdSubsteps = 4;
    this.reason = canonicalReason;

    const scheduled = schedulePropTimeline(view);
    this.releases = scheduled.releases;
    this.handoffs = scheduled.handoffs;
    this.propCount = scheduled.propCount;

    this.previous = evaluate(view, 0);
    if (!this.reason) {
      const p = this.previous.actors.masha.pos;
      this.masha = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p[0], p[1] + MASHA_CENTER, p[2]),
      );
      this.capsule = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(MASHA_HALF_HEIGHT, MASHA_RADIUS).setCollisionGroups(MASHA_GROUP),
        this.masha,
      );
      this.controller = this.world.createCharacterController(SKIN);
      this.controller.setSlideEnabled(true);
      // Furniture is an obstacle; don't let Masha auto-step onto the bench/table.
      this.controller.disableAutostep();
      this.controller.enableSnapToGround(0.15);
    }

    if (this.releases.length > 0) {
      this.initActorBlockers(this.previous);
    }

    this.world.timestep = PHYSICS_DT;
    this.world.step(); // Populate the broad phase before the first shape cast.
    if (this.capsule && this.masha) {
      let overlap = false;
      this.world.intersectionsWithShape(
        this.masha.translation(),
        this.masha.rotation(),
        this.capsule.shape,
        () => {
          overlap = true;
          return false;
        },
        undefined,
        MASHA_GROUP,
        this.capsule,
      );
      if (overlap) {
        this.reason = 'initial capsule overlaps furniture';
        this.world.removeRigidBody(this.masha);
        this.masha = null;
        this.capsule = null;
      }
    }
    this.samples.push(this.snapshot(0));
  }

  private actorCenterPos(actor: ActorId, frame: FrameState): { enabled: boolean; pos: Vec3 } {
    const a = frame.actors[actor];
    const visible = !frame.cast || frame.cast.includes(actor);
    const enabled = !!a && visible && a.posture !== 'offstage' && a.opacity > 0.05;
    if (!enabled) return { enabled: false, pos: [0, -100, 0] };
    if (actor === 'masha' && this.masha) {
      const mp = this.masha.translation();
      return { enabled: true, pos: [mp.x, mp.y, mp.z] };
    }
    const cap = ACTOR_CAPSULE[actor];
    const baseY = a.physicsRoot ? a.pos[1] : a.pos[1] + walkHeightAt(a.pos[0], a.pos[2]);
    const centerY =
      a.posture === 'sleep'
        ? baseY + cap.radius
        : a.posture === 'sit'
          ? baseY + cap.radius + cap.halfHeight * 0.6
          : baseY + cap.radius + cap.halfHeight + SKIN;
    return { enabled: true, pos: [a.pos[0], centerY, a.pos[2]] };
  }

  private initActorBlockers(frame: FrameState): void {
    for (const actor of ACTOR_IDS) {
      const cap = ACTOR_CAPSULE[actor];
      const { enabled, pos } = this.actorCenterPos(actor, frame);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos[0], pos[1], pos[2]),
      );
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(cap.halfHeight, cap.radius)
          .setCollisionGroups(actorBlockerGroup(actor))
          .setFriction(0.6)
          .setRestitution(0.2),
        body,
      );
      collider.setEnabled(enabled);
      this.actorBlockers.set(actor, {
        actor,
        body,
        collider,
        radius: cap.radius,
        halfHeight: cap.halfHeight,
        enabled,
        lastPos: pos,
      });
    }
  }

  private updateActorBlockers(frame: FrameState): void {
    for (const [actor, blocker] of this.actorBlockers) {
      const { enabled, pos } = this.actorCenterPos(actor, frame);
      if (!enabled) {
        if (blocker.enabled) {
          blocker.collider.setEnabled(false);
          blocker.enabled = false;
        }
        continue;
      }
      const dist = Math.hypot(pos[0] - blocker.lastPos[0], pos[1] - blocker.lastPos[1], pos[2] - blocker.lastPos[2]);
      if (!blocker.enabled || dist > 1.0) {
        blocker.body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
        blocker.collider.setEnabled(true);
      } else {
        blocker.body.setNextKinematicTranslation({ x: pos[0], y: pos[1], z: pos[2] });
      }
      blocker.enabled = true;
      blocker.lastPos = pos;
    }
  }

  private resolvePropTransform(frame: FrameState, actor: ActorId, prop: PropId): PropTransform {
    if (this.options.sampleProp) return this.options.sampleProp(frame, actor, prop);
    if (actor === 'masha' && prop === 'ball' && this.options.sampleBall) return this.options.sampleBall(frame);
    const a = frame.actors[actor];
    const lift = a.physicsRoot ? 0 : walkHeightAt(a.pos[0], a.pos[2]);
    const pf = frame.props[prop];
    let pos: Vec3;
    if (pf?.attachedTo === actor) {
      pos = [pf.pos[0], pf.pos[1] + lift, pf.pos[2]];
    } else {
      const s = STYLES[actor];
      const off = new Vector3(-0.18 * s.height, 0.45 * s.height, 0.22 * s.height).applyAxisAngle(UP, a.yaw);
      pos = [a.pos[0] + off.x, a.pos[1] + lift + off.y, a.pos[2] + off.z];
    }
    const q = new Quaternion().setFromAxisAngle(UP, a.yaw);
    return { pos, rotation: [q.x, q.y, q.z, q.w] };
  }

  private propTransformOf(active: ActivePropBody): PropTransform {
    const q = active.body.rotation();
    const rotation: Quat = [q.x, q.y, q.z, q.w];
    const halfHeight = PROP_COLLIDER_PROFILES[active.prop].halfHeight;
    // Render origin is the prop's base, while the rigid body rotates about its center.
    const origin = new Vector3(...tuple(active.body.translation())).sub(
      new Vector3(0, halfHeight, 0).applyQuaternion(new Quaternion(...rotation)),
    );
    return { pos: origin.toArray() as Vec3, rotation };
  }

  private snapshot(t: number, propsBefore?: Partial<Record<PropId, PropTransform>>): Sample {
    const props: Partial<Record<PropId, PropTransform>> = {};
    let allSleeping = this.activeProps.size > 0;
    for (const [id, active] of this.activeProps) {
      props[id] = this.propTransformOf(active);
      if (!active.body.isSleeping()) allSleeping = false;
    }
    const p = this.masha?.translation();
    return {
      t,
      root: p ? [p.x, p.y - MASHA_CENTER, p.z] : null,
      grounded: this.controller?.computedGrounded() ?? false,
      stride: this.stride,
      props,
      ...(propsBefore && Object.keys(propsBefore).length > 0 ? { propsBefore } : {}),
      ball: props.ball ?? null,
      ...(propsBefore?.ball !== undefined ? { ballBefore: propsBefore.ball } : {}),
      sleeping: allSleeping,
    };
  }

  private step(t: number): void {
    const prior = this.samples.at(-1)!;
    const dt = t - prior.t;
    const frame = evaluate(this.view, t);

    if (this.masha && this.capsule && this.controller) {
      const p = this.masha.translation();
      const a = frame.actors.masha.pos;
      const b = this.previous.actors.masha.pos;
      this.verticalSpeed = Math.max(-20, this.verticalSpeed - 9.81 * dt);
      const wanted = { x: a[0] - b[0], y: this.verticalSpeed * dt, z: a[2] - b[2] };
      this.controller.computeColliderMovement(this.capsule, wanted, undefined, MASHA_GROUP);
      const move = this.controller.computedMovement();
      if (this.controller.computedGrounded()) this.verticalSpeed = 0;
      this.masha.setNextKinematicTranslation({ x: p.x + move.x, y: p.y + move.y, z: p.z + move.z });
      const distance = Math.hypot(wanted.x, wanted.z);
      const ratio = distance > 1e-6 ? Math.min(1, Math.hypot(move.x, move.z) / distance) : 1;
      this.stride += (ratio - this.stride) * Math.min(1, dt * 18);
    }

    if (this.actorBlockers.size > 0) this.updateActorBlockers(frame);

    for (const active of this.activeProps.values()) {
      if (!active.releaserCleared && t >= active.releaseTime + THROW_RELEASE_CLEARANCE_S) {
        const blocker = this.actorBlockers.get(active.releaser);
        let overlapsReleaser = false;
        if (blocker && blocker.enabled) {
          const bp = blocker.body.translation();
          const pp = active.body.translation();
          const profile = PROP_COLLIDER_PROFILES[active.prop];
          const minSepXZ = blocker.radius + profile.radius + 0.04;
          const maxY = blocker.halfHeight + blocker.radius + profile.halfHeight + 0.04;
          if (Math.hypot(pp.x - bp.x, pp.z - bp.z) < minSepXZ && Math.abs(pp.y - bp.y) < maxY) {
            overlapsReleaser = true;
          }
        }
        if (!overlapsReleaser) {
          active.collider.setCollisionGroups(PROP_GROUP);
          active.releaserCleared = true;
        }
      }
    }

    this.world.timestep = Math.min(dt, PHYSICS_DT * 2);
    this.world.step();
    this.steps++;

    // Keep the left side of a boundary for a moment preview that ends before
    // the next scene takes ownership. Full-story playback uses its right side.
    const propsBefore: Partial<Record<PropId, PropTransform>> = {};
    for (const [prop, active] of [...this.activeProps.entries()]) {
      const pf = frame.props[prop];
      const handoff = !!pf.attachedTo || !pf.visible;
      if (handoff) {
        propsBefore[prop] = this.propTransformOf(active);
        this.world.removeRigidBody(active.body);
        this.activeProps.delete(prop);
      }
    }

    while (this.releaseIndex < this.releases.length && this.releases[this.releaseIndex].t <= t + 1e-7) {
      const rel = this.releases[this.releaseIndex++];
      const held = evaluate(this.view, Math.max(0, t - 1e-6));
      const actorFrame = held.actors[rel.actor];
      if (!actorFrame || actorFrame.posture === 'offstage' || actorFrame.opacity <= 0.05) continue;
      const attached = held.props[rel.prop]?.attachedTo;
      if (attached && attached !== rel.actor) continue;

      if (rel.actor === 'masha' && this.masha) {
        const mp = this.masha.translation();
        held.actors.masha = { ...held.actors.masha, pos: [mp.x, mp.y - MASHA_CENTER, mp.z], physicsRoot: true };
      }

      const transform = this.resolvePropTransform(held, rel.actor, rel.prop);
      const profile = PROP_COLLIDER_PROFILES[rel.prop];
      const q = new Quaternion(...transform.rotation);
      const centre = new Vector3(...transform.pos).add(new Vector3(0, profile.halfHeight, 0).applyQuaternion(q));

      const existing = this.activeProps.get(rel.prop);
      if (existing) {
        this.world.removeRigidBody(existing.body);
        this.activeProps.delete(rel.prop);
      }

      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(centre.x, centre.y, centre.z)
          .setRotation(q)
          .setCcdEnabled(true)
          .setLinearDamping(profile.linearDamping)
          .setAngularDamping(profile.angularDamping),
      );
      const collider = this.world.createCollider(
        createPropColliderDesc(rel.prop).setCollisionGroups(propGroupExcludingActor(rel.actor)),
        body,
      );
      if (rel.kind === 'throw') {
        const targetBase = resolveThrowTarget(rel.clip, held, rel.actor, transform.pos);
        const { linvel, angvel } = computeBallisticLaunch(
          centre,
          targetBase,
          profile.halfHeight,
          rel.clip.dur,
          held.actors[rel.actor].yaw,
          rel.prop,
          profile.linearDamping,
        );
        body.setLinvel(linvel, true);
        body.setAngvel(angvel, true);
      }
      this.activeProps.set(rel.prop, {
        prop: rel.prop,
        body,
        collider,
        releaser: rel.actor,
        releaseTime: t,
        releaserCleared: false,
      });
    }

    this.previous = frame;
    this.samples.push(this.snapshot(t, propsBefore));
  }

  sample(time: number, side: 'left' | 'right' = 'right'): Sample {
    const t = Math.max(0, Math.min(time, this.view.duration));
    if (this.reason && this.releases.length === 0) return { ...this.samples[0], t };
    const start = performance.now();
    while (this.samples.at(-1)!.t < t - 1e-9) {
      const last = this.samples.at(-1)!.t;
      while ((this.tick + 1) * PHYSICS_DT <= last + 1e-9) this.tick++;
      while (this.releaseIndex < this.releases.length && this.releases[this.releaseIndex].t <= last + 1e-9)
        this.releaseIndex++;
      while (this.handoffIndex < this.handoffs.length && this.handoffs[this.handoffIndex] <= last + 1e-9)
        this.handoffIndex++;
      while (
        this.boundaryIndex < this.view.segments.length &&
        this.view.segments[this.boundaryIndex].offset <= last + 1e-9
      )
        this.boundaryIndex++;

      const release = this.releases[this.releaseIndex]?.t ?? Infinity;
      const handoff = this.handoffs[this.handoffIndex] ?? Infinity;
      const boundary = this.view.segments[this.boundaryIndex]?.offset ?? Infinity;
      const needSubsteps = !!this.masha || this.activeProps.size > 0;
      const next = Math.min(
        needSubsteps ? (this.tick + 1) * PHYSICS_DT : Infinity,
        release,
        handoff,
        boundary,
        this.view.duration,
      );
      if (next <= last + 1e-9) break;
      this.step(next);
    }
    this.computeMs += performance.now() - start;

    let lo = 0;
    let hi = this.samples.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.samples[mid].t <= t + 1e-9) lo = mid;
      else hi = mid - 1;
    }
    const a = this.samples[lo];
    const b = this.samples[Math.min(lo + 1, this.samples.length - 1)];
    const k = b.t > a.t && Math.abs(t - a.t) > 1e-9 ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;

    const props: Partial<Record<PropId, PropTransform>> = {};
    for (const id of PROP_IDS) {
      const pa = a.props[id];
      const beforeA = a.propsBefore?.[id];
      if (side === 'left' && Math.abs(t - a.t) < 1e-8 && beforeA !== undefined) {
        props[id] = beforeA;
      } else if (pa) {
        const rightProp = b.propsBefore?.[id] ?? b.props[id];
        props[id] = rightProp
          ? { pos: mix(pa.pos, rightProp.pos, k), rotation: qslerp(pa.rotation, rightProp.rotation, k) }
          : pa;
      }
    }

    return {
      ...a,
      t,
      root: a.root && b.root ? mix(a.root, b.root, k) : a.root,
      stride: a.stride + (b.stride - a.stride) * k,
      props,
      ball: props.ball ?? null,
    };
  }

  dispose(): void {
    this.world.free();
  }
}

/** Cache the simulated trajectory, never the render clock. Old samples are read
 * directly; the frontier world only ever advances. Previews share this canonical trajectory. */
export class RapierReplay implements PlaybackEvaluator {
  private warmTimer: ReturnType<typeof setTimeout> | undefined;
  private fingerprint = '';
  private timeline: Timeline = { segments: [], duration: 0 };
  private cache: Trajectory | undefined;
  revision = 0;

  constructor(private options: ReplayOptions) {}

  setTimeline(timeline: Timeline): void {
    const key = JSON.stringify(timeline);
    if (key === this.fingerprint) return;
    this.dispose();
    this.fingerprint = key;
    this.timeline = JSON.parse(key);
    this.revision++;
    if (this.options.background) this.warmTimer = setTimeout(() => this.warm(), 0);
  }

  private warm(): void {
    this.warmTimer = undefined;
    const c = this.trajectory();
    if (c.reason && c.releases.length === 0) return;
    const until = performance.now() + 4;
    while (c.samples.at(-1)!.t < this.timeline.duration && performance.now() < until) {
      c.sample(Math.min(this.timeline.duration, c.samples.at(-1)!.t + PHYSICS_DT * 2));
    }
    if (c.samples.at(-1)!.t < this.timeline.duration) this.warmTimer = setTimeout(() => this.warm(), 16);
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
    const frame = evaluate(view, t);
    const s = this.sample(view, t);
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
    };
  }

  dispose(): void {
    if (this.warmTimer !== undefined) clearTimeout(this.warmTimer);
    this.warmTimer = undefined;
    this.cache?.dispose();
    this.cache = undefined;
  }
}
