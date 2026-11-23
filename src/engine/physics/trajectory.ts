// Deterministic Rapier trajectory simulation for character root control and ballistic props (zero Three.js).
import RAPIER from '@dimforge/rapier3d-compat';
import { MARKS } from '../../shared/bible/set';
import { PROP_REST_HEIGHT } from '../../shared/propPlacement';
import {
  ACTOR_IDS,
  PROP_IDS,
  type ActorClip,
  type ActorId,
  type PropId,
  type Timeline,
  type Vec2,
  type Vec3,
} from '../../shared/schema';
import { walkHeightAt } from '../../shared/yardLayout';
import type { FrameState, Quat } from '../api';
import { qaxis, qrot, qslerp } from '../motion/blend';
import { STYLES } from '../motion/library';
import { evaluate } from '../player/evaluate';
import {
  ACTOR_CAPSULE,
  BALL_GROUP,
  BALL_RADIUS,
  MASHA_CENTER,
  MASHA_GROUP,
  MASHA_HALF_HEIGHT,
  MASHA_RADIUS,
  PROP_COLLIDER_PROFILES,
  PROP_GROUP,
  SKIN,
  actorBlockerGroup,
  createPropColliderDesc,
  propGroupExcludingActor,
} from './propProfiles';
import {
  MAX_CONTINUITY_SECONDS,
  MOVE_VERBS,
  PHYSICS_DT,
  canSimulateBallContinuity,
  isActor,
  isMark,
  schedulePropTimeline,
  type PropRelease,
} from './replaySchedule';
import { createWorldColliders } from './yardColliders';
import { ballApproach, planYardRoute, yardPointClear, yardRouteLength } from './yardNavigation';

const THROW_RELEASE_CLEARANCE_S = 0.18;
const MAX_THROW_HORIZ_SPEED = 14;
const BENCH_TOP = 0.47;
const DEFAULT_BENCH_IMPULSE: Vec3 = [-0.66, 0, 0];
const UP: Vec3 = [0, 1, 0];

/** Pure-math ball support point (bottom of sphere) from its rendered base transform. */
function ballSupport(b: BallTransform): Vec3 {
  const offset = qrot(b.rotation, [0, BALL_RADIUS, 0]);
  return [b.pos[0] + offset[0], b.pos[1] + offset[1] - BALL_RADIUS, b.pos[2] + offset[2]];
}

