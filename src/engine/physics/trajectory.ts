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
  type Vec3,
} from '../../shared/schema';
import { walkHeightAt } from '../../shared/yardLayout';
import type { FrameState, Quat } from '../api';
import { qaxis, qrot, qslerp } from '../motion/blend';
import { STYLES } from '../motion/library';
import { evaluate } from '../player/evaluate';
import {
  ACTOR_CAPSULE,
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
import { PHYSICS_DT, isActor, isMark, schedulePropTimeline, type PropRelease } from './replaySchedule';
import { createWorldColliders } from './yardColliders';

const THROW_RELEASE_CLEARANCE_S = 0.18;
const MAX_THROW_HORIZ_SPEED = 14;
const UP: Vec3 = [0, 1, 0];

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

export class Trajectory {
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
  private previous!: FrameState;
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
    try {
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
      const q = transform.rotation;
      const offset = qrot(q, [0, profile.halfHeight, 0]);
      const centre: Vec3 = [transform.pos[0] + offset[0], transform.pos[1] + offset[1], transform.pos[2] + offset[2]];

      const existing = this.activeProps.get(rel.prop);
      if (existing) {
        this.world.removeRigidBody(existing.body);
        this.activeProps.delete(rel.prop);
      }

      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(centre[0], centre[1], centre[2])
          .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
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
      const needSubsteps = !!this.masha || this.hasAwakeProps();
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
