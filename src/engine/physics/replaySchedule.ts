// Timeline eligibility and prop release/handoff scheduling for Rapier replay.
import { sceneLocationAt } from '../../shared/bible/set';
import {
  ACTOR_IDS,
  MARK_IDS,
  type ActorClip,
  type ActorId,
  type MarkId,
  type PropId,
  type Timeline,
} from '../../shared/schema';

export const PHYSICS_DT = 1 / 60;
export const MAX_SECONDS = 180;

export const ROOT_VERBS = new Set([
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
export const MOVE_VERBS = new Set(['walk_to', 'run_to', 'tiptoe_to']);

const MARK_SET = new Set<string>(MARK_IDS);
const ACTOR_SET = new Set<string>(ACTOR_IDS);
export const isMark = (s: string | undefined | null): s is MarkId => !!s && MARK_SET.has(s);
export const isActor = (s: string | undefined | null): s is ActorId => !!s && ACTOR_SET.has(s);

export interface PropRelease {
  t: number;
  kind: 'throw' | 'drop';
  actor: ActorId;
  prop: PropId;
  clip: ActorClip;
  offset: number;
}

const yard = (p: number[]) =>
  sceneLocationAt(p[0], p.at(-1)!) === 'yard' && p[0] >= -3 && p[0] <= 5 && p.at(-1)! >= -1 && p.at(-1)! <= 6;

/** Conservative ownership: paired/support choreography keeps its entire timeline for root control.
 * Prop physics (throw / non-re-picked drop) is decoupled and can still run even when rootReason declines. */
export function rootReason(timeline: Timeline): string | null {
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
export function schedulePropTimeline(timeline: Timeline): { releases: PropRelease[]; handoffs: number[]; propCount: number } {
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
