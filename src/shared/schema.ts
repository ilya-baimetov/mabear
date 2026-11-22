// MaBear data contracts (spec §6). FROZEN after M1: later changes must be additive.
// Every field is required; optional values use .nullable() (structured-output strict mode).
import { z } from "zod";

// ---------- 6.1 Identifiers ----------
// wolf_a / wolf_b (the Wolves, canon series characters) were appended after M1 (additive).
export const ACTOR_IDS = ["masha", "bear", "wolf_a", "wolf_b", "lady_bear", "hare", "rosie", "squirrel", "rival_bear"] as const;
/** The two Wolves (stand-ins). */
export const WOLF_IDS = ["wolf_a", "wolf_b"] as const;
export const MARK_IDS = [
  "clearing", "porch", "door", "garden", "beehive", "swing", "pond_shore", "pier", "table",
  "bench", "woodpile", "path_entry", "big_tree", "bush", "hammock", "creek", "van", "house_kitchen", "house_living", "cupboard",
] as const;
export const PROP_IDS = [
  "jam_jar", "honey_pot", "pancakes", "frying_pan", "ball", "fishing_rod", "fish", "lollipop",
  "flowers", "carrot", "broom", "book", "pillow", "bucket", "watering_can", "flour_bag", "cake", "teapot", "pantry_honey", "carrot_2", "carrot_3", "carrot_4", "carrot_5", "carrot_6", "carrot_7", "carrot_8", "carrot_9",
] as const;
export const EMOTIONS = [
  "neutral", "happy", "excited", "mischievous", "curious", "surprised", "sad", "angry", "scared",
  "sleepy", "proud", "annoyed",
] as const;
export const MOODS = ["playful", "calm", "sleepy", "tense", "triumphant", "sad"] as const;
export const TIMES_OF_DAY = ["morning", "day", "sunset", "night"] as const;
export const SHOTS = ["auto", "wide", "medium", "close", "low_angle", "over_shoulder", "tracking"] as const;
export const EMOTES = [
  "none", "giggle", "laugh", "gasp", "wheee", "hmph", "uh_oh", "yawn", "cry", "cheer", "scream_fun",
  "grunt", "sigh", "hum", "growl_soft", "chuckle", "snore", "huff", "roar_soft", "sneeze",
  // appended for the Wolves (additive)
  "howl", "whimper", "snicker",
] as const;
export const MUSIC_MOODS = [
  "none", "playful", "calm", "sleepy", "tense", "spooky", "chase", "triumphant", "sad", "romantic_waltz",
] as const;
export const AMBIENCES = [
  "birds_day", "forest_wind", "creek", "rain", "thunderstorm", "night_crickets", "bees", "strong_wind",
] as const;
export const SFX_IDS = [
  "door_creak", "door_slam", "knock", "crash", "splash", "thunder_clap", "pop", "boing", "whoosh",
  "bell", "pot_clang", "sizzle", "munch", "glass_clink", "van_horn", "engine_start", "magic_chime",
  "drum_roll", "rimshot", "cuckoo",
] as const;
export const RULE_IDS = [
  "bear_silent", "cast_only", "no_weapons", "no_scary", "kind_language", "no_brands",
  "no_personal_data", "in_character",
  // appended (additive): the Wolves never speak words in this prototype (verify with Animaccord)
  "wolves_silent", "animals_silent",
] as const;
export const VERBS = [
  // Locomotion
  "walk_to", "run_to", "tiptoe_to", "chase", "enter", "exit",
  // Body
  "idle", "jump", "spin", "dance", "sit", "stand_up", "fall_down", "sleep", "wake_up", "yawn_stretch", "hide", "peek",
  // Gesture
  "wave", "clap", "point_at", "look_at", "nod", "shake_head", "shrug", "facepalm", "hug",
  // Emotion
  "laugh", "cry", "sulk", "surprised", "scared", "angry_stomp", "sneeze", "sigh",
  // Objects
  "take", "give", "eat", "throw", "cook", "fish", "swing", "carry", "water_plants", "drop", "open", "close", "put_down",
] as const;
export const VISEMES = ["rest", "open_small", "open_wide", "o", "e", "frown", "grin"] as const;
export const FOLEY_IDS = [
  "footstep", "footstep_heavy", "ground_thump", "landing_thud", "body_fall", "cloth_rustle",
  "prop_pickup", "prop_putdown", "rope_creak", "sizzle_loop", "munch", "splash_small", "water_pour", "clap",
] as const;
export const SURFACES = ["grass", "wood", "water", "dirt"] as const;
export const FX_IDS = ["flour_cloud", "hearts", "sparkles", "zzz", "dust", "splash", "tears", "anger_puff"] as const;

