// Action grammar (spec §6.2). FROZEN after M1: additive changes only.
import type { ActorId, Emote, FoleyId, Verb } from "./schema";
import { ACTOR_IDS, WOLF_IDS } from "./schema";

export type VerbTarget = "mark" | "actor" | "prop" | "mark_or_actor" | "none";
export type VerbGroup = "locomotion" | "body" | "gesture" | "emotion" | "objects";

/** When an automatic sound fires for a verb. */
export interface FoleyRule {
  id: FoleyId;
  /** "contacts" = on every foot contact of the gait cycle; "start"/"end" = clip start/end;
   *  "at" = at fraction `t` of the clip; "loop" = repeat every `every` seconds through the clip. */
  when: "contacts" | "start" | "end" | "at" | "loop";
  t?: number;
  every?: number;
  gain?: number;
}

export interface VerbDef {
  id: Verb;
  group: VerbGroup;
  actors: ActorId[];
  target: VerbTarget;
  needsItem: boolean;
  /** seconds; locomotion verbs use path length / speed instead (this is the minimum) */
  baseDuration: number;
  loopable: boolean;
  foley: FoleyRule[];
  effortVocal: Emote | null;
  description: string;
}

const BOTH: ActorId[] = ["masha", "bear"];
/** Everyone incl. the Wolves (appended after M1, additive). Wolves get locomotion, body, gesture, emotion and the
 *  simple object verbs; not the household chores/signatures (cook, fish, swing, carry, water_plants, facepalm). */
const ALL: ActorId[] = [...ACTOR_IDS];
const STEPS: FoleyRule[] = [{ id: "footstep", when: "contacts" }];

