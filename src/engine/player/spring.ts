// Stateless finite-window causal 2nd-order spring-damper convolution driving frame.spring & frame.secondary.
import type { ActorFrame, ActorSpringState, Quat } from "../api";
import { carryLiftRootHeight } from "../../shared/carrySupport";
import { LOCOMOTION_VERBS, STRIDE } from "../../shared/grammar";
import { clamp, clamp01, easeInOut, lerp, smooth } from "../../shared/math";
import { hammockTiming } from "../../shared/physicalInteractions";
import type { ActorClip, ActorId, Timeline } from "../../shared/schema";
import { SPRING_TAPS, SPRING_WINDOW_S, convolveSpring, springKernel } from "../motion/blend";
import { STYLES } from "../motion/library";
import { byPersona } from "../motion/verbs/common";
import { STRIDE_SCALE } from "../motion/verbs/locomotion";
import { swingAngleAt as clipSwingAngleAt } from "../motion/verbs/objects";
import { activeIndex, carryEvents, carryState, kinematicsMetricsInto, type Kin, type Resolved, type SpringKinMetrics } from "./kinematics";

const _kinMetrics: SpringKinMetrics = { dist: 0, speed: 0, moveT: 0, moveDur: 1, aLong: 0, aLat: 0, omega: 0 };

const ACTOR_KERNELS = Object.fromEntries(
  (Object.keys(STYLES) as ActorId[]).map((a) => [a, springKernel(STYLES[a].springFreq, STYLES[a].springDamping)]),
) as Record<ActorId, Float64Array>;

const TOTAL_SAMPLES = SPRING_TAPS + 2;
const _aLong = new Float64Array(TOTAL_SAMPLES);
const _aLat = new Float64Array(TOTAL_SAMPLES);
const _omega = new Float64Array(TOTAL_SAMPLES);
const _yEff = new Float64Array(TOTAL_SAMPLES);
const _latStep = new Float64Array(TOTAL_SAMPLES);
const _portalCut = new Uint8Array(TOTAL_SAMPLES);
const _latInputs = new Float64Array(SPRING_TAPS);
const _longInputs = new Float64Array(SPRING_TAPS);
const _vertInputs = new Float64Array(SPRING_TAPS);

const IMPULSE_VERBS = new Set<ActorClip["verb"]>([
  ...LOCOMOTION_VERBS,
  "jump",
  "fall_down",
  "angry_stomp",
  "surprised",
  "sneeze",
  "spin",
  "dance",
  "laugh",
  "swing",
  "sleep",
  "wake_up",
  "stand_up",
]);

function isStationaryWindow(
  segs: Timeline["segments"],
  trackFor: (segIdx: number, actor: ActorId) => Resolved[],
  actor: ActorId,
  t: number,
  hintSegIdx: number,
): boolean {
  if (segs.length === 0) return true;
  const dt = SPRING_WINDOW_S / SPRING_TAPS;
  const tNewest = t - 0.5 * dt;
  const tOldest = t - (SPRING_TAPS + 1.5) * dt;
  if (tNewest < segs[0].offset) return true;
  let sIdx = Math.min(hintSegIdx, segs.length - 1);
  while (sIdx > 0 && tNewest < segs[sIdx].offset) sIdx--;
  while (sIdx + 1 < segs.length && tNewest >= segs[sIdx].offset + segs[sIdx].segment.duration) sIdx++;

  for (let i = sIdx; i >= 0; i--) {
    const { offset, segment: seg } = segs[i];
    if (offset > tNewest) continue;
    if (offset + seg.duration < tOldest) break;
    if (actor === "masha" && carryEvents(seg).length > 0) return false;
    const track = trackFor(i, actor);
    if (track.length === 0) continue;
    const ltMin = tOldest - offset;
    const ltMax = tNewest - offset;
    for (let k = 0; k < track.length; k++) {
      const r = track[k];
      if (r.end <= ltMin || r.clip.start > ltMax) continue;
      if (
        IMPULSE_VERBS.has(r.clip.verb) ||
        r.clip.params.sceneCut ||
        (r.path !== null && !r.slide) ||
        (r.fromPosture === "carried" && r.posture !== "carried") ||
        (r.inPlaceTurnDur > 0 && r.clip.start + r.inPlaceTurnDur > ltMin)
      ) {
        return false;
      }
    }
  }
  return true;
}

function clearSampleSlot(slot: number, yEff = 0, portalCut = 0): boolean {
  _aLong[slot] = 0;
  _aLat[slot] = 0;
  _omega[slot] = 0;
  _yEff[slot] = yEff;
  _latStep[slot] = 0;
  _portalCut[slot] = portalCut;
  return yEff !== 0;
}