export const ActorIdSchema = z.enum(ACTOR_IDS);
export const MarkIdSchema = z.enum(MARK_IDS);
export const PropIdSchema = z.enum(PROP_IDS);
export const EmotionSchema = z.enum(EMOTIONS);
export const MoodSchema = z.enum(MOODS);
export const TimeOfDaySchema = z.enum(TIMES_OF_DAY);
export const ShotSchema = z.enum(SHOTS);
export const EmoteSchema = z.enum(EMOTES);
export const MusicMoodSchema = z.enum(MUSIC_MOODS);
export const AmbienceSchema = z.enum(AMBIENCES);
export const SfxIdSchema = z.enum(SFX_IDS);
export const RuleIdSchema = z.enum(RULE_IDS);
export const VerbSchema = z.enum(VERBS);
export const VisemeSchema = z.enum(VISEMES);
export const FoleyIdSchema = z.enum(FOLEY_IDS);
export const SurfaceSchema = z.enum(SURFACES);
export const FxIdSchema = z.enum(FX_IDS);
export const LangSchema = z.enum(["en", "ru"]);

export type ActorId = z.infer<typeof ActorIdSchema>;
export type MarkId = z.infer<typeof MarkIdSchema>;
export type PropId = z.infer<typeof PropIdSchema>;
export type Emotion = z.infer<typeof EmotionSchema>;
export type Mood = z.infer<typeof MoodSchema>;
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;
export type Shot = z.infer<typeof ShotSchema>;
export type Emote = z.infer<typeof EmoteSchema>;
export type MusicMood = z.infer<typeof MusicMoodSchema>;
export type Ambience = z.infer<typeof AmbienceSchema>;
export type SfxId = z.infer<typeof SfxIdSchema>;
export type RuleId = z.infer<typeof RuleIdSchema>;
export type Verb = z.infer<typeof VerbSchema>;
export type Viseme = z.infer<typeof VisemeSchema>;
export type FoleyId = z.infer<typeof FoleyIdSchema>;
export type Surface = z.infer<typeof SurfaceSchema>;
export type FxId = z.infer<typeof FxIdSchema>;
export type Lang = z.infer<typeof LangSchema>;

export const CARROT_IDS = ["carrot", "carrot_2", "carrot_3", "carrot_4", "carrot_5", "carrot_6", "carrot_7", "carrot_8", "carrot_9"] as const;
export type CarrotId = typeof CARROT_IDS[number];
export const isCarrot = (id: unknown): id is CarrotId => typeof id === "string" && (CARROT_IDS as readonly string[]).includes(id);

// ---------- 6.3 BeatScript (director output, the LLM contract) ----------
export const BeatSchema = z.object({
  actor: ActorIdSchema,
  verb: VerbSchema,
  target: z.string().nullable(), // MarkId | ActorId | PropId; compiler validates against verb.target
  item: PropIdSchema.nullable(),
  line: z.string().nullable(), // spoken words; only speaks:true characters; ≤120 chars; UI language
  emote: EmoteSchema.nullable(),
  sfx: SfxIdSchema.nullable(),
  emotion: EmotionSchema,
  with_previous: z.boolean(), // true = anchored to previous beat START; false = to its END
  delay_s: z.number(), // 0–6 s offset from the anchor (clamped by the validator)
  shot: ShotSchema,
});
export type Beat = z.infer<typeof BeatSchema>;

export const RuleHitSchema = z.object({
  rule: RuleIdSchema,
  original: z.string(),
  replacement: z.string(),
  kid_message: z.string(),
});
export type RuleHit = z.infer<typeof RuleHitSchema>;

export const MusicCueSchema = z.object({
  mood: MusicMoodSchema,
  intensity: z.enum(["soft", "medium", "full"]),
  change: z.enum(["continue", "start", "stop"]),
});
export type MusicCue = z.infer<typeof MusicCueSchema>;

export const BeatScriptSchema = z.object({
  summary: z.string(), // ≤140 chars, UI language
  time_of_day: TimeOfDaySchema.nullable(), // null = unchanged
  mood: MoodSchema,
  music: MusicCueSchema,
  ambience: z.array(AmbienceSchema).nullable(), // null = unchanged; [] = silence
  beats: z.array(BeatSchema), // 1..14 (enforced by the validator, not the schema: strict-mode compatible)
  rule_hits: z.array(RuleHitSchema),
});
export type BeatScript = z.infer<typeof BeatScriptSchema>;