const defs: VerbDef[] = [
  {id:'open',group:'objects',actors:ALL,target:'mark',needsItem:false,baseDuration:1.4,loopable:false,foley:[],effortVocal:null,description:'Open the house door (target door) or Bear’s kitchen cupboard (target cupboard; Bear only). Does not enter; use walk_to house_living afterwards.'},
  {id:'close',group:'objects',actors:ALL,target:'mark',needsItem:false,baseDuration:1.4,loopable:false,foley:[],effortVocal:null,description:'Close the house door (target door), or the kitchen cupboard (target cupboard; Bear only).'},
  // Locomotion
  { id: "walk_to", group: "locomotion", actors: ALL, target: "mark_or_actor", needsItem: false, baseDuration: 1.5, loopable: true, foley: STEPS, effortVocal: null, description: "Walk to a mark or up to another character." },
  { id: "run_to", group: "locomotion", actors: ALL, target: "mark_or_actor", needsItem: false, baseDuration: 1.0, loopable: true, foley: [...STEPS, { id: "cloth_rustle", when: "start" }], effortVocal: null, description: "Run to a mark or a character (Masha's default way of moving)." },
  { id: "tiptoe_to", group: "locomotion", actors: ALL, target: "mark_or_actor", needsItem: false, baseDuration: 2.0, loopable: true, foley: [{ id: "footstep", when: "contacts", gain: 0.35 }], effortVocal: null, description: "Sneak quietly on tiptoes to a mark or a character." },
  { id: "chase", group: "locomotion", actors: ALL, target: "actor", needsItem: false, baseDuration: 3.0, loopable: true, foley: [...STEPS, { id: "cloth_rustle", when: "start" }], effortVocal: null, description: "Run after another character around the yard." },
  { id: "enter", group: "locomotion", actors: ALL, target: "none", needsItem: false, baseDuration: 3.0, loopable: false, foley: STEPS, effortVocal: null, description: "Arrive into the yard from the forest path (path_entry) to the clearing." },
  { id: "exit", group: "locomotion", actors: ALL, target: "none", needsItem: false, baseDuration: 3.0, loopable: false, foley: STEPS, effortVocal: null, description: "Leave the yard along the forest path (path_entry) and go offstage." },
  // Body
  { id: "idle", group: "body", actors: ALL, target: "none", needsItem: false, baseDuration: 2.0, loopable: true, foley: [], effortVocal: null, description: "Stand and fidget in character (a pause or reaction time)." },
  { id: "jump", group: "body", actors: ALL, target: "none", needsItem: false, baseDuration: 1.0, loopable: false, foley: [{ id: "landing_thud", when: "at", t: 0.75 }], effortVocal: "huff", description: "Jump up in place (joy or excitement)." },
  { id: "spin", group: "body", actors: ALL, target: "none", needsItem: false, baseDuration: 1.4, loopable: false, foley: [{ id: "cloth_rustle", when: "start" }], effortVocal: "wheee", description: "Spin around on the spot." },
  { id: "dance", group: "body", actors: ALL, target: "none", needsItem: false, baseDuration: 4.0, loopable: true, foley: STEPS, effortVocal: null, description: "Dance happily (Bear: an old circus routine)." },
  { id: "sit", group: "body", actors: ALL, target: "mark", needsItem: false, baseDuration: 1.2, loopable: false, foley: [{ id: "cloth_rustle", when: "end" }], effortVocal: null, description: "Sit down (on the bench, porch steps, the ground); target is where." },
  { id: "stand_up", group: "body", actors: ALL, target: "none", needsItem: false, baseDuration: 1.0, loopable: false, foley: [{ id: "cloth_rustle", when: "start" }], effortVocal: "grunt", description: "Get up from sitting or lying." },
  { id: "fall_down", group: "body", actors: ALL, target: "none", needsItem: false, baseDuration: 1.6, loopable: false, foley: [{ id: "body_fall", when: "at", t: 0.4 }], effortVocal: "uh_oh", description: "Slapstick tumble onto the bottom; lands softly, no injury." },
  { id: "sleep", group: "body", actors: ALL, target: "mark", needsItem: false, baseDuration: 4.0, loopable: true, foley: [], effortVocal: "snore", description: "Lie down and sleep (Bear: in the hammock). Posture becomes sleep." },
  { id: "wake_up", group: "body", actors: ALL, target: "none", needsItem: false, baseDuration: 1.6, loopable: false, foley: [{ id: "cloth_rustle", when: "start" }], effortVocal: "yawn", description: "Wake up and get up from sleeping." },
  { id: "yawn_stretch", group: "body", actors: ALL, target: "none", needsItem: false, baseDuration: 2.0, loopable: false, foley: [], effortVocal: "yawn", description: "A big yawn with arms stretched." },
  { id: "hide", group: "body", actors: ALL, target: "mark", needsItem: false, baseDuration: 2.0, loopable: true, foley: [{ id: "cloth_rustle", when: "start" }], effortVocal: null, description: "Hide behind a mark (big_tree, bush, van, woodpile) and crouch." },
  { id: "peek", group: "body", actors: ALL, target: "mark_or_actor", needsItem: false, baseDuration: 1.6, loopable: false, foley: [], effortVocal: null, description: "Peek out from hiding, or peek at someone/something." },
  // Gesture
  { id: "wave", group: "gesture", actors: ALL, target: "mark_or_actor", needsItem: false, baseDuration: 1.4, loopable: true, foley: [], effortVocal: null, description: "Wave hello or to get attention (target optional)." },
  { id: "clap", group: "gesture", actors: ALL, target: "none", needsItem: false, baseDuration: 1.2, loopable: true, foley: [{ id: "clap", when: "loop", every: 0.3 }], effortVocal: null, description: "Clap hands with delight." },
  { id: "point_at", group: "gesture", actors: ALL, target: "mark_or_actor", needsItem: false, baseDuration: 1.2, loopable: false, foley: [], effortVocal: null, description: "Point at a mark, a character or a prop." },
  { id: "look_at", group: "gesture", actors: ALL, target: "mark_or_actor", needsItem: false, baseDuration: 1.0, loopable: false, foley: [], effortVocal: null, description: "Turn the head and look at a mark, character or prop." },
  { id: "nod", group: "gesture", actors: ALL, target: "none", needsItem: false, baseDuration: 1.0, loopable: false, foley: [], effortVocal: null, description: "Nod yes." },
  { id: "shake_head", group: "gesture", actors: ALL, target: "none", needsItem: false, baseDuration: 1.0, loopable: false, foley: [], effortVocal: null, description: "Shake the head no." },
  { id: "shrug", group: "gesture", actors: ALL, target: "none", needsItem: false, baseDuration: 1.0, loopable: false, foley: [], effortVocal: null, description: "Shrug: who knows?" },
  { id: "facepalm", group: "gesture", actors: ALL, target: "none", needsItem: false, baseDuration: 2.0, loopable: false, foley: [], effortVocal: "sigh", description: "Bear's signature: paw over the face in long-suffering exasperation." },
  { id: "hug", group: "gesture", actors: ALL, target: "actor", needsItem: false, baseDuration: 2.0, loopable: false, foley: [{ id: "cloth_rustle", when: "start" }], effortVocal: null, description: "Hug another character (walks up first if needed)." },
  // Emotion
  { id: "laugh", group: "emotion", actors: ALL, target: "none", needsItem: false, baseDuration: 1.6, loopable: true, foley: [], effortVocal: "laugh", description: "Laugh out loud." },
  { id: "cry", group: "emotion", actors: ALL, target: "none", needsItem: false, baseDuration: 2.0, loopable: true, foley: [], effortVocal: "cry", description: "Cry (briefly; scenes end warm)." },
  { id: "sulk", group: "emotion", actors: ALL, target: "none", needsItem: false, baseDuration: 2.0, loopable: true, foley: [], effortVocal: "hmph", description: "Sulk with arms crossed, turned away." },
  { id: "surprised", group: "emotion", actors: ALL, target: "none", needsItem: false, baseDuration: 1.0, loopable: false, foley: [], effortVocal: "gasp", description: "A startled jolt of surprise." },
  { id: "scared", group: "emotion", actors: ALL, target: "none", needsItem: false, baseDuration: 1.4, loopable: false, foley: [], effortVocal: "gasp", description: "A comic fright: cower, then peek." },
  { id: "angry_stomp", group: "emotion", actors: ALL, target: "none", needsItem: false, baseDuration: 1.4, loopable: false, foley: [{ id: "ground_thump", when: "at", t: 0.3 }, { id: "ground_thump", when: "at", t: 0.7 }], effortVocal: "hmph", description: "Stomp the feet in a (comic) temper." },
  { id: "sneeze", group: "emotion", actors: ALL, target: "none", needsItem: false, baseDuration: 1.4, loopable: false, foley: [], effortVocal: "sneeze", description: "A big wind-up sneeze (e.g. from flour)." },
  { id: "sigh", group: "emotion", actors: ALL, target: "none", needsItem: false, baseDuration: 1.6, loopable: false, foley: [], effortVocal: "sigh", description: "A long sigh: shoulders rise and fall." },
  // Objects
  { id: "drop", group: "objects", actors: ["masha"], target: "none", needsItem: true, baseDuration: 1.2, loopable: false, foley: [], effortVocal: null, description: "Masha lets go of the ball halfway through the gesture. Local Rapier trial supplies the fall; animation-only playback places it at its resting mark." },
  { id: "nudge", group:"objects", actors:["masha"], target:"mark", needsItem:true, baseDuration:1.8, loopable:false, foley:[], effortVocal:null, description:"Push the resting ball left off the bench with a free hand. The ball stays free; never pick it up as a prerequisite." },
  { id: "put_down", group: "objects", actors: ALL, target: "mark", needsItem: true, baseDuration: 2, loopable: false, foley: [{id:"prop_putdown",when:"at",t:.5}], effortVocal:null, description:"Place a held carrot on a bench, table, garden path, clearing, kitchen_bowl or kitchen_pot; Bear reaches the pot, Masha and Bear reach the bowl. Masha may also place a held ball on the bench. Animation keeps contact through release; never replant it." },
  { id: "take", group: "objects", actors: ALL, target: "prop", needsItem: true, baseDuration: 1.0, loopable: false, foley: [{ id: "prop_pickup", when: "at", t: 0.5 }], effortVocal: null, description: "Pick up a prop (walks to it first if needed). item = the prop." },
  { id: "give", group: "objects", actors: ALL, target: "actor", needsItem: true, baseDuration: 1.4, loopable: false, foley: [{ id: "prop_pickup", when: "at", t: 0.6 }], effortVocal: null, description: "Hand the held item to another character. item = the prop, target = the receiver." },
  { id: "eat", group: "objects", actors: ALL, target: "none", needsItem: true, baseDuration: 2.0, loopable: true, foley: [{ id: "munch", when: "loop", every: 0.45 }], effortVocal: null, description: "Eat a held food item (jam, honey, pancakes, carrot, cake, lollipop)." },
  { id: "throw", group: "objects", actors: ALL, target: "mark_or_actor", needsItem: true, baseDuration: 1.2, loopable: false, foley: [{ id: "cloth_rustle", when: "at", t: 0.4 }], effortVocal: "huff", description: "Throw the held item toward a mark or a character (soft, playful)." },
  { id: "cook", group: "objects", actors: BOTH, target: "mark_or_actor", needsItem: false, baseDuration: 4.0, loopable: true, foley: [{ id: "sizzle_loop", when: "start" }], effortVocal: "hum", description: "Cook pancakes with the frying pan; optional target house_kitchen or table. Without a target, use the kitchen when indoors, otherwise the outdoor table." },
  { id: "fish", group: "objects", actors: BOTH, target: "none", needsItem: false, baseDuration: 4.0, loopable: true, foley: [{ id: "splash_small", when: "at", t: 0.3 }], effortVocal: null, description: "Fish with the fishing rod at the pier." },
  { id: "swing", group: "objects", actors: ["masha"], target: "none", needsItem: false, baseDuration: 4.0, loopable: true, foley: [{ id: "rope_creak", when: "loop", every: 1.2 }], effortVocal: "wheee", description: "Masha swings on the rope swing." },
  { id: "carry", group: "objects", actors: ["bear"], target: "actor", needsItem: false, baseDuration: 3.0, loopable: true, foley: [{ id: "cloth_rustle", when: "start" }], effortVocal: "grunt", description: "Bear lifts Masha onto his shoulders (she rides there until a later beat puts her down)." },
  { id: "water_plants", group: "objects", actors: ALL.filter(a => !isWolf(a)), target: "none", needsItem: false, baseDuration: 3.0, loopable: true, foley: [{ id: "water_pour", when: "start" }], effortVocal: "hum", description: "Water the garden with the watering can." },
];