function sampleResolvedInto(
  slot: number,
  actor: ActorId,
  style: (typeof STYLES)[ActorId],
  seg: Timeline["segments"][number]["segment"],
  track: Resolved[],
  hasCarry: boolean,
  ltS: number,
  r: Resolved | null,
  inClip: boolean,
): boolean {
  let carryY = 0;
  let carriedNow = false;
  if (hasCarry) {
    const carry = carryState(seg, ltS, track);
    if (carry && (!inClip || !r || !LOCOMOTION_VERBS.includes(r.clip.verb))) {
      carryY = carryLiftRootHeight(easeInOut(carry.k), STYLES.bear.shoulderHeight);
      carriedNow = true;
    }
  }
  if (!r || !inClip) return clearSampleSlot(slot, carryY);
  if (r.clip.params.sceneCut) return clearSampleSlot(slot, carryY, 1);

  const ltClip = ltS - r.clip.start;
  const dur = Math.max(1e-3, r.clip.dur);
  const u = clamp01(ltClip / dur);
  const verb = r.clip.verb;
  kinematicsMetricsInto(r, ltClip, _kinMetrics);
  let aLong = _kinMetrics.aLong;
  const aLat = _kinMetrics.aLat;
  let omega = _kinMetrics.omega;
  let yEff = carryY;
  let latStep = 0;

  if (!carriedNow && r.fromPosture === "carried" && r.posture !== "carried") {
    const hopDur = clamp(dur, 0.2, 0.85);
    const s = clamp01(ltClip / hopDur);
    yEff += lerp(STYLES.bear.shoulderHeight, 0, s) + 4 * s * (1 - s) * 0.25;
  }

  if (LOCOMOTION_VERBS.includes(verb) && _kinMetrics.dist > 0.002) {
    const speed = _kinMetrics.speed > 0 ? _kinMetrics.speed : 1;
    const gait = verb === "run_to" || verb === "chase" ? "run" : verb === "tiptoe_to" ? "tiptoe" : speed > style.cadence.walk * STRIDE[actor] * 1.7 ? "run" : "walk";
    const stride = STRIDE[actor] * STRIDE_SCALE[gait];
    const stepPh = (_kinMetrics.dist / Math.max(0.05, stride)) * Math.PI;
    const moveT = _kinMetrics.moveT;
    const moveDur = _kinMetrics.moveDur;
    const wMove = Math.min(smooth(moveT / 0.25), smooth((moveDur - moveT) / 0.3));
    yEff += (gait === "run" ? 0.045 : 0.018) * style.bounce * Math.abs(Math.sin(stepPh)) * wMove;
    latStep = Math.sin(stepPh) * (gait === "run" ? 0.09 : 0.14) * wMove;
  } else if (verb === "jump") {
    const h = byPersona(actor, 0.28 * clamp(style.bounce, 0.9, 1.25), 0.19, 0.30, 0.24);
    const T_air = Math.min(Math.sqrt((8 * h) / 9.81), dur * 0.54);
    const massFactor = clamp(0.75 + 0.35 * Math.sqrt(style.mass / 60), 0.7, 1.45);
    const T_pre = Math.min(0.24 * massFactor, (dur - T_air) * 0.52);
    const tLand = T_pre + T_air;
    const T_comp = Math.min(0.30 * massFactor, Math.max(0.06, dur - tLand));
    const preU = clamp01(ltClip / Math.max(1e-3, T_pre));
    const crouchPre = ltClip < T_pre ? smooth(preU / 0.65) * (1 - smooth((preU - 0.65) / 0.35)) : 0;
    const s = ltClip >= T_pre && ltClip <= tLand ? clamp01((ltClip - T_pre) / Math.max(1e-3, T_air)) : 0;
    const air = ltClip >= T_pre && ltClip <= tLand ? 4 * s * (1 - s) : 0;
    const postU = ltClip > tLand ? clamp01((ltClip - tLand) / Math.max(1e-3, T_comp)) : 0;
    const pPow = Math.pow(postU, 0.55);
    const crouchLand = ltClip > tLand && postU < 1 ? 4 * pPow * (1 - pPow) * clamp(0.8 + 0.2 * massFactor, 0.8, 1.35) : 0;
    yEff += h * air - 0.045 * style.hipHeight * (crouchPre + crouchLand);
  } else if (verb === "fall_down") {
    const qFall = clamp01((u - 0.15) / 0.25);
    const fallK = qFall * qFall;
    const getUp = r.posture === "sit" ? 0 : smooth((u - 0.75) / 0.25);
    const tau = ltClip - 0.4 * dur;
    const mNorm = clamp(style.mass / 60, 0.1, 5.5);
    const amp = clamp(0.068 / Math.pow(mNorm, 0.35), 0.025, 0.12) * style.hipHeight;
    const lambda = clamp(3.5 + 1.8 * Math.sqrt(mNorm), 4.0, 9.0);
    const omegaF = clamp(18 / Math.pow(mNorm, 0.22), 11, 24);
    const bounce = tau > 0 ? amp * Math.exp(-lambda * tau) * Math.abs(Math.sin(omegaF * tau)) * smooth((0.85 - u) / 0.1) * (1 - getUp) : 0;
    yEff += -0.65 * style.hipHeight * fallK * (1 - getUp) + bounce;
  } else if (verb === "angry_stomp") {
    const liftS = (c: number) => Math.max(0, Math.sin(clamp01((u - (c - 0.15)) / 0.15) * Math.PI));
    const recoil = (c: number) => {
      const tau = ltClip - c * dur;
      return tau > 0 && u < c + 0.25 ? Math.exp(-13 * tau) * Math.sin(24 * tau) * smooth((c + 0.25 - u) / 0.06) : 0;
    };
    const lL = u < 0.5 ? liftS(0.3) : 0;
    const lR = u >= 0.5 ? liftS(0.7) : 0;
    const absorb = Math.max(0, recoil(0.3) + recoil(0.7)) * clamp(0.7 + 0.35 * Math.sqrt(style.mass / 60), 0.7, 1.4);
    yEff += 0.02 * (lL + lR) - 0.012 * absorb * style.hipHeight;
  } else if (verb === "surprised") {
    const s = clamp01(u / 0.32);
    const hop = u < 0.32 ? 4 * s * (1 - s) : 0;
    yEff += hop * byPersona(actor, 0.08, 0.04, 0.09, 0.065);
  } else if (verb === "sneeze") {
    const windUp = smooth(u / 0.52) * (1 - smooth((u - 0.52) / 0.06));
    const snap = smooth((u - 0.53) / 0.05) * (1 - smooth((u - 0.9) / 0.1));
    yEff += 0.015 * windUp - 0.04 * snap * style.hipHeight;
    aLong += (snap - windUp * 0.4) * 3.5;
  } else if (verb === "spin") {
    const uSpin = clamp01((u - 0.08) / 0.84);
    if (u >= 0.08 && u <= 0.92) omega += (uSpin < 0.5 ? 4 * uSpin : 4 * (1 - uSpin)) * ((Math.PI * 2) / (0.84 * dur));
    yEff += Math.sin(u * Math.PI) * 0.04 * style.bounce;
  } else if (verb === "dance") {
    const beat = byPersona(actor, 2.2, 1.4, 2.0, 2.1);
    yEff += -0.07 * style.hipHeight * Math.abs(Math.sin(ltClip * beat * Math.PI));
    latStep = Math.sin(ltClip * beat * Math.PI * 0.5) * 0.12;
  } else if (verb === "laugh") {
    const f = byPersona(actor, 7, 4.5, 8.5, 6.5);
    yEff += Math.abs(Math.sin(ltClip * f * Math.PI)) * byPersona(actor, 0.02, 0.008, 0.012, 0.016);
  } else if (verb === "swing") {
    const a = clipSwingAngleAt(ltClip, dur);
    yEff += (1 - Math.cos(a)) * 2.97;
    aLong += Math.sin(a) * 4.5;
  } else if (r.clip.params.target === "hammock" && r.clip.params.to && (verb === "sleep" || verb === "wake_up" || verb === "stand_up")) {
    const mount = verb === "sleep";
    const { launch, land } = hammockTiming(mount, dur);
    if (ltClip >= launch && ltClip <= land) {
      const q = (ltClip - launch) / Math.max(1e-3, land - launch);
      yEff += 4 * (mount ? 0.47 : 0.25) * q * (1 - q);
    }
  }
  _aLong[slot] = aLong;
  _aLat[slot] = aLat;
  _omega[slot] = omega;
  _yEff[slot] = yEff;
  _latStep[slot] = latStep;
  _portalCut[slot] = 0;
  return aLong !== 0 || aLat !== 0 || omega !== 0 || yEff !== 0 || latStep !== 0;
}

