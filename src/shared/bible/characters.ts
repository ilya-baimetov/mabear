// Character bible (spec §8.3). TO VERIFY against the Animaccord series bible — editable data, not code.
import type { ActorId, Emote, Lang } from "../schema";

export interface VoiceProfile {
  /** BCP-47 per language */
  lang: Record<Lang, string>;
  pitch: number;
  rate: number;
}

export interface CharacterBible {
  id: ActorId;
  name: Record<Lang, string>;
  speaks: boolean;
  voice: VoiceProfile | null;
  emotes: Emote[];
  personality: string;
  motionStyle: string;
  signatures: string[];
  /** Short in-language interjections Masha uses for vocal emotes (TTS). */
  interjections?: Partial<Record<Emote, Record<Lang, string>>>;
}

export const BIBLE_VERSION = "2026-11-06.cast-3"; // .2: the Wolves (wolf_a, wolf_b) joined the cast

export const CHARACTERS: Record<ActorId, CharacterBible> = {
  lady_bear: {
    id: "lady_bear", name: { en: "Lady Bear", ru: "Медведица" }, speaks: false, voice: null,
    emotes: ["grunt", "hum", "chuckle", "sigh", "huff", "gasp", "yawn", "snore", "sneeze", "hmph", "laugh"],
    personality: "Warm, graceful and sociable. Bear admires her. She enjoys flowers, music and gardening; kind but independent. Never speaks words.",
    motionStyle: "Graceful measured steps, gentle gestures and composed posture.", signatures: [],
  },
  hare: {
    id: "hare", name: { en: "Hare", ru: "Заяц" }, speaks: false, voice: null,
    emotes: ["grunt", "hum", "chuckle", "sigh", "huff", "gasp", "yawn", "snore", "sneeze", "hmph", "laugh"],
    personality: "A quick, cheeky carrot-loving garden visitor. Steals a carrot, startles, then shares. Wordless and playful, never cruel.",
    motionStyle: "Light springy steps, curious head tilts and energetic hops.", signatures: [],
  },
  rosie: {
    id: "rosie", name: { en: "Rosie", ru: "Свинка" }, speaks: false, voice: null,
    emotes: ["grunt", "hum", "chuckle", "sigh", "huff", "gasp", "yawn", "snore", "sneeze", "hmph", "laugh"],
    personality: "Masha's cheerful pet pig, also called Розочка or Свинка. Loves dancing, music, gardening and playful games. Wordless.",
    motionStyle: "Plump buoyant body, short waddling steps and enthusiastic dancing.", signatures: [],
  },
  squirrel: {
    id: "squirrel", name: { en: "Squirrel", ru: "Белочка" }, speaks: false, voice: null,
    emotes: ["grunt", "hum", "chuckle", "sigh", "huff", "gasp", "yawn", "snore", "sneeze", "hmph", "laugh"],
    personality: "An alert red squirrel with a large fluffy tail. Loves pinecones and the forest, mischievous but friendly. Wordless.",
    motionStyle: "Tiny rapid steps, quick head turns and lively hops.", signatures: [],
  },
  rival_bear: {
    id: "rival_bear", name: { en: "Rival Bear", ru: "Медведь-спортсмен" }, speaks: false, voice: null,
    emotes: ["grunt", "hum", "chuckle", "sigh", "huff", "gasp", "yawn", "snore", "sneeze", "hmph", "laugh"],
    personality: "The athletic Himalayan Bear, a confident show-off with a white chest crescent. Friendly sporting rival to Bear; admiration for Lady Bear stays playful. Wordless.",
    motionStyle: "Broad shoulders, proud stance, energetic deliberate steps and athletic gestures.", signatures: [],
  },

  masha: {
    id: "masha",
    name: { en: "Masha", ru: "Маша" },
    speaks: true,
    voice: { lang: { en: "en-US", ru: "ru-RU" }, pitch: 1.6, rate: 1.05 },
    emotes: ["giggle", "laugh", "gasp", "wheee", "hmph", "uh_oh", "yawn", "cry", "cheer", "scream_fun", "sneeze", "hum", "sigh"],
    personality:
      "A small, fearless, endlessly curious, talkative, mischievous girl with a huge heart. She rarely walks when she can run; loves sweets, jam, games and being the center of attention; causes chaos innocently and then charms her way out; talks a lot, asks questions, gives Bear orders, laughs loudly. Mischievous but never cruel.",
    motionStyle: "Quick, bouncy, never still — idle is a fidget loop (rocking on heels, looking around).",
    signatures: ["runs everywhere", "giggles", "gives Bear orders", "spins and jumps with joy", "sneaks up to surprise Bear"],
    interjections: {
      giggle: { en: "Hee-hee!", ru: "Хи-хи!" },
      laugh: { en: "Ha-ha-ha!", ru: "Ха-ха-ха!" },
      gasp: { en: "Oh!", ru: "Ой!" },
      wheee: { en: "Wheee!", ru: "Уиии!" },
      hmph: { en: "Hmph!", ru: "Хм!" },
      uh_oh: { en: "Uh-oh!", ru: "Ой-ой!" },
      yawn: { en: "Aaah-hm.", ru: "Аааа-хм." },
      cry: { en: "Waaah!", ru: "Ыыы!" },
      cheer: { en: "Hooray!", ru: "Ура!" },
      scream_fun: { en: "Aaaah!", ru: "Аааа!" },
      sneeze: { en: "Ah-choo!", ru: "Апчхи!" },
      hum: { en: "La-la-la!", ru: "Ля-ля-ля!" },
      sigh: { en: "Ohhh.", ru: "Эх." },
    },
  },
  bear: {
    id: "bear",
    name: { en: "Bear", ru: "Медведь" },
    speaks: false, // canon, to be confirmed by Animaccord; flipping this flag is the only change needed
    voice: null,
    emotes: ["grunt", "sigh", "hum", "growl_soft", "chuckle", "snore", "huff", "roar_soft", "yawn", "laugh", "gasp", "sneeze", "hmph"],
    personality:
      "A big, kind, retired circus bear who loves peace and routine — his garden, beehives, fishing, cooking, napping. Patient and paternal; exasperated by Masha's chaos but always forgives and protects her. NEVER speaks words: he communicates with gestures, sighs, grunts, hums and facial expressions. Secretly enjoys her company. Never aggressive toward Masha.",
    motionStyle: "Slow, weighty, patient; lower hips, wide stance; tender when hugging or carrying Masha.",
    signatures: ["facepalm", "long sigh", "gentle hug", "carrying Masha on his shoulders", "humming while cooking or gardening"],
  },
  wolf_a: {
    id: "wolf_a",
    name: { en: "Big Wolf", ru: "Большой Волк" },
    speaks: false, // verify with Animaccord: the Wolves stay wordless in this prototype (rule wolves_silent)
    voice: null,
    emotes: ["howl", "whimper", "snicker", "gasp", "grunt", "sigh", "huff", "yawn", "snore", "sneeze", "hmph"],
    personality:
      "One of the two Wolves (canon series characters) who live in the old ambulance van at the forest edge. Lanky, clumsy and ALWAYS hungry; forever scheming to pinch food — Bear's honey, Masha's jam, pancakes, fish — and their plans always go comically wrong. Cowardly: terrified of Bear (one look from him and they cower, whimper and flee). Wordless here: they howl, whimper and snicker. The taller one: the ringleader who hatches the plans.",
    motionStyle: "Lanky, light and quick; sneaky tiptoeing with hunched shoulders, long loose limbs, tail swishing; startles easily and scrambles away.",
    signatures: ["sneaking up on food on tiptoe", "snickering over a plan", "cowering and whimpering when Bear turns around", "howling together", "fleeing back to the van"],
  },
  wolf_b: {
    id: "wolf_b",
    name: { en: "Little Wolf", ru: "Маленький Волк" },
    speaks: false, // verify with Animaccord: the Wolves stay wordless in this prototype (rule wolves_silent)
    voice: null,
    emotes: ["howl", "whimper", "snicker", "gasp", "grunt", "sigh", "huff", "yawn", "snore", "sneeze", "hmph"],
    personality:
      "One of the two Wolves (canon series characters) who live in the old ambulance van at the forest edge. Lanky, clumsy and ALWAYS hungry; forever scheming to pinch food — Bear's honey, Masha's jam, pancakes, fish — and their plans always go comically wrong. Cowardly: terrified of Bear (one look from him and they cower, whimper and flee). Wordless here: they howl, whimper and snicker. The shorter one: the eager sidekick who usually bungles them.",
    motionStyle: "Lanky, light and quick; sneaky tiptoeing with hunched shoulders, long loose limbs, tail swishing; startles easily and scrambles away.",
    signatures: ["sneaking up on food on tiptoe", "snickering over a plan", "cowering and whimpering when Bear turns around", "howling together", "fleeing back to the van"],
  },
};

export const RELATIONSHIP =
  "Masha initiates, Bear reacts. The Wolves scheme for food, Bear catches them, they flee; Masha laughs (she is never their victim, and they are never really hurt). Slapstick consequences land softly. Every scene ends warm.";