export const MAX_BEATS = 14;
export const MAX_LINE_CHARS = 120;
export const MAX_SUMMARY_CHARS = 140;
export const MAX_DELAY_S = 6;
export const MAX_PARAGRAPH_CHARS = 600;
export const MAX_PREVIOUS = 3;

// ---------- 6.4 WorldState and Segment ----------
export const Vec2Schema = z.tuple([z.number(), z.number()]);
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec2 = z.infer<typeof Vec2Schema>;
export type Vec3 = z.infer<typeof Vec3Schema>;

export const PostureSchema = z.enum(["stand", "sit", "sleep", "carried", "offstage"]);
export type Posture = z.infer<typeof PostureSchema>;

export const ActorStateSchema = z.object({
  pos: Vec2Schema, // [x, z] metres
  facing: z.number(), // yaw radians; 0 = facing +z (toward the default camera)
  mark: MarkIdSchema.nullable(),
  holding: PropIdSchema.nullable(),
  posture: PostureSchema,
});
export type ActorState = z.infer<typeof ActorStateSchema>;

export const PropLocationSchema = z.union([MarkIdSchema, ActorIdSchema, z.literal("hidden")]);
export type PropLocation = z.infer<typeof PropLocationSchema>;

/** Where the Wolves stand when a world state predates them (by their van, facing west toward the yard). */
export const WOLF_START: Record<"wolf_a" | "wolf_b", ActorState> = {
  wolf_a: { pos: [12.1, 0.3], facing: -Math.PI / 2, mark: "van", holding: null, posture: "stand" },
  wolf_b: { pos: [12.0, -1.9], facing: -Math.PI / 2, mark: "van", holding: null, posture: "stand" },
};
/** Stable starts for saved stories that predate the expanded cast. */
export const EXTRA_START: Record<"lady_bear" | "hare" | "rosie" | "squirrel" | "rival_bear", ActorState> = {
  lady_bear: { pos: [-3.5, 0.8], facing: 0.2, mark: "clearing", holding: null, posture: "stand" },
  hare: { pos: [4.1, -4.6], facing: 0.1, mark: "garden", holding: null, posture: "stand" },
  rosie: { pos: [4, -1.1], facing: -0.3, mark: "garden", holding: null, posture: "stand" },
  squirrel: { pos: [7.2, 1.1], facing: -0.5, mark: "swing", holding: null, posture: "stand" },
  rival_bear: { pos: [-8.6, -0.5], facing: 0.3, mark: "clearing", holding: null, posture: "stand" },
};
export const ADDED_ACTOR_START = { ...WOLF_START, ...EXTRA_START };
const extraStateDefault = (id: keyof typeof EXTRA_START) =>
  ActorStateSchema.default(() => structuredClone(EXTRA_START[id]));
const wolfStateDefault = (id: "wolf_a" | "wolf_b") =>
  ActorStateSchema.default(() => JSON.parse(JSON.stringify(WOLF_START[id])) as ActorState);

export const WorldStateSchema = z.object({
  objects:z.object({house_door:z.number().min(0).max(1),kitchen_cupboard:z.number().min(0).max(1).optional()}).optional(),
  timeOfDay: TimeOfDaySchema,
  // wolf_a / wolf_b default in (additive): world states saved before the Wolves still parse.
  actors: z.object({ masha: ActorStateSchema, bear: ActorStateSchema, wolf_a: wolfStateDefault("wolf_a"), wolf_b: wolfStateDefault("wolf_b"), lady_bear: extraStateDefault("lady_bear"), hare: extraStateDefault("hare"), rosie: extraStateDefault("rosie"), squirrel: extraStateDefault("squirrel"), rival_bear: extraStateDefault("rival_bear") }),
  props: z.preprocess(value => {
    if(!value || typeof value!=='object')return value;
    const props={...value} as Record<string,unknown>;
    props.pantry_honey??={at:'cupboard'};
    const oldCarrot=props.carrot as {at?:string;planted?:boolean}|undefined;
    if(CARROT_IDS.slice(1).every(id=>!(id in props))&&oldCarrot?.at==='garden'&&oldCarrot.planted===undefined)props.carrot={...oldCarrot,planted:true};
    for(const id of CARROT_IDS)props[id]??={at:'garden',planted:true};
    return props;
  }, z.record(PropIdSchema, z.object({ at: PropLocationSchema, planted:z.boolean().optional() }))),
});
export type WorldState = z.infer<typeof WorldStateSchema>;