/**
 * Stateless finite-window causal 2nd-order spring-damper filter (16 taps over [t - 0.8s, t])
 * evaluated across clip and segment boundaries. Guaranteed seek-invariant and zero-impulse when stationary.
 */
export function evaluateCausalSpring(
  segs: Timeline["segments"],
  trackFor: (segIdx: number, actor: ActorId) => Resolved[],
  actor: ActorId,
  t: number,
  hintSegIdx: number,
  instantYawVel: number,
): ActorSpringState {
  if (isStationaryWindow(segs, trackFor, actor, t, hintSegIdx)) {
    return { swayX: 0, swayZ: 0, bounceY: 0, yawVel: instantYawVel, time: t };
  }
  const style = STYLES[actor];
  const dt = SPRING_WINDOW_S / SPRING_TAPS;
  const firstOffset = segs[0].offset;
  let sIdx = Math.min(hintSegIdx, segs.length - 1);
  let curSegIdx = -1;
  let curOffset = 0;
  let curSeg = segs[0].segment;
  let curTrack: Resolved[] = [];
  let curHasCarry = false;
  let clipIdx = -1;
  let active = false;

  for (let j = 0; j < TOTAL_SAMPLES; j++) {
    const tSample = t - (j + 0.5) * dt;
    if (tSample < firstOffset) {
      if (clearSampleSlot(j)) active = true;
      continue;
    }
    while (sIdx > 0 && tSample < segs[sIdx].offset) sIdx--;
    while (sIdx + 1 < segs.length && tSample >= segs[sIdx].offset + segs[sIdx].segment.duration) sIdx++;
    if (sIdx !== curSegIdx) {
      curSegIdx = sIdx;
      curOffset = segs[sIdx].offset;
      curSeg = segs[sIdx].segment;
      curTrack = trackFor(sIdx, actor);
      curHasCarry = actor === "masha" && carryEvents(curSeg).length > 0;
      clipIdx = curTrack.length - 1;
    }
    const ltS = tSample - curOffset;
    if (ltS < 0 || ltS > curSeg.duration) {
      if (clearSampleSlot(j)) active = true;
      continue;
    }
    while (clipIdx >= 0 && curTrack[clipIdx].clip.start > ltS) clipIdx--;
    const r = clipIdx >= 0 ? curTrack[clipIdx] : null;
    const inClip = r !== null && ltS < r.end;
    if (sampleResolvedInto(j, actor, style, curSeg, curTrack, curHasCarry, ltS, r, inClip)) active = true;
  }
  if (!active) return { swayX: 0, swayZ: 0, bounceY: 0, yawVel: instantYawVel, time: t };

  const latGain = 0.85 + 0.35 * style.bankGain;
  const longGain = 0.75 + 0.25 * style.bankGain;
  const vertGain = clamp(0.65 + 0.35 * style.bounce, 0.5, 1.35);

  for (let k = 0; k < SPRING_TAPS; k++) {
    _latInputs[k] = (-_aLat[k] / 9.81) * latGain + _latStep[k];
    _longInputs[k] = (-_aLong[k] / 9.81) * longGain;
    const yAccel = (_portalCut[k] || _portalCut[k + 1] || _portalCut[k + 2]) ? 0 : clamp((_yEff[k] - 2 * _yEff[k + 1] + _yEff[k + 2]) / (dt * dt), -40, 40);
    _vertInputs[k] = (-yAccel / 9.81) * vertGain;
  }

  const kernel = ACTOR_KERNELS[actor];
  return {
    swayX: convolveSpring(_latInputs, kernel, 1, 1),
    swayZ: convolveSpring(_longInputs, kernel, 1, 1),
    bounceY: convolveSpring(_vertInputs, kernel, 1, 1),
    yawVel: instantYawVel,
    time: t,
  };
}