export const GRAMMAR: Record<Verb, VerbDef> = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<Verb, VerbDef>;
export const LOCOMOTION_VERBS: Verb[] = ["walk_to", "run_to", "tiptoe_to", "chase", "enter", "exit"];

/** Locomotion speeds in m/s (§7.4). */
export const SPEEDS: Record<ActorId, { walk_to: number; run_to: number; tiptoe_to: number; chase: number; enter: number; exit: number }> = {
  lady_bear: { walk_to: 1, run_to: 2.1, tiptoe_to: 0.50, chase: 2.1, enter: 1, exit: 1 },
  hare: { walk_to: 1.1, run_to: 3.4, tiptoe_to: 0.55, chase: 3.4, enter: 1.1, exit: 1.1 },
  rosie: { walk_to: 0.8, run_to: 1.8, tiptoe_to: 0.40, chase: 1.8, enter: 0.8, exit: 0.8 },
  squirrel: { walk_to: 0.9, run_to: 2.8, tiptoe_to: 0.45, chase: 2.8, enter: 0.9, exit: 0.9 },
  rival_bear: { walk_to: 1.2, run_to: 3.0, tiptoe_to: 0.60, chase: 3.0, enter: 1.2, exit: 1.2 },

  masha: { walk_to: 1.2, run_to: 3.0, tiptoe_to: 0.6, chase: 3.0, enter: 1.5, exit: 1.5 },
  bear: { walk_to: 1.0, run_to: 2.2, tiptoe_to: 0.6, chase: 2.2, enter: 1.0, exit: 1.0 },
  // Wolves: lanky, light, quick and sneaky.
  wolf_a: { walk_to: 1.3, run_to: 3.2, tiptoe_to: 0.7, chase: 3.2, enter: 1.4, exit: 1.4 },
  wolf_b: { walk_to: 1.3, run_to: 3.2, tiptoe_to: 0.7, chase: 3.2, enter: 1.4, exit: 1.4 },
};