export const ActorClipSchema = z.object({
  start: z.number(),
  dur: z.number(),
  verb: VerbSchema,
  emotion: EmotionSchema,
  params: z.object({
    from: Vec2Schema.optional(),
    to: Vec2Schema.optional(),
    path: z.array(Vec2Schema).optional(), // [x, z] waypoints incl. from and to
    lookAt: Vec3Schema.optional(), // world point to look at
    item: PropIdSchema.optional(),
    target: z.string().optional(), // resolved target id (mark/actor/prop)
    facing: z.number().optional(), // yaw at clip start (for in-place verbs)
    posture: PostureSchema.optional(), // posture during/after the clip
    ambient: z.boolean().optional(), // true = filled in by the compiler (ambient life), not from a beat
    sceneCut: z.boolean().optional(), // short offscreen travel between separate outdoor locations
    portal:z.boolean().optional(), // visible doorway match cut, never a fade/offstage exit
    arrivalYaw:z.number().optional(),
    objectFrom:z.number().optional(),
    objectTo:z.number().optional(),
    putDown: MarkIdSchema.optional(), // compiler-authored reverse take, releases the held prop halfway through
    pickUpAt: MarkIdSchema.optional(), // explicit surface contact before an indoor prop attaches to the hand
    pickUpPosition: Vec3Schema.optional(), // exact object origin; authored or reconciled by physics
    pickUpRotation: Vec3Schema.optional(),
    putDownPosition: Vec3Schema.optional(),
    putDownRotation: Vec3Schema.optional(),
    catchesFish: z.boolean().optional(), // ownership at the catch, independent of a later put-down in the same scene
    dropAt: MarkIdSchema.optional(), // semantic fallback at release, independent of later ball ownership
  }),
});
export type ActorClip = z.infer<typeof ActorClipSchema>;

export const CamKeySchema = z.object({ pos: Vec3Schema, look: Vec3Schema, fov: z.number(), location:z.enum(['yard','house','pond','wolves']).optional(), followActor:ActorIdSchema.optional() });
export type CamKey = z.infer<typeof CamKeySchema>;

export const DialogueCueSchema = z.object({
  start: z.number(),
  dur: z.number(),
  actor: ActorIdSchema,
  text: z.string(),
  lang: LangSchema,
  visemes: z.array(z.object({ t: z.number(), v: VisemeSchema })), // t relative to cue start
});
export type DialogueCue = z.infer<typeof DialogueCueSchema>;

export const EmoteCueSchema = z.object({ start: z.number(), dur: z.number(), actor: ActorIdSchema, emote: EmoteSchema });
export type EmoteCue = z.infer<typeof EmoteCueSchema>;

export const FoleyCueSchema = z.object({
  start: z.number(),
  actor: ActorIdSchema,
  id: FoleyIdSchema,
  surface: SurfaceSchema,
  gain: z.number(),
  pan: z.number(), // -1..1, compiler's estimate relative to the planned camera (engine may re-spatialize)
});
export type FoleyCue = z.infer<typeof FoleyCueSchema>;

export const CameraCueSchema = z.object({
  start: z.number(),
  dur: z.number(),
  shot: ShotSchema,
  from: CamKeySchema,
  to: CamKeySchema,
  overridden: z.boolean(),
  cutAt:z.number().optional(), // exact segment-local time for a location cut
});
export type CameraCue = z.infer<typeof CameraCueSchema>;

export const SfxCueSchema = z.object({ start: z.number(), id: SfxIdSchema, gain: z.number(), pan: z.number() });
export type SfxCue = z.infer<typeof SfxCueSchema>;

export const IntensitySchema = z.enum(["soft", "medium", "full"]);
export type Intensity = z.infer<typeof IntensitySchema>;
export const MusicTrackCueSchema = z.object({ start: z.number(), mood: MusicMoodSchema, intensity: IntensitySchema, fade: z.number() });
export type MusicTrackCue = z.infer<typeof MusicTrackCueSchema>;
export const AmbienceCueSchema = z.object({ start: z.number(), layers: z.array(AmbienceSchema), fade: z.number() });
export type AmbienceCue = z.infer<typeof AmbienceCueSchema>;
export const DuckingCueSchema = z.object({ start: z.number(), dur: z.number(), depth: z.number() }); // depth in dB (positive = cut)
export type DuckingCue = z.infer<typeof DuckingCueSchema>;
export const LightingCueSchema = z.object({ start: z.number(), timeOfDay: TimeOfDaySchema, transition: z.number() });
export type LightingCue = z.infer<typeof LightingCueSchema>;
export const FxCueSchema = z.object({ start: z.number(), dur: z.number(), id: FxIdSchema, at: Vec3Schema });
export type FxCue = z.infer<typeof FxCueSchema>;