/** Evaluate spring-damper state and derived secondary-motion drivers for one actor frame. */
export function evaluateActorSpring(
  segs: Timeline["segments"],
  trackFor: (segIdx: number, actor: ActorId) => Resolved[],
  actor: ActorId,
  t: number,
  segmentIndex: number,
  kin: Kin,
  inClip: boolean,
  r: Resolved | null,
  verb: ActorClip["verb"],
  clipLt: number,
  hipsBone: Quat | undefined,
  breathe: number,
): { spring: ActorSpringState; secondary: ActorFrame["secondary"] } {
  let instantYawVel = kin.omega ?? kin.turnRate ?? 0;
  if (inClip && r && verb === "spin") {
    const uSpin = clamp01((clipLt / Math.max(1e-3, r.clip.dur) - 0.08) / 0.84);
    if (uSpin > 0 && uSpin < 1) instantYawVel += (uSpin < 0.5 ? 4 * uSpin : 4 * (1 - uSpin)) * ((Math.PI * 2) / (0.84 * Math.max(1e-3, r.clip.dur)));
  }
  const spring = evaluateCausalSpring(segs, trackFor, actor, t, segmentIndex, instantYawVel);
  const roll = (q: Quat | undefined) => (q ? 2 * Math.atan2(q[2], q[3]) : 0);
  const sway = clamp01(0.5 + 0.44 * spring.swayX + 0.22 * clamp(spring.yawVel / 4, -1, 1) + 0.18 * clamp(roll(hipsBone), -1, 1));
  const jiggle = clamp01(0.5 + 0.46 * spring.bounceY + 0.16 * spring.swayZ + 0.04 * Math.sin(t * 2 * Math.PI * STYLES[actor].breathRate - 0.8));
  return { spring, secondary: { sway, jiggle, breathe } };
}
