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

export const BIBLE_VERSION = "2026-11-05.1";

export const CHARACTERS: Record<ActorId, CharacterBible> = {
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
};

export const RELATIONSHIP =
  "Masha initiates, Bear reacts. Slapstick consequences land softly. Every scene ends warm.";