export const SegmentSchema = z.object({
  objectCues:z.array(z.object({object:z.enum(['house_door','kitchen_cupboard']),start:z.number(),dur:z.number(),from:z.number(),to:z.number()})).optional(),
  paragraphId: z.string(),
  version: z.number(),
  duration: z.number(),
  cast:z.array(ActorIdSchema).optional(), // named story participants; absent in old saved segments
  startState: WorldStateSchema,
  endState: WorldStateSchema,
  actorClips: z.object({
    masha: z.array(ActorClipSchema),
    bear: z.array(ActorClipSchema),
    wolf_a: z.array(ActorClipSchema).default([]), // additive (Wolves)
    wolf_b: z.array(ActorClipSchema).default([]),
    lady_bear: z.array(ActorClipSchema).default([]),
    hare: z.array(ActorClipSchema).default([]),
    rosie: z.array(ActorClipSchema).default([]),
    squirrel: z.array(ActorClipSchema).default([]),
    rival_bear: z.array(ActorClipSchema).default([]),

  }),
  dialogue: z.array(DialogueCueSchema),
  emotes: z.array(EmoteCueSchema),
  foley: z.array(FoleyCueSchema),
  camera: z.array(CameraCueSchema),
  sfx: z.array(SfxCueSchema),
  music: z.array(MusicTrackCueSchema),
  ambience: z.array(AmbienceCueSchema),
  ducking: z.array(DuckingCueSchema),
  lighting: z.array(LightingCueSchema),
  fx: z.array(FxCueSchema),
});
export type Segment = z.infer<typeof SegmentSchema>;
// All cue times inside a Segment are LOCAL to the segment (0 = segment start).
// Episode timeline = concatenation; segment i starts at Σ duration(0..i-1).

/** An episode timeline: segments with their absolute start offsets. */
export interface Timeline {
  segments: { offset: number; segment: Segment }[];
  duration: number;
}

// ---------- Remix (§6.5.6) ----------
export const RemixSchema = z.object({
  cameraSeed: z.number(),
  timeOfDay: TimeOfDaySchema.nullable(), // null = as directed
  musicMood: MusicMoodSchema.nullable(), // null = as directed
});
export type Remix = z.infer<typeof RemixSchema>;
export const DEFAULT_REMIX: Remix = { cameraSeed: 0, timeOfDay: null, musicMood: null };

// ---------- 8.1 Director endpoint ----------
export const DIRECTOR_MODELS = ["claude-opus-5-5", "claude-haiku-5-5"] as const;
export const DirectorModelSchema = z.enum(DIRECTOR_MODELS);
export type DirectorModel = z.infer<typeof DirectorModelSchema>;

export const DirectRequestSchema = z.object({
  lang: LangSchema,
  paragraph: z.string(),
  previous: z.array(z.string()),
  worldState: WorldStateSchema,
  episodeId: z.string(),
  paragraphId: z.string(),
  model: DirectorModelSchema.optional(),
});
export type DirectRequest = z.infer<typeof DirectRequestSchema>;

export const UsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_input_tokens: z.number(),
  cache_creation_input_tokens: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const BeatScriptSourceSchema = z.enum(["llm", "offline", "fixture"]);
export type BeatScriptSource = z.infer<typeof BeatScriptSourceSchema>;

export const DirectResponseSchema = z.object({
  beatScript: BeatScriptSchema,
  source: z.enum(["llm", "offline"]),
  latencyMs: z.number(),
  usage: UsageSchema.nullable(),
  model: z.string(),
  error: z.string().optional(),
});
export type DirectResponse = z.infer<typeof DirectResponseSchema>;

// ---------- 4.2 Tracking log entry ----------
export interface LogEntry {
  episodeId: string;
  paragraphId: string;
  version: number;
  text: string;
  lang: Lang;
  beatScript: BeatScript;
  source: BeatScriptSource;
  latencyMs: number;
  usage: Usage | null;
  ruleHits: RuleHit[];
  ts: number;
}

// ---------- Fixtures (§6.6) ----------
export interface FixtureParagraph {
  text: string;
  beatScript: BeatScript;
}
export interface FixtureEpisode {
  id: "garden_party" | "pancake_morning" | "bears_nap" | "fishing_trip" | "cozy_evening";
  lang: Lang;
  title: string;
  paragraphs: FixtureParagraph[];
}