/** Stride length per foot contact (m); footsteps = distance / stride. */
export const STRIDE: Record<ActorId, number> = { masha: 0.35, bear: 0.7, wolf_a: 0.55, wolf_b: 0.55, lady_bear: 0.6, hare: 0.25, rosie: 0.3, squirrel: 0.18, rival_bear: 0.75 };

/** Where in-place object verbs happen (the compiler walks the actor there first). */
export const VERB_HOME_MARK: Partial<Record<Verb, string>> = {
  cook: "table",
  fish: "pier",
  swing: "swing",
  water_plants: "garden",
};
/** Props an object verb implies if not held. */
export const VERB_IMPLIED_PROP: Partial<Record<Verb, string>> = {
  cook: "frying_pan",
  fish: "fishing_rod",
  water_plants: "watering_can",
};

/** Metres per foot contact relative to STRIDE, per gait (additive). Shared by the engine's leg cycle and the
 *  compiler's foley contacts so footsteps land on the feet. */
export const STRIDE_SCALE = { walk: 1, run: 1.8, tiptoe: 0.6 } as const;
export type Gait = keyof typeof STRIDE_SCALE;
/** A walk hurried past this multiple of the actor's natural walk speed switches to a run gait (additive). */
export const WALK_TO_RUN_SPEED_FACTOR = 1.7;

/** True for the Wolves (wolf_a / wolf_b). */
export function isWolf(id: ActorId | string): id is "wolf_a" | "wolf_b" {
  return (WOLF_IDS as readonly string[]).includes(id);
}
