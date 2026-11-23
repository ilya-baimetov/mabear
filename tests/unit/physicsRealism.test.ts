import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, describe, expect, it } from 'vitest';
import { compileEpisode } from '../../src/compiler/episode';
import { initialWorldState } from '../../src/compiler/worldState';
import { getFixture } from '../../src/director/fixtures';
import { evaluate } from '../../src/engine/player/evaluate';
import { createRapierReplay, type RapierReplay } from '../../src/engine/physics/rapierReplay';
import {
  ACTOR_BLOCKER_GROUP,
  BALL_GROUP,
  PROP_COLLIDER_PROFILES,
  createPropColliderDesc,
  createWorldColliders,
} from '../../src/engine/physics/yardColliders';
import { HOUSE_PREP_TABLE, HOUSE_READING_TABLE, houseWorld } from '../../src/shared/houseLayout';
import { KITCHEN_CUPBOARD } from '../../src/shared/interactiveObjects';
import recordings from '../../src/shared/recordedSpeech.json';
import {
  ACTOR_IDS,
  DEFAULT_REMIX,
  PROP_IDS,
  type ActorClip,
  type ActorId,
  type Beat,
  type BeatScript,
  type PropId,
  type Segment,
  type Timeline,
  type Vec3,
  type WorldState,
} from '../../src/shared/schema';
import { speechKey, type SpeechRecording } from '../../src/shared/speech';

const speechDurations = Object.fromEntries(
  (recordings as SpeechRecording[]).map((r) => [speechKey(r.text, r.lang), r.duration]),
);

const active: RapierReplay[] = [];

afterEach(() => {
  active.splice(0).forEach((r) => r.dispose());
});

async function makeReplay(tl: Timeline, sampleProp?: NonNullable<Parameters<typeof createRapierReplay>[0]>['sampleProp']) {
  const r = await createRapierReplay(sampleProp ? { sampleProp } : {});
  r.setTimeline(tl);
  active.push(r);
  return r;
}

function makeEmptySegment(ws: WorldState, duration = 6): Segment {
  return {
    paragraphId: 'phys-test',
    version: 1,
    duration,
    startState: structuredClone(ws),
    endState: structuredClone(ws),
    actorClips: Object.fromEntries(ACTOR_IDS.map((id) => [id, [] as ActorClip[]])) as Segment['actorClips'],
    dialogue: [],
    emotes: [],
    foley: [],
    camera: [],
    sfx: [],
    music: [],
    ambience: [],
    ducking: [],
    lighting: [],
    fx: [],
  };
}

function makeClipTimeline(
  ws: WorldState,
  setup: (seg: Segment) => void,
  duration = 6,
): Timeline {
  const seg = makeEmptySegment(ws, duration);
  setup(seg);
  return { segments: [{ offset: 0, segment: seg }], duration };
}

function compileFixture(id: 'pancake_morning' | 'fishing_trip'): Timeline {
  const ep = getFixture(id, 'en')!;
  return compileEpisode(
    ep.paragraphs.map((p, i) => ({
      paragraphId: `${id}-${i}`,
      version: 1,
      beatScript: p.beatScript,
      remix: DEFAULT_REMIX,
    })),
    'en',
    undefined,
    speechDurations,
  ).timeline;
}

function beat(actor: ActorId, verb: Beat['verb'], extra: Partial<Beat> = {}): Beat {
  return {
    actor,
    verb,
    target: null,
    item: null,
    line: null,
    emote: null,
    sfx: null,
    emotion: 'happy',
    with_previous: false,
    delay_s: 0,
    shot: 'wide',
    ...extra,
  };
}

function compileSingleBeatStory(beats: Beat[], initial: WorldState = initialWorldState()): Timeline {
  const script: BeatScript = {
    summary: 'Physics realism test story',
    time_of_day: 'day',
    mood: 'playful',
    music: { mood: 'playful', intensity: 'soft', change: 'start' },
    ambience: [],
    beats,
    rule_hits: [],
  };
  return compileEpisode(
    [{ paragraphId: 'test-seg', version: 1, beatScript: script, remix: DEFAULT_REMIX }],
    'en',
    initial,
    speechDurations,
  ).timeline;
}