/** Pure-math Quaternion → Euler YXZ (matching THREE.Euler.setFromQuaternion(q, 'YXZ')). */
function quatToEulerYXZ(q: Quat): Vec3 {
  const [x, y, z, w] = q;
  const m13 = 2 * (x * z + w * y);
  const m23 = 2 * (y * z - w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const m21 = 2 * (x * y + w * z);
  const m22 = 1 - 2 * (x * x + z * z);
  const ex = Math.asin(-Math.max(-1, Math.min(1, m23)));
  if (Math.abs(m23) < 0.9999999) {
    return [ex, Math.atan2(m13, m33), Math.atan2(m21, m22)];
  }
  const m31 = 2 * (x * z - w * y);
  const m11 = 1 - 2 * (y * y + z * z);
  return [ex, Math.atan2(-m31, m11), 0];
}

/** Pure-math Euler YXZ → Quaternion [x, y, z, w]. */
function eulerYXZToQuat(rx: number, ry: number, rz: number): Quat {
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

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

export interface Sample {
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

const tuple = (v: RAPIER.Vector): Vec3 => [v.x, v.y, v.z];
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => a.map((v, i) => v + (b[i] - v) * k) as Vec3;

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
  centre: Vec3,
  targetBase: Vec3,
  halfHeight: number,
  clipDur: number,
  actorYaw: number,
  prop: PropId,
  linearDamping: number,
): { linvel: { x: number; y: number; z: number }; angvel: { x: number; y: number; z: number } } {
  const T = Math.max(0.18, clipDur * 0.6);
  const dx = targetBase[0] - centre[0];
  const dy = targetBase[1] + halfHeight - centre[1];
  const dz = targetBase[2] - centre[2];
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

export interface BallImpulse {
  time: number;
  position: Vec3;
  impulse: Vec3;
}

export class Trajectory {
  readonly view: Timeline;
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private readonly ground: RAPIER.Collider;
  readonly samples: Sample[] = [];
  readonly releases: PropRelease[];
  readonly handoffs: number[];
  readonly propCount: number;
  private controller: RAPIER.KinematicCharacterController | null = null;
  private masha: RAPIER.RigidBody | null = null;
  private capsule: RAPIER.Collider | null = null;
  private activeProps = new Map<PropId, ActivePropBody>();
  private actorBlockers = new Map<ActorId, ActorBlocker>();
  private ballFromBench = false;
  private groundResistance = false;
  private previous!: FrameState;
  private tick = 0;
  private releaseIndex = 0;
  private handoffIndex = 0;
  private boundaryIndex = 1;
  private verticalSpeed = 0;
  private stride = 1;
  readonly continuity: boolean;
  readonly routes: { start: number; path: Vec2[]; target: string | null }[] = [];
  readonly pickups: { start: number; attach: number; position: Vec3 }[] = [];
  readonly impulses: BallImpulse[] = [];
  private nudges: { t: number; impulse: Vec3 }[] = [];
  private nudgeIndex = 0;
  private actions: { t: number; clip: ActorClip; segmentIndex: number }[] = [];
  private actionIndex = 0;
  private prepared = false;
  private preparing = false;
  private failure: string | null = null;
  private preparedSegment = -1;
  reason: string | null;
  steps = 0;
  computeMs = 0;

  constructor(
    source: Timeline,
    private options: ReplayOptions,
    canonicalReason: string | null,
  ) {
    try {
      const view = (this.view = structuredClone(source));
      this.ground = createWorldColliders(this.world);
      this.world.integrationParameters.numSolverIterations = 8;
      this.world.integrationParameters.maxCcdSubsteps = 4;
      this.reason = canonicalReason;

      let released = false;
      const requested = view.segments
        .flatMap(({ offset, segment }) => segment.actorClips.masha.map((clip) => ({ clip, t: offset + clip.start })))
        .sort((a, b) => a.t - b.t)
        .some(({ clip: c }) => {
          if (c.params.item === 'ball' && (c.verb === 'put_down' || c.verb === 'nudge')) return true;
          if (c.verb === 'drop' && c.params.item === 'ball') released = true;
          return released && c.verb === 'take' && c.params.item === 'ball';
        });
      const compatible = canSimulateBallContinuity(view);
      if (requested && !compatible && !this.reason) this.reason = 'unsupported ball choreography';
      if (requested && view.duration > MAX_CONTINUITY_SECONDS && !this.reason) {
        this.reason = `continuity preparation limit: ${MAX_CONTINUITY_SECONDS}s`;
      }
      this.continuity = !this.reason && requested;
      this.actions = this.continuity
        ? view.segments
            .flatMap(({ offset, segment }, segmentIndex) =>
              segment.actorClips.masha.map((clip) => ({ t: offset + clip.start, clip, segmentIndex })),
            )
            .sort((a, b) => a.t - b.t)
        : [];

      const scheduled = schedulePropTimeline(view, this.continuity);
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

      if (this.releases.length > 0 && !this.continuity) {
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
          if (this.continuity) this.failure = this.reason;
        }
      }
      this.samples.push(this.snapshot(0));
    } catch (e) {
      this.world.free();
      throw e;
    }
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

  private hasAwakeProps(): boolean {
    for (const active of this.activeProps.values()) {
      if (!active.body.isSleeping() || !active.releaserCleared) return true;
    }
    return false;
  }

  private updateActorBlockers(frame: FrameState, wakeUp = true): void {
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
      if (!blocker.enabled || dist > 1.0 || !wakeUp) {
        blocker.body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, wakeUp);
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
    const q = qaxis(UP, a.yaw);
    let pos: Vec3;
    if (pf?.attachedTo === actor) {
      pos = [pf.pos[0], pf.pos[1] + lift, pf.pos[2]];
    } else {
      const s = STYLES[actor];
      const off = qrot(q, [-0.18 * s.height, 0.45 * s.height, 0.22 * s.height]);
      pos = [a.pos[0] + off[0], a.pos[1] + lift + off[1], a.pos[2] + off[2]];
    }
    return { pos, rotation: q };
  }

  private propTransformOf(active: ActivePropBody): PropTransform {
    const q = active.body.rotation();
    const rotation: Quat = [q.x, q.y, q.z, q.w];
    const halfHeight = PROP_COLLIDER_PROFILES[active.prop].halfHeight;
    // Render origin is the prop's base, while the rigid body rotates about its center.
    const t = tuple(active.body.translation());
    const offset = qrot(rotation, [0, halfHeight, 0]);
    return { pos: [t[0] - offset[0], t[1] - offset[1], t[2] - offset[2]], rotation };
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

  /** Reconcile future actions with the canonical simulation result. Scene and
   * attachment times stay authored; movement may borrow a preceding idle.
   * An unreachable/too-short route rejects the whole chain. */
  private prepareActions(t: number): void {
    if (!this.continuity || this.failure || !this.masha) return;
    while (this.actionIndex < this.actions.length && this.actions[this.actionIndex].t <= t + 1e-8) {
      const { clip, segmentIndex, t: start } = this.actions[this.actionIndex++];
      const p = this.masha.translation();
      const from: Vec2 = [p.x, p.z];
      const segment = this.view.segments[segmentIndex].segment;
      if (segmentIndex !== this.preparedSegment) {
        segment.startState.actors.masha.pos = [...from];
        if (this.preparedSegment >= 0) {
          segment.startState.actors.masha.facing = evaluate(this.view, Math.max(0, start - 1e-6)).actors.masha.yaw;
        }
        this.preparedSegment = segmentIndex;
      }
      const ballActive = this.activeProps.get('ball');
      const next = this.actions[this.actionIndex];
      if (
        clip.verb === 'idle' &&
        ballActive &&
        next &&
        next.segmentIndex === segmentIndex &&
        MOVE_VERBS.has(next.clip.verb) &&
        next.clip.params.target === 'ball' &&
        Math.abs(next.t - (start + clip.dur)) < 0.002
      ) {
        const approach = ballApproach(from, ballSupport(this.snapshot(start).ball!));
        if (approach) {
          const speed = next.clip.verb === 'run_to' ? 3.2 : next.clip.verb === 'tiptoe_to' ? 0.8 : 1.5;
          const extra = Math.max(0, yardRouteLength(approach.path) / speed + 0.3 - next.clip.dur);
          const borrow = Math.min(extra, Math.max(0, clip.dur - 0.25));
          if (borrow > 0) {
            clip.dur -= borrow;
            next.clip.start -= borrow;
            next.clip.dur += borrow;
            next.t -= borrow;
          }
        }
      }
      if (MOVE_VERBS.has(clip.verb)) {
        let route: Vec2[] | null = null;
        let arrival: number | undefined;
        if (clip.params.target === 'ball' && ballActive) {
          if (!ballActive.body.isSleeping()) {
            this.failure = 'ball is not settled at the retrieval approach';
            return;
          }
          const b = this.snapshot(start).ball!;
          const approach = ballApproach(from, ballSupport(b));
          route = approach?.path ?? null;
          arrival = approach?.yaw;
        } else {
          const destination = clip.params.to ?? clip.params.path?.at(-1) ?? from;
          route = planYardRoute(from, destination);
          // The semantic bench mark is in the seat. Approach its open front;
          // a shorter rear corner would release a carried ball under the table.
          if (!route && clip.params.target === 'bench' && !yardPointClear(destination)) {
            route = planYardRoute(from, [Math.max(1.35, Math.min(2.65, destination[0])), 3.52]);
          }
          // A semantic furniture mark may be inside its collider. Reach its
          // nearest free edge instead of trying to stand inside the bench.
          if (!route && !yardPointClear(destination)) {
            let best = Infinity;
            for (const r of [0.3, 0.5, 0.7, 0.9, 1.1, 1.3]) {
              for (let i = 0; i < 24; i++) {
                const a = (i * Math.PI * 2) / 24;
                const candidate: Vec2 = [destination[0] + Math.sin(a) * r, destination[1] + Math.cos(a) * r];
                const path = planYardRoute(from, candidate);
                if (!path) continue;
                const cost = r * 6 + yardRouteLength(path);
                if (cost < best) {
                  best = cost;
                  route = path;
                }
              }
            }
          }
        }
        if (!route) {
          this.failure = 'no clear yard route to the next action';
          return;
        }
        const maxSpeed = clip.verb === 'run_to' ? 3.8 : clip.verb === 'tiptoe_to' ? 1.0 : 1.9;
        if (yardRouteLength(route) > Math.max(0.1, clip.dur - 0.2) * maxSpeed) {
          this.failure = 'authored movement is too short for the safe route';
          return;
        }
        clip.params = {
          ...clip.params,
          from: [...from],
          to: [...route.at(-1)!],
          path: route,
          ...(arrival !== undefined ? { arrivalYaw: arrival } : {}),
        };
        this.routes.push({ start, path: route.map((pt) => [...pt]), target: clip.params.target ?? null });
      } else if (clip.verb === 'look_at' && next?.clip.verb === 'take' && next.clip.params.item === 'ball' && ballActive) {
        const support = ballSupport(this.snapshot(start).ball!);
        clip.params = { ...clip.params, facing: Math.atan2(support[0] - from[0], support[2] - from[1]), lookAt: support };
      } else if (clip.verb === 'take' && clip.params.item === 'ball' && ballActive) {
        const b = this.snapshot(start).ball!;
        const support = ballSupport(b);
        const distance = Math.hypot(from[0] - support[0], from[1] - support[2]);
        if (support[1] < -0.02 || support[1] > 0.16 || distance > 0.39 || !ballActive.body.isSleeping()) {
          this.failure = 'ball pickup has no reachable settled contact';
          return;
        }
        const e = quatToEulerYXZ(b.rotation);
        clip.params = {
          ...clip.params,
          from: [...from],
          facing: Math.atan2(support[0] - from[0], support[2] - from[1]),
          lookAt: support,
          pickUpAt: 'clearing',
          pickUpPosition: [...b.pos],
          pickUpRotation: e,
        };
        this.pickups.push({ start, attach: start + clip.dur * 0.5, position: [...b.pos] });
      } else if (clip.verb === 'put_down' && clip.params.item === 'ball') {
        const at = clip.params.putDownPosition;
        if (!at || Math.abs(at[1] - BENCH_TOP) > 0.005 || at[0] < 1.31 || at[0] > 2.69 || Math.abs(at[2] - 3) > 0.14 || Math.hypot(at[0] - from[0], at[2] - from[1]) > 0.7) {
          this.failure = 'bench placement has no reachable support';
          return;
        }
      } else if (clip.verb === 'nudge' && clip.params.item === 'ball') {
        if (!ballActive) {
          this.failure = 'bench nudge has no physical ball';
          return;
        }
        const b = this.snapshot(start).ball!;
        const support = ballSupport(b);
        const v = ballActive.body.linvel();
        const w = ballActive.body.angvel();
        if (
          Math.abs(support[1] - BENCH_TOP) > 0.015 ||
          support[0] < 1.30 ||
          support[0] > 2.70 ||
          Math.abs(support[2] - 3) > 0.14 ||
          Math.hypot(v.x, v.y, v.z) > 0.04 ||
          Math.hypot(w.x, w.y, w.z) > 0.1 ||
          Math.hypot(from[0] - support[0], from[1] - support[2]) > 0.7
        ) {
          this.failure = 'bench nudge has no reachable resting contact';
          return;
        }
        const impulse = clip.params.nudgeImpulse ?? DEFAULT_BENCH_IMPULSE;
        if (impulse.some((val) => !Number.isFinite(val)) || impulse[0] > -0.4 || impulse[0] < -1.2 || impulse[1] !== 0 || impulse[2] !== 0) {
          this.failure = 'unsupported bench nudge direction';
          return;
        }
        const e = quatToEulerYXZ(b.rotation);
        clip.params = {
          ...clip.params,
          from: [...from],
          lookAt: [support[0], support[1] + BALL_RADIUS, support[2]],
          nudgePosition: [...b.pos],
          nudgeRotation: e,
        };
        this.nudges.push({ t: start + clip.dur * 0.5, impulse: [...impulse] });
      }
    }
  }

  frame(view: Timeline, t: number): FrameState {
    const corrected = { segments: this.view.segments.slice(0, view.segments.length), duration: view.duration };
    return evaluate(corrected, t);
  }

  /** A failed atomic chain is terminal even though its original release list
   * is nonempty and its partial trajectory never reached the story endpoint. */
  get warmingComplete(): boolean {
    return this.failure !== null || (this.reason !== null && this.releases.length === 0) || this.samples.at(-1)!.t >= this.view.duration;
  }
  get failed(): boolean {
    return this.failure !== null;
  }

  private step(t: number): void {
    const prior = this.samples.at(-1)!;
    const dt = t - prior.t;
    this.prepareActions(t);
    const frame = evaluate(this.view, t);

    if (this.masha && this.capsule && this.controller) {
      const p = this.masha.translation();
      const a = frame.actors.masha.pos;
      const b = this.previous.actors.masha.pos;
      this.verticalSpeed = Math.max(-20, this.verticalSpeed - 9.81 * dt);
      const wanted = { x: a[0] - (this.continuity ? p.x : b[0]), y: this.verticalSpeed * dt, z: a[2] - (this.continuity ? p.z : b[2]) };
      this.controller.computeColliderMovement(this.capsule, wanted, undefined, MASHA_GROUP);
      const move = this.controller.computedMovement();
      if (this.controller.computedGrounded()) this.verticalSpeed = 0;
      const y = Math.max(MASHA_CENTER, p.y + move.y);
      if (y <= MASHA_CENTER + SKIN) this.verticalSpeed = 0;
      this.masha.setNextKinematicTranslation({ x: p.x + move.x, y, z: p.z + move.z });
      const distance = Math.hypot(wanted.x, wanted.z);
      const ratio = distance > 1e-6 ? Math.min(1, Math.hypot(move.x, move.z) / distance) : 1;
      this.stride += (ratio - this.stride) * Math.min(1, dt * 18);
    }

    const awakeProps = this.hasAwakeProps();
    if (this.actorBlockers.size > 0) this.updateActorBlockers(frame, awakeProps);

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
          active.collider.setCollisionGroups(this.continuity && active.prop === 'ball' ? BALL_GROUP : PROP_GROUP);
          active.releaserCleared = true;
        }
      }
    }

    this.world.timestep = Math.min(dt, PHYSICS_DT * 2);
    this.world.step();
    this.steps++;

    // Rolling resistance on grass after a ball rolls off the bench.
    const ballActive = this.activeProps.get('ball');
    if (ballActive && this.ballFromBench && !this.groundResistance && ballActive.body.translation().y <= BALL_RADIUS + 0.02) {
      let touching = false;
      this.world.contactPair(ballActive.collider, this.ground, (m) => {
        for (let i = 0; i < m.numContacts(); i++) if (m.contactImpulse(i) > 0) touching = true;
      });
      if (touching) {
        ballActive.body.setLinearDamping(2);
        ballActive.body.setAngularDamping(3);
        this.groundResistance = true;
      }
    }

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
      const q = transform.rotation;
      const offset = qrot(q, [0, profile.halfHeight, 0]);
      const centre: Vec3 = [transform.pos[0] + offset[0], transform.pos[1] + offset[1], transform.pos[2] + offset[2]];

      if (this.continuity && rel.bench) {
        const er = rel.rotation ?? ([0, 0, 0] as Vec3);
        const expectedQ = eulerYXZToQuat(er[0], er[1], er[2]);
        const expectedOff = qrot(expectedQ, [0, BALL_RADIUS, 0]);
        const expected: Vec3 | null = rel.position
          ? [rel.position[0] + expectedOff[0], rel.position[1] + expectedOff[1], rel.position[2] + expectedOff[2]]
          : null;
        if (
          !expected ||
          Math.hypot(centre[0] - expected[0], centre[1] - expected[1], centre[2] - expected[2]) > 0.012 ||
          Math.abs(centre[1] - BALL_RADIUS - BENCH_TOP) > 0.012 ||
          centre[0] < 1.30 ||
          centre[0] > 2.70 ||
          Math.abs(centre[2] - 3) > 0.14
        ) {
          this.failure = 'held ball does not reach the bench surface';
          return;
        }
      }

      const existing = this.activeProps.get(rel.prop);
      if (existing) {
        this.world.removeRigidBody(existing.body);
        this.activeProps.delete(rel.prop);
      }

      if (rel.prop === 'ball') {
        this.ballFromBench = !!rel.bench;
        this.groundResistance = false;
      }

      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(centre[0], centre[1], centre[2])
          .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
          .setCcdEnabled(true)
          .setLinearDamping(profile.linearDamping)
          .setAngularDamping(profile.angularDamping),
      );
      const colliderDesc = createPropColliderDesc(rel.prop).setCollisionGroups(
        this.continuity && rel.prop === 'ball' ? BALL_GROUP : propGroupExcludingActor(rel.actor),
      );
      if (rel.bench) {
        colliderDesc.setContactSkin(0.003).setRestitution(0.3);
      }
      const collider = this.world.createCollider(colliderDesc, body);
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
        releaserCleared: this.continuity && rel.prop === 'ball',
      });
    }

    const nudge = this.nudges[this.nudgeIndex];
    if (nudge && Math.abs(t - nudge.t) < 1e-7) {
      this.nudgeIndex++;
      const activeBall = this.activeProps.get('ball');
      if (!activeBall) {
        this.failure = 'bench ball disappeared before the nudge';
        return;
      }
      const p = activeBall.body.translation();
      activeBall.body.applyImpulseAtPoint(
        { x: nudge.impulse[0], y: nudge.impulse[1], z: nudge.impulse[2] },
        { x: p.x + 0.075, y: p.y + 0.025, z: p.z + 0.127 },
        true,
      );
      this.impulses.push({ time: t, position: [p.x, p.y, p.z], impulse: [...nudge.impulse] });
    }

    this.previous = frame;
    this.samples.push(this.snapshot(t, propsBefore));
  }

  sample(time: number, side: 'left' | 'right' = 'right'): Sample {
    // Validate a continuity chain atomically before exposing frames: a failed
    // late pickup must not change earlier ownership depending on seek order.
    if (this.continuity && !this.prepared && !this.preparing) {
      this.preparing = true;
      this.sample(this.view.duration);
      this.preparing = false;
      this.prepared = true;
      if (this.failure) this.reason = `continuity fallback: ${this.failure}`;
    }
    const t = Math.max(0, Math.min(time, this.view.duration));
    if (this.failure) return { ...this.samples[0], t, root: null, props: {}, ball: null };
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
      while (!this.failure && this.actionIndex < this.actions.length && this.actions[this.actionIndex].t <= last + 1e-9)
        this.prepareActions(last);
      if (this.failure) break;

      const release = this.releases[this.releaseIndex]?.t ?? Infinity;
      const handoff = this.handoffs[this.handoffIndex] ?? Infinity;
      const boundary = this.view.segments[this.boundaryIndex]?.offset ?? Infinity;
      const action = this.actions[this.actionIndex]?.t ?? Infinity;
      const nudge = this.nudges[this.nudgeIndex]?.t ?? Infinity;
      let nextAttachment = Infinity;
      for (let i = 0; i < this.pickups.length; i++) {
        const att = this.pickups[i].attach;
        if (att > last + 1e-9 && att < nextAttachment) nextAttachment = att;
      }
      const needSubsteps = !!this.masha || this.hasAwakeProps();
      const next = Math.min(
        needSubsteps ? (this.tick + 1) * PHYSICS_DT : Infinity,
        release,
        handoff,
        boundary,
        action,
        nudge,
        nextAttachment,
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