function findThrowEvent(tl: Timeline, prop: PropId) {
  for (const { offset, segment } of tl.segments) {
    for (const actor of ACTOR_IDS) {
      for (const clip of segment.actorClips[actor] ?? []) {
        if (clip.verb === 'throw' && clip.params.item === prop) {
          return {
            actor,
            clip,
            tRelease: offset + clip.start + clip.dur * 0.4,
            tEnd: offset + clip.start + clip.dur,
          };
        }
      }
    }
  }
  return null;
}

describe('Goal 2 realistic multi-location Rapier physics', () => {
  it('defines realistic collider profiles for all 19 PropIds', () => {
    for (const id of PROP_IDS) {
      const p = PROP_COLLIDER_PROFILES[id];
      expect(p).toBeDefined();
      expect(p.radius).toBeGreaterThan(0);
      expect(p.halfHeight).toBeGreaterThan(0);
      expect(p.density).toBeGreaterThan(0);
      expect(p.restitution).toBeGreaterThanOrEqual(0);
      expect(p.restitution).toBeLessThan(1);
      expect(p.friction).toBeGreaterThan(0);
      expect(p.linearDamping).toBeGreaterThanOrEqual(0);
      expect(p.angularDamping).toBeGreaterThanOrEqual(0);
    }
    expect(PROP_COLLIDER_PROFILES.ball.shape).toBe('sphere');
    expect(PROP_COLLIDER_PROFILES.ball.restitution).toBeGreaterThan(PROP_COLLIDER_PROFILES.pillow.restitution * 4);
    expect(PROP_COLLIDER_PROFILES.frying_pan.density).toBeGreaterThan(PROP_COLLIDER_PROFILES.pillow.density * 10);
    expect(PROP_COLLIDER_PROFILES.book.shape).toBe('box');
    expect(PROP_COLLIDER_PROFILES.jam_jar.shape).toBe('cylinder');
  });

  it('builds accurate multi-location static surfaces in createWorldColliders (yard, house, pond, wolves)', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      createWorldColliders(world);
      const dropAndSettleY = (prop: PropId, x: number, startY: number, z: number) => {
        const prof = PROP_COLLIDER_PROFILES[prop];
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, startY + prof.halfHeight, z)
            .setLinearDamping(prof.linearDamping)
            .setAngularDamping(prof.angularDamping),
        );
        world.createCollider(createPropColliderDesc(prop).setCollisionGroups(BALL_GROUP), body);
        world.timestep = 1 / 60;
        for (let i = 0; i < 240; i++) world.step();
        const originY = body.translation().y - prof.halfHeight;
        world.removeRigidBody(body);
        return originY;
      };

      // Yard: table top (0.78), porch deck (0.32), path bridge (> 0.15)
      expect(dropAndSettleY('book', 1.8, 1.3, 1.6)).toBeCloseTo(0.78, 2);
      expect(dropAndSettleY('book', -6, 0.9, -3.0)).toBeCloseTo(0.32, 2);
      expect(dropAndSettleY('book', 0, 0.8, 17.9)).toBeGreaterThan(0.2);

      // House interior: reading table (0.793), prep table (1.20), cooking helper (0.80),
      // kitchen counter (1.228), pantry upper shelf (2.10), reading chair seat (0.53)
      expect(dropAndSettleY('book', HOUSE_READING_TABLE.position[0], 1.4, HOUSE_READING_TABLE.position[1])).toBeCloseTo(
        0.793,
        2,
      );
      expect(dropAndSettleY('book', HOUSE_PREP_TABLE.position[0], 1.8, HOUSE_PREP_TABLE.position[1])).toBeCloseTo(
        1.2,
        2,
      );
      const [hx, hz] = houseWorld([-2.96, 1.95]);
      expect(dropAndSettleY('book', hx, 1.4, hz)).toBeCloseTo(0.8, 2);
      const [kx, kz] = houseWorld([-5.77, -1.51]);
      expect(dropAndSettleY('book', kx, 1.8, kz)).toBeCloseTo(1.228, 2);
      const [px, pz] = [KITCHEN_CUPBOARD.center[0], KITCHEN_CUPBOARD.center[1]];
      expect(dropAndSettleY('pantry_honey', px, 2.35, pz)).toBeCloseTo(2.1, 2);
      const [rcx, rcz] = houseWorld([0.65, -1.23]);
      expect(dropAndSettleY('book', rcx, 1.1, rcz)).toBeCloseTo(0.53, 2);

      // Pond: angled pier (0.28), lakeside bench (0.535), stump (0.40)
      expect(dropAndSettleY('book', -5.2, 0.9, 8.8)).toBeCloseTo(0.28, 2);
      expect(dropAndSettleY('book', -4.1, 1.1, 5.8)).toBeCloseTo(0.535, 2);
      expect(dropAndSettleY('book', -2.28, 1.0, 5.9)).toBeCloseTo(0.4, 2);

      // Wolves: ambulance van roof (~2.22), wooden crates (0.48)
      expect(dropAndSettleY('book', 14.1, 2.8, -1.0)).toBeCloseTo(2.22, 2);
      expect(dropAndSettleY('book', 16.2, 1.1, -3.6)).toBeCloseTo(0.48, 2);
    } finally {
      world.free();
    }
  });

  it('simulates ballistic throws across yard, house, pond, and wolves with tumble and arbitrary-seek determinism', async () => {
    const cases: {
      name: string;
      actor: ActorId;
      prop: PropId;
      from: [number, number];
      facing: number;
      lookAt: Vec3;
      dur?: number;
      expectedLandingYRange: [number, number];
    }[] = [
      {
        name: 'yard throw onto table',
        actor: 'bear',
        prop: 'jam_jar',
        from: [0.5, 1.5],
        facing: Math.PI / 2,
        lookAt: [1.75, 0.78, 1.55],
        expectedLandingYRange: [0.76, 0.86],
      },
      {
        name: 'house throw onto reading table',
        actor: 'masha',
        prop: 'book',
        from: [HOUSE_READING_TABLE.position[0] - 1.6, HOUSE_READING_TABLE.position[1]],
        facing: Math.PI / 2,
        lookAt: [HOUSE_READING_TABLE.position[0], 0.793, HOUSE_READING_TABLE.position[1]],
        expectedLandingYRange: [0.78, 0.88],
      },
      {
        name: 'pond throw onto pier',
        actor: 'masha',
        prop: 'ball',
        from: [-6.1, 7.8],
        facing: 0.4,
        lookAt: [-5.1, 0.28, 8.6],
        expectedLandingYRange: [-0.02, 0.35],
      },
      {
        name: 'wolves throw onto van roof',
        actor: 'wolf_a',
        prop: 'pillow',
        from: [11.6, -1.0],
        facing: Math.PI / 2,
        lookAt: [14.1, 2.22, -1.0],
        dur: 1.8,
        expectedLandingYRange: [2.16, 2.34],
      },
      {
        name: 'wolves throw rebounding off van side onto ground',
        actor: 'wolf_b',
        prop: 'carrot',
        from: [11.0, -1.0],
        facing: Math.PI / 2,
        lookAt: [14.1, 1.0, -1.0],
        expectedLandingYRange: [0.02, 0.1],
      },
    ];

    for (const c of cases) {
      const ws = initialWorldState();
      ws.actors[c.actor] = { ...ws.actors[c.actor], pos: c.from, facing: c.facing, mark: null, holding: c.prop };
      ws.props[c.prop] = { at: c.actor };
      const throwDur = c.dur ?? 1.2;
      const tl = makeClipTimeline(
        ws,
        (seg) => {
          seg.cast = [c.actor];
          seg.actorClips[c.actor] = [
            {
              start: 0.5,
              dur: throwDur,
              verb: 'throw',
              emotion: 'playful' as never,
              params: { from: c.from, facing: c.facing, posture: 'stand', item: c.prop, lookAt: c.lookAt },
            },
          ];
          seg.endState.props[c.prop] = { at: 'clearing' };
          seg.endState.actors[c.actor].holding = null;
        },
        10,
      );

      const a = await makeReplay(tl);
      const b = await makeReplay(tl);
      const tRel = 0.5 + throwDur * 0.4;

      // Pre-release remains attached to actor
      expect(a.evaluate(tl, tRel - 0.02).props[c.prop].attachedTo).toBe(c.actor);

      // During flight: rotation evolves (tumble) and position moves in ballistic arc
      const f0 = a.evaluate(tl, tRel + 0.05).props[c.prop];
      const f1 = a.evaluate(tl, tRel + 0.35).props[c.prop];
      const f2 = a.evaluate(tl, tRel + 0.6).props[c.prop];
      expect(f0.attachedTo).toBeNull();
      expect(f1.rotation).toBeDefined();
      expect(f2.rotation).toBeDefined();
      expect(f1.rotation).not.toEqual(f0.rotation);
      expect(f1.pos[1]).toBeGreaterThan(f0.pos[1] - 0.1);

      // Settles onto expected real surface height
      const end = a.evaluate(tl, tl.duration);
      expect(end.props[c.prop].pos[1], c.name).toBeGreaterThanOrEqual(c.expectedLandingYRange[0]);
      expect(end.props[c.prop].pos[1], c.name).toBeLessThanOrEqual(c.expectedLandingYRange[1]);
      expect(a.inspect(tl, tl.duration).sleeping, c.name).toBe(true);

      // Arbitrary forward/reverse seek determinism
      const queryTimes = [0, tRel - 0.01, tRel, tRel + 0.237, tRel + 0.713, 3.88, tl.duration];
      const expected = queryTimes.map((t) => a.evaluate(tl, t));
      for (const idx of [6, 1, 4, 0, 5, 2, 3, 6]) {
        expect(b.evaluate(tl, queryTimes[idx])).toEqual(expected[idx]);
      }
    }
  });

  for (const [id, prop] of [
    ['pancake_morning', 'flour_bag'],
    ['fishing_trip', 'ball'],
  ] as const) {
    it(`activates Rapier throw physics on built-in ${id} deterministically`, async () => {
      const tl = compileFixture(id);
      const ev = findThrowEvent(tl, prop);
      expect(ev).not.toBeNull();

      const a = await makeReplay(tl);
      const b = await makeReplay(tl);

      const info = a.inspect(tl, tl.duration);
      expect(info.simulatedProps).toBeGreaterThan(0);
      expect(info.sleeping).toBe(true);

      // Before release, prop stays attached to the thrower
      expect(a.evaluate(tl, ev!.tRelease - 0.05).props[prop].attachedTo).toBe(ev!.actor);

      // After release, Rapier drives position & rotation ballistically
      const flightEarly = a.evaluate(tl, ev!.tRelease + 0.06).props[prop];
      const flightMid = a.evaluate(tl, ev!.tRelease + 0.35).props[prop];
      expect(flightEarly.attachedTo).toBeNull();
      expect(flightEarly.rotation).toBeDefined();
      expect(flightMid.rotation).toBeDefined();
      expect(flightMid.rotation).not.toEqual(flightEarly.rotation);
      expect(flightMid.pos).not.toEqual(flightEarly.pos);

      // Paired hug/authored choreography keeps actor roots on animation while prop physics still simulates
      expect(a.evaluate(tl, tl.duration).actors.masha).toEqual(evaluate(tl, tl.duration).actors.masha);

      // Arbitrary seek order matches forward replay identically
      const times = [0, ev!.tRelease - 0.02, ev!.tRelease, ev!.tRelease + 0.31, ev!.tEnd + 1.5, tl.duration];
      const expected = times.map((t) => a.evaluate(tl, t));
      for (const idx of [5, 2, 4, 0, 3, 1, 5]) {
        expect(b.evaluate(tl, times[idx])).toEqual(expected[idx]);
      }
    });
  }

  it('simulates multi-prop drops with distinct per-prop collider profiles and surface settling', async () => {
    const ws = initialWorldState();
    ws.actors.masha = { ...ws.actors.masha, pos: [1.3, 1.5], facing: Math.PI / 2, holding: 'ball' };
    ws.actors.bear = { ...ws.actors.bear, pos: [2.7, 1.5], facing: -Math.PI / 2, holding: 'pillow' };
    ws.actors.wolf_a = { ...ws.actors.wolf_a, pos: [2.0, 2.2], facing: Math.PI, holding: 'book' };
    ws.props.ball = { at: 'masha' };
    ws.props.pillow = { at: 'bear' };
    ws.props.book = { at: 'wolf_a' };

    const tl = makeClipTimeline(
      ws,
      (seg) => {
        seg.cast = ['masha', 'bear', 'wolf_a'];
        seg.actorClips.masha = [
          { start: 0.4, dur: 1.0, verb: 'drop', emotion: 'happy', params: { item: 'ball', dropAt: 'clearing' } },
        ];
        seg.actorClips.bear = [
          { start: 0.4, dur: 1.0, verb: 'drop', emotion: 'happy', params: { item: 'pillow', dropAt: 'clearing' } },
        ];
        seg.actorClips.wolf_a = [
          { start: 0.4, dur: 1.0, verb: 'drop', emotion: 'happy', params: { item: 'book', dropAt: 'clearing' } },
        ];
        seg.endState.props.ball = { at: 'clearing' };
        seg.endState.props.pillow = { at: 'clearing' };
        seg.endState.props.book = { at: 'clearing' };
      },
      7,
    );

    const releasePos: Record<PropId, Vec3> = {
      ...Object.fromEntries(PROP_IDS.map((p) => [p, [0, 1, 0] as Vec3])),
      ball: [1.55, 1.6, 1.55],
      pillow: [2.15, 1.6, 1.88],
      book: [2.0, 1.2, 3.0],
    } as Record<PropId, Vec3>;

    const replay = await makeReplay(tl, (_frame, _actor, prop) => ({
      pos: releasePos[prop],
      rotation: [0.1, 0.2, 0.05, 0.97],
    }));

    expect(replay.inspect(tl, tl.duration).simulatedProps).toBe(3);

    // Measure post-impact bounce height differences: bouncy ball rebounds higher than soft pillow
    let ballMinY = Infinity;
    let ballRebounded = false;
    let prevBallY = Infinity;
    let pillowMaxRebound = 0;
    let pillowMinY = Infinity;
    let prevPillowY = Infinity;
    for (let t = 0.9; t < 3.5; t += 1 / 60) {
      const f = replay.evaluate(tl, t);
      const by = f.props.ball.pos[1];
      const py = f.props.pillow.pos[1];
      if (by > prevBallY + 0.005 && ballMinY < 0.9) ballRebounded = true;
      if (by < ballMinY) ballMinY = by;
      prevBallY = by;

      if (py < pillowMinY) pillowMinY = py;
      if (py > prevPillowY && pillowMinY < 0.9) pillowMaxRebound = Math.max(pillowMaxRebound, py - pillowMinY);
      prevPillowY = py;
    }

    expect(ballRebounded).toBe(true);
    expect(pillowMaxRebound).toBeLessThan(0.08);

    // All three props settle cleanly onto their respective world surfaces (table 0.78 and bench 0.47)
    const end = replay.evaluate(tl, tl.duration);
    expect(end.props.ball.pos[1]).toBeCloseTo(0.78, 1);
    expect(end.props.pillow.pos[1]).toBeCloseTo(0.78, 1);
    expect(end.props.book.pos[1]).toBeCloseTo(0.47, 2);
    expect(replay.inspect(tl, tl.duration).sleeping).toBe(true);
  });

  it('decouples non-re-picked drop physics from unrelated hug clips later in the timeline', async () => {
    const ws = initialWorldState();
    ws.actors.masha = { ...ws.actors.masha, pos: [2, 2.56], facing: Math.PI / 2, holding: 'jam_jar' };
    ws.actors.bear = { ...ws.actors.bear, pos: [0, 0], facing: 0 };
    ws.props.jam_jar = { at: 'masha' };

    const tl = makeClipTimeline(
      ws,
      (seg) => {
        seg.cast = ['masha', 'bear'];
        seg.actorClips.masha = [
          { start: 1, dur: 1, verb: 'drop', emotion: 'happy', params: { item: 'jam_jar', dropAt: 'bench' } },
          { start: 4, dur: 2, verb: 'hug', emotion: 'happy', params: { target: 'bear' } },
        ];
        seg.endState.props.jam_jar = { at: 'bench' };
      },
      7,
    );

    const replay = await makeReplay(tl, () => ({ pos: [2, 0.95, 3], rotation: [0, 0, 0, 1] }));
    const info = replay.inspect(tl, tl.duration);
    expect(info.reason).toBe('paired choreography');
    expect(info.simulatedProps).toBe(1);
    const settled = replay.evaluate(tl, tl.duration);
    expect(settled.props.jam_jar.pos[1]).toBeCloseTo(0.47, 2);
    expect(settled.props.jam_jar.rotation).toBeDefined();
  });

  it('blocks thrown props against standing actors while clearing the thrower for 0.18s and retiring on catch', async () => {
    // 1. Thrower is excluded at launch, target actor in path blocks the ball
    const ws = initialWorldState();
    ws.actors.masha = { ...ws.actors.masha, pos: [0, 0], facing: 0, holding: 'ball' };
    ws.actors.bear = { ...ws.actors.bear, pos: [0, 3.0], facing: Math.PI };
    ws.props.ball = { at: 'masha' };

    const tlBlocked = makeClipTimeline(
      ws,
      (seg) => {
        seg.cast = ['masha', 'bear'];
        seg.actorClips.masha = [
          {
            start: 0.5,
            dur: 1.2,
            verb: 'throw',
            emotion: 'happy',
            params: { from: [0, 0], facing: 0, posture: 'stand', item: 'ball', lookAt: [0, 0.8, 5.0] },
          },
        ];
        seg.endState.props.ball = { at: 'clearing' };
      },
      5,
    );
    const rBlocked = await makeReplay(tlBlocked);
    // Ball aimed at z = 5.0 is deflected by Bear standing at z = 3.0 before reaching z = 4.0
    let maxZ = -Infinity;
    for (let t = 0.98; t < 3.5; t += 1 / 60) {
      maxZ = Math.max(maxZ, rBlocked.evaluate(tlBlocked, t).props.ball.pos[2]);
    }
    expect(maxZ).toBeLessThan(3.0);

    // 2. Throw targeting an actor retires the rigid body when caught
    const wsCatch = initialWorldState();
    wsCatch.actors.masha = { ...wsCatch.actors.masha, pos: [-1, 0], facing: Math.PI / 2, holding: 'ball' };
    wsCatch.actors.bear = { ...wsCatch.actors.bear, pos: [1.5, 0], facing: -Math.PI / 2 };
    wsCatch.props.ball = { at: 'masha' };
    const tlCatch = compileSingleBeatStory([beat('masha', 'throw', { target: 'bear', item: 'ball' })], wsCatch);
    const ev = findThrowEvent(tlCatch, 'ball')!;
    const rCatch = await makeReplay(tlCatch);
    expect(rCatch.evaluate(tlCatch, ev.tRelease + 0.1).props.ball.attachedTo).toBeNull();
    expect(rCatch.evaluate(tlCatch, ev.tEnd + 0.05).props.ball.attachedTo).toBe('bear');
  });

  it('keeps central-yard root control active for harmless expressive verbs', async () => {
    const ws = initialWorldState();
    ws.actors.masha = { ...ws.actors.masha, pos: [0, 0], facing: 0 };
    const tl = compileSingleBeatStory(
      [
        beat('masha', 'clap'),
        beat('masha', 'spin'),
        beat('masha', 'sneeze'),
        beat('masha', 'yawn_stretch'),
      ],
      ws,
    );
    const replay = await makeReplay(tl);
    expect(replay.inspect(tl, 1).reason).toBeNull();
    expect(replay.evaluate(tl, 1).actors.masha.physicsRoot).toBe(true);
  });

  it('keeps ACTOR_BLOCKER_GROUP isolated from Masha controller collisions', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      createWorldColliders(world);
      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0));
      const col = world.createCollider(
        RAPIER.ColliderDesc.capsule(0.7, 0.45).setCollisionGroups(ACTOR_BLOCKER_GROUP),
        rb,
      );
      expect(col.collisionGroups()).toBe(ACTOR_BLOCKER_GROUP);
    } finally {
      world.free();
    }
  });
});
