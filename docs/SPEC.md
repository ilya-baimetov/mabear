# MaBear — Script-to-Cartoon Studio · Prototype Spec v1

> **Confidential — prepared under contract for Animaccord.** Internal funding prototype. Not for public release.
> Working title "MaBear". Masha and the Bear characters are Animaccord IP; the stand-in rigs here exist only to
> demonstrate the system to Animaccord and its prospective funders.

This document is the single source of truth for an autonomous build run (`/goal`). Where it is silent, choose the
simplest option that keeps the Definition of Done (§14) achievable, and log the decision in `docs/NOTES.md`.
**Never stop to ask the user a question during the run.**

---

## 0. One-paragraph summary

**What it is:** a fan-fiction game — an online play space where kids and fans write their own Masha and the Bear
stories and watch them come alive. **What it is not:** a production tool. The studio will never make episodes with
it, and it doesn't try to reproduce the nuance animators put in by hand. The quality bar is "delightful, on-model fan
content that Animaccord is happy to carry its name", not episode parity.

A web app where a child writes a cartoon script **paragraph by paragraph** ("Masha sneaks into Bear's garden. She
steals a carrot.") and each paragraph is rendered, within seconds, into an animated 3D scene starring Masha and the
Bear — with motion, camera cuts, Masha's voice + lip-sync, music and SFX. Because the system knows the characters
deeply (personality, signature behaviors, canon rules), **a few words expand into rich, in-character staging**.

**The thesis being demonstrated: no diffusion.** Every character, set and prop of the series already exists as
production 3D (characters, rigs, houses, forest, trees, creek, the Wolves' ambulance van…). So the only thing to
*generate* is a small **3D world-state timeline**: who moves where, body motion, faces and emotions, lines and
sounds, camera, light. The frames come from ordinary real-time 3D rendering **on the user's own device**. That is
orders of magnitude less compute than diffusion, which is what lets one service reach ~10 million users without a
massive data center.

**Where the intelligence comes from.** In production it comes from a model trained on Animaccord's archive:
hundreds of hours of produced episodes, where every script line is already aligned with the actions, motion
sequences, faces, exclamations, sounds and emotions that realized it. This is a perfect, proprietary text↔3D-timeline
dataset. The prototype **cannot** train that model. It approximates each learned layer with a stand-in:

| Layer | Production (what the funding builds) | Prototype stand-in (tonight) |
|---|---|---|
| Text → staging plan | Model trained on Animaccord scripts aligned with episode timelines, plus the character bible (the writers' implicit knowledge, made explicit and partly derivable from the footage) | Claude + a written character bible (prompt) → a validated **beat script** (§6.3) |
| Plan → body motion | Learned text-to-motion trained on episode character animation | Open motion-capture/animation clip libraries retargeted onto the rigs (§7.4) |
| Faces, lip-sync, exclamations | Learned from episode facial animation and audio | Procedural face rig: emotions, blinks, visemes from text |
| Characters, sets, props | Animaccord's existing production 3D sources | Stand-in models built in code, as close to the originals as possible |
| Voice, music, SFX | Studio voices, score, SFX library | Browser TTS, synthesized music and SFX |
| Rendering | Real-time 3D on the user's device | **Same, live** |
| Canon and safety | Studio rulebook + review of public posts | **Live**: prompt + deterministic validator (§9) |

A deterministic **compiler** turns the beat script into the timed timeline (a few KB); the browser renders it. The
result is on-model by construction, fully editable after generation, and the canon/safety rules apply **before**
anything is rendered.

## 1. Audience and what the prototype must prove

Primary audience: **Animaccord leadership and prospective funders** (live demo, ~5 minutes, laptop + Chrome).
Secondary: a child or fan (7+) playing with it hands-on in that demo. The product UI is for players only; the
funder evidence (economics, system layers, data view) lives in a hidden **Behind the scenes** overlay (§4.4).

| # | Demo moment | Funder question answered | Priority |
|---|---|---|---|
| D1 | Type a 1–2 sentence paragraph → animated scene plays in seconds | Does the magic work? | P0 |
| D2 | Rewrite paragraph 2 → only paragraph 2 re-renders; the rest is cached | Is iteration fast and cheap? | P0 |
| D3 | Terse script ("Bear naps. Masha wakes him.") → rich in-character staging | Is the character knowledge the moat? | P0 |
| D4 | "Bear says thank you" / "Masha grabs a knife" → adjusted; the rule shown | Will studio and parents trust it? | P0 |
| D5 | Behind-the-scenes "Economics" panel (§4.4): plan size (KB), on-device FPS, server cost per paragraph, and a 10-million-user projection vs diffusion video | Do the economics hold at internet scale? | P0 |
| D6 | EN ⇄ RU toggle: UI, Masha's lines and voice switch | International? | P0 |
| D7 | Player "remix" buttons on a paragraph (🎥 another camera, ☀️/🌙 time of day, 🎵 music mood) → instant local re-render, $0, no AI call | Why not video diffusion? | P1 |
| D8 | Behind-the-scenes data view: the paragraph's timeline as tracks, labeled "every produced episode already exists in this format → training data" | Is the data moat real? | P1 |
| D9 | Tap a character after the episode ends → reaction (playable scene) | Interactivity | P2 |
| D10 | Sound is part of the script: "It starts to rain. Spooky music. Masha runs home shouting 'Bear!'" → rain ambience, the music shifts, splashy running footsteps, Masha's voice; characters audibly breathe, grunt and giggle as they move | Does it feel like an episode, not a tech demo? | P0 |

## 2. Honesty labels (mandatory, in the Behind-the-scenes overlay)

The prototype must never pretend a layer exists when it doesn't. The overlay shows a "System layers" legend rendering
the §0 table: each row tagged **Live**, **Stand-in** or **Placeholder**, each with its production counterpart. The
legend also states: "In production, the text→plan and plan→motion layers are one model trained on Animaccord's
episode archive. Here they are approximated by Claude + a character bible and by open motion libraries."

## 3. Out of scope (do not build)

User accounts, server-side persistence (use `localStorage`), public sharing/feed, mobile layout (desktop Chrome only;
must not break below 1280 px but needn't be pretty), training any model, official assets (but keep them a drop-in
swap, §7.3), interior sets (P2 at most), more than three characters, speech input (voice dictation comes later),
any studio/production tooling (shot-by-shot editing, dope-sheet editing, mixing consoles).

---

## 4. UX specification

### 4.1 Layout (desktop, ≥1280×720)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MaBear · [Story title]       ▶ Play all   ⟲ New   Examples ▾   EN|RU   🔊         │
├───────────────────────────┬──────────────────────────────────────────────────┤
│ SCRIPT (paragraph cards)  │                                                  │
│ ┌───────────────────────┐ │                 STAGE (Three.js)                  │
│ │1 Masha runs into the  │ │                                                  │
│ │  yard, shouting.  ✅7s │ │                                                  │
│ └───────────────────────┘ │                                                  │
│ ┌───────────────────────┐ │                                                  │
│ │2 Bear is asleep in a  │ │──────────────────────────────────────────────────│
│ │  hammock... ⏳        │ │ STORY BAR: ¶1 | ¶2 | ¶3  (one colored band per   │
│ └───────────────────────┘ │ paragraph, playhead, click/drag to scrub)         │
│ [ + add paragraph ]       │                                                  │
└───────────────────────────┴──────────────────────────────────────────────────┘
Behind the scenes (funder overlay, hidden by default): a right drawer for the selected paragraph (§4.4).
```

### 4.2 Paragraph = unit of tracking

Each paragraph card has: index, editable text (textarea that auto-grows), status chip, duration, a one-line director
summary (in UI language), small audio chips (🎵 music mood, 🌧 ambience, 💬 number of spoken lines), version counter,
and a ⋯ menu (delete, revert to previous version — P1, move up/down — P2).

**How the child writes sound and speech** (plain language, no special syntax required, both languages):
- Speech: quoted text after a speaker, or screenplay style — `Masha shouts, "Bear, wake up!"` /
  `MASHA: Bear, wake up!` / `Маша кричит: «Мишка, вставай!»`. The child's words are **kept verbatim** (only trimmed
  to ≤ 120 characters and passed through the safety rules). Without quotes, the director may write short in-character
  lines.
- Music: "Cheerful music plays", "spooky music", "the music stops", «играет весёлая музыка».
- Background: "It starts to rain", "birds are singing", "a thunderstorm", «ночь, стрекочут сверчки».
- Event sounds: "the door slams", "a loud crash", "thunder", «бах!».
- Movement sounds are automatic. The child never has to write "footsteps".

Status lifecycle: `draft` (edited, not yet sent) → `directing` (LLM call in flight; show the offline preview, see
§6.5) → `ready` → or `adjusted` (ready, but canon/safety rules changed something; amber chip, tooltip with kid-friendly
message) → or `error` (red chip, Retry button; the offline-parser version still plays).

Triggers: render when the user stops typing for **1.5 s**, on blur, or on Ctrl/Cmd+Enter. Enter on an empty last line
creates a new paragraph. A version is created only when the text actually changed (trimmed, whitespace-normalized).

Every paragraph version is appended to a local **tracking log** (`localStorage: mabear.log`): `{episodeId,
paragraphId, version, text, lang, beatScript, source: "llm"|"offline", latencyMs, usage, ruleHits, ts}`. The
Behind-the-scenes overlay has an "Export log (JSON)" button. This is the "demand intelligence" hook from the pitch.

### 4.3 Playback

- **Play all** plays the episode from paragraph 1; selecting a card plays that paragraph's segment; the active card is
  highlighted during playback and the timeline playhead moves.
- Clicking or dragging on the timeline scrubs. Scrubbing is exact (pure `evaluate(t)`, §7.4); audio plays only during
  real-time playback.
- After the last paragraph finishes: hold the final frame with idle motion (P2: tap-to-react, D9).

### 4.4 The player UI and the Behind-the-scenes overlay

- **The app is a game, for players only**: large rounded type (Google Font "Nunito"), warm palette (forest greens,
  honey yellow, Masha-magenta accent), big buttons, emoji status chips (✏️ ⏳ ✅ ✨ ⚠️), example story chips under an
  empty script ("Pancake morning", "Bear's nap", "Fishing trip"), the story bar as colored paragraph bands, and a
  master volume / mute button. Playful **remix buttons** on each ready paragraph card: 🎥 "another camera" (re-rolls
  the camera plan with a new seed), ☀️/🌙 time of day, 🎵 music mood. They re-render locally with no AI call (D7).
  No technical vocabulary anywhere in the player UI.
- **Behind the scenes** (funder demo overlay, P0): hidden by default; opened with the `?pitch=1` URL parameter or the
  `Shift+B` shortcut; never shown to players. A right drawer for the selected paragraph:
  - A read-only **data view** of the paragraph's timeline as tracks (Masha · Bear · Camera · Dialogue · Vocals ·
    Foley · SFX · Ambience · Music · Light), labeled "every produced episode already exists in this format →
    training data" (D8).
  - Beat script (pretty JSON, collapsible) and its `source` (LLM / offline / fixture).
  - **Plan size** in bytes vs "equivalent 1080p video ≈ duration × 1 MB/s" (state the assumption: H.264 @ ~8 Mbit/s).
  - Director latency; input/output/cache tokens; **actual cost in $** from `usage` × the price table in
    `src/shared/pricing.ts` (`claude-opus-5-5`: $4/M input, $20/M output, $0.20/M cache read; `claude-haiku-5-5`:
    $0.10/M input, $0.50/M output; one constant per model).
  - Live render FPS, draw calls, "Rendered on this device — server render cost $0".
  - **Economics panel (D5, P0).** Per paragraph and at scale, three columns side by side:
    (a) **diffusion video** = paragraph duration × $/generated second;
    (b) **this prototype** = the actual director cost (a frontier LLM standing in for the trained model);
    (c) **production projection** = a small trained model at an assumed cost per paragraph (editable, labeled
    "assumption").
    A scale calculator (users, paragraphs per user per day; defaults 10,000,000 and 10) shows daily server cost and
    daily egress (plan KB vs video MB) for each column; rendering is $0 server-side in (b) and (c). Every constant
    lives in `pricing.ts` with a source URL and an as-of date. Get the video price from the Vertex AI pricing page
    (https://cloud.google.com/vertex-ai/generative-ai/pricing, Veo rows). If you can't verify it, use the pitch
    deck's range ($0.05–0.75 per second) labeled "per pitch deck, unverified". Never present an unsourced number as
    fact.
  - Rule report: each hit → rule id, original, replacement, explanation.
  - The compiled audio cues (counts per track) and, after a remix, "Re-rendered locally in N ms · $0".
  - The honesty legend (§2).

### 4.5 Internationalization (EN / RU)

- All UI strings in `src/app/i18n/{en,ru}.ts`; toggle persists in `localStorage`.
- The child may write in either language regardless of the toggle. The director writes `summary`, dialogue `line`s
  and `kid_message`s in the **toggle language**.
- TTS picks a `ru-RU` / `en-US` voice; the offline parser has EN and RU lexicons.
- Example episodes exist in both languages (fixtures, §6.6).

---

## 5. Architecture

```
Browser (Vite + React + TypeScript)                              Cloudflare Worker (same origin)
┌──────────────────────────────────────────────────┐             ┌─────────────────────────────┐
│ ScriptEditor ─► ParagraphPipeline ───────────────┼─ POST ─────►│ /api/direct                 │
│   (debounce, cache, versions, downstream recompile)│ /api/direct │  auth gate → rate limit →  │
│        │  ▲ offline preview (parser) while waiting │◄── JSON ────│  pre-filter → Claude API    │
│        ▼  │                                        │ BeatScript  │  (structured output) →      │
│ Compiler (deterministic): BeatScript + WorldState  │             │  validate → BeatScript      │
│   → Segment timeline (+ endState)                  │             │ /api/health                 │
│        ▼                                           │             │ static assets (dist/)       │
│ Player.evaluate(t) → poses, camera, fx, audio cues │             └─────────────────────────────┘
│        ▼                                           │
│ Three.js Stage (series look) + WebAudio + TTS      │
└──────────────────────────────────────────────────┘
Shared (imported by both): src/shared/ — zod schemas, bible JSON, grammar, rules, price table
```

### 5.1 Repository layout (create exactly this shape)

```
package.json  tsconfig.json  vite.config.ts  wrangler.toml  playwright.config.ts  vitest.config.ts  index.html
CLAUDE.md
docs/SPEC.md  docs/NOTES.md (decision log)  docs/STATUS.md (progress log)  docs/DEMO_SCRIPT.md  docs/screenshots/
src/shared/   schema.ts  grammar.ts  rules.ts  pricing.ts  bible/{characters.ts, set.ts, props.ts}
src/compiler/ compile.ts  worldState.ts  validate.ts  camera.ts  dialogue.ts  audioCues.ts
src/director/ client.ts  offline/{parser.ts, lexicon.en.ts, lexicon.ru.ts}  fixtures/{*.json}  prompt.ts
src/engine/   stage.ts  look.ts  assets.ts  set/bearsYard.ts  characters/{rig.ts, masha.ts, bear.ts, face.ts}
              props/props.ts  motion/retarget.ts
public/assets/  (downloaded open motion clips and models; licenses in docs/ASSETS.md)
              motion/{library.ts, verbs/*.ts, blend.ts}  player/{player.ts, evaluate.ts}  fx/fx.ts
              audio/{bus.ts, scheduler.ts, tts.ts, vocals.ts, foley.ts, sfx.ts, ambience.ts, music.ts}
src/app/      main.tsx  App.tsx  store.ts  components/{TopBar, ScriptEditor, ParagraphCard, Stage, Timeline,
              RemixButtons, BehindTheScenes, Economics, DataView, SystemLayers}.tsx  i18n/{en.ts, ru.ts, index.ts}  styles.css
worker/       index.ts  auth.ts  rateLimit.ts  direct.ts
tests/unit/   *.test.ts (vitest)        tests/e2e/   *.spec.ts (playwright)
```

`src/director/prompt.ts` builds the system prompt from the bible and is imported by the worker (keeps one source of
truth). The worker never imports React or Three.js.

---

## 6. Data contracts (freeze these first; all modules depend on them)

Implement in `src/shared/schema.ts` with **zod**. Every field is required; use `.nullable()` for optional values
(keeps structured outputs strict-mode compatible). Export TS types via `z.infer`.

### 6.1 Identifiers

```ts
ActorId   = "masha" | "bear"                                   // (P2: "rabbit")
MarkId    = "clearing" | "porch" | "door" | "garden" | "beehive" | "swing" | "pond_shore" | "pier" | "table"
          | "bench" | "woodpile" | "path_entry" | "big_tree" | "bush" | "hammock"
PropId    = "jam_jar" | "honey_pot" | "pancakes" | "frying_pan" | "ball" | "fishing_rod" | "fish" | "lollipop"
          | "flowers" | "carrot" | "broom" | "book" | "pillow" | "bucket" | "watering_can" | "flour_bag" | "cake"
          | "teapot"
Emotion   = "neutral" | "happy" | "excited" | "mischievous" | "curious" | "surprised" | "sad" | "angry" | "scared"
          | "sleepy" | "proud" | "annoyed"
Mood      = "playful" | "calm" | "sleepy" | "tense" | "triumphant" | "sad"
TimeOfDay = "morning" | "day" | "sunset" | "night"
Shot      = "auto" | "wide" | "medium" | "close" | "low_angle" | "over_shoulder" | "tracking"
Emote     = "none" | "giggle" | "laugh" | "gasp" | "wheee" | "hmph" | "uh_oh" | "yawn" | "cry" | "cheer" | "scream_fun"
          | "grunt" | "sigh" | "hum" | "growl_soft" | "chuckle" | "snore" | "huff" | "roar_soft" | "sneeze"
          // non-verbal vocalizations; each character's bible lists which ones it can make
MusicMood = "none" | "playful" | "calm" | "sleepy" | "tense" | "spooky" | "chase" | "triumphant" | "sad" | "romantic_waltz"
Ambience  = "birds_day" | "forest_wind" | "creek" | "rain" | "thunderstorm" | "night_crickets" | "bees" | "strong_wind"
SfxId     = "door_creak" | "door_slam" | "knock" | "crash" | "splash" | "thunder_clap" | "pop" | "boing" | "whoosh"
          | "bell" | "pot_clang" | "sizzle" | "munch" | "glass_clink" | "van_horn" | "engine_start" | "magic_chime"
          | "drum_roll" | "rimshot" | "cuckoo"
          // event sounds the script can ask for; locomotion/body foley is automatic (§7.6), never listed here
RuleId    = "bear_silent" | "cast_only" | "no_weapons" | "no_scary" | "kind_language" | "no_brands"
          | "no_personal_data" | "in_character"
```

### 6.2 Action grammar (`src/shared/grammar.ts`)

Each verb: `{ id, actors: ActorId[], target: "mark"|"actor"|"prop"|"mark_or_actor"|"none", needsItem: boolean,
baseDuration: seconds, loopable: boolean, foley: FoleyRule[], effortVocal: Emote|null, description }`, where a
`FoleyRule` says which automatic sound the verb makes and when (e.g. `walk_to` → footsteps on every foot contact;
`jump` → effort vocal at takeoff + landing thud; `fall_down` → whoosh + thud + "oof"; `swing` → rope-creak loop;
`cook` → sizzle loop; `eat` → munch). See §7.6. The description is fed to the
director prompt. P0 verbs (implement all in the motion library):

| Group | Verbs |
|---|---|
| Locomotion | `walk_to`, `run_to`, `tiptoe_to`, `chase` (actor), `enter` (from path_entry), `exit` (to path_entry) |
| Body | `idle`, `jump`, `spin`, `dance`, `sit`, `stand_up`, `fall_down` (slapstick), `sleep`, `wake_up`, `yawn_stretch`, `hide` (behind mark), `peek` |
| Gesture | `wave`, `clap`, `point_at`, `look_at`, `nod`, `shake_head`, `shrug`, `facepalm` (Bear signature), `hug` (actor) |
| Emotion | `laugh`, `cry`, `sulk`, `surprised`, `scared`, `angry_stomp`, `sneeze`, `sigh` |
| Objects | `take` (item), `give` (item → actor), `eat` (item), `throw` (item → target), `cook` (frying_pan/pancakes at table), `fish` (at pier), `swing` (Masha, at swing), `carry` (Bear lifts Masha onto shoulders), `water_plants` (garden) |

**Speech.** Dialogue is not a verb: any beat may carry a `line` if that character's bible entry has
`speaks: true`. Masha speaks; Bear has `speaks: false` (canon, to be confirmed by Animaccord; flipping the flag is
the only change needed). Every character can **vocalize** through `emote` (Bear: grunt, sigh, hum, chuckle, snore,
huff…). Each speaking character has a voice profile (TTS voice per language, pitch, rate) in the bible.

### 6.3 BeatScript (director output — the LLM contract)

A **beat** is one indivisible piece of on-screen action: *one character does one thing*, optionally to a target or
with an object, with an emotion, and optionally saying a line or making a sound. It is roughly one storyboard
panel; the term comes from screenwriting. A paragraph becomes a short sequence of beats. Example: "Bear naps. Masha
wakes him." →
1. Bear `sleep` at `hammock` (sleepy, emote snore);
2. Masha `tiptoe_to` `hammock` (mischievous);
3. Masha `wave`, line "Bear! Wake up! It's morning!" (excited);
4. Bear `surprised` + `fall_down` (surprised, emote grunt), with_previous;
5. Bear `facepalm` (annoyed, emote sigh);
6. Masha `laugh` (happy), with_previous.

**Beats run in parallel.** Each character has its own track in the compiled timeline. `with_previous` anchors a beat
to the previous beat's start instead of its end, and `delay_s` offsets it, so any overlap is expressible: three
chained `with_previous` beats run at once, and "Masha shouts two seconds into Bear's walk" is `with_previous: true,
delay_s: 2`. A character's own beats never overlap each other: the compiler queues them on that character's track.
Characters with no beat at a given moment are never frozen. The compiler fills their track with ambient life:
idle fidgets, look-at toward the speaker or the action, and small reactions to loud beats (`fall_down`, `sneeze`,
`laugh`, shouted lines).

Beats exist only in the prototype: they are the interface between the stand-in director (Claude) and the
deterministic compiler. A trained production model would likely emit the timeline directly.

```ts
Beat = {
  actor: ActorId,
  verb: Verb,
  target: string | null,        // MarkId | ActorId | PropId; compiler validates against verb.target
  item: PropId | null,
  line: string | null,          // spoken words; only characters with speaks:true; ≤ 120 chars; UI language
  emote: Emote | null,          // non-verbal vocalization (any character, from its bible list)
  sfx: SfxId | null,            // an event sound tied to this beat ("the door slams", "a crash in the kitchen")
  emotion: Emotion,
  with_previous: boolean,       // true = anchored to the previous beat's START (parallel); false = to its END (sequential)
  delay_s: number,              // 0–6 s offset from the anchor; e.g. with_previous + 2.0 = "two seconds into Bear's walk"
  shot: Shot                    // "auto" unless the script implies a specific framing
}
BeatScript = {
  summary: string,              // ≤ 140 chars, UI language, shown on the card
  time_of_day: TimeOfDay | null,// null = unchanged
  mood: Mood,
  music: { mood: MusicMood, intensity: "soft" | "medium" | "full", change: "continue" | "start" | "stop" },
                                // "continue" keeps the previous paragraph's music unless the mood changed
  ambience: Ambience[] | null,  // background soundscape; null = unchanged from the previous paragraph; [] = silence
  beats: Beat[],                // 1..14
  rule_hits: { rule: RuleId, original: string, replacement: string, kid_message: string }[]
}
```

### 6.4 WorldState and Segment (compiler contracts)

```ts
WorldState = {
  timeOfDay: TimeOfDay,
  actors: Record<ActorId, { pos: [number, number], facing: number, mark: MarkId | null,
                            holding: PropId | null, posture: "stand" | "sit" | "sleep" | "carried" | "offstage" }>,
  props: Record<PropId, { at: MarkId | ActorId | "hidden" }>
}
Segment = {
  paragraphId: string, version: number, duration: number,
  startState: WorldState, endState: WorldState,
  actorClips: Record<ActorId, ActorClip[]>,  // ActorClip { start, dur, verb, emotion, params: { from?, to?, path?: [x,z][], lookAt?, item? } }
  dialogue: { start, dur, actor, text, lang, visemes: { t: number, v: Viseme }[] }[],
  emotes:   { start, dur, actor, emote }[],                      // vocalizations, incl. automatic effort vocals
  foley:    { start, actor, id: FoleyId, surface: "grass" | "wood" | "water" | "dirt", gain, pan }[],  // automatic
  camera:   { start, dur, shot, from: CamKey, to: CamKey, overridden: boolean }[],   // CamKey { pos:[x,y,z], look:[x,y,z], fov }
  sfx:      { start, id: SfxId, gain, pan }[],
  music:    { start, mood: MusicMood, intensity, fade: number }[],
  ambience: { start, layers: Ambience[], fade: number }[],
  ducking:  { start, dur, depth }[],                              // music/ambience dip under dialogue
  lighting: { start, timeOfDay, transition: number }[],
  fx:       { start, dur, id: "flour_cloud" | "hearts" | "sparkles" | "zzz" | "dust" | "splash" | "tears" | "anger_puff", at: [x,y,z] }[]
}
Episode timeline = concatenation of segments; segment i starts at Σ duration(0..i-1).
```

### 6.5 Paragraph pipeline rules (incremental rendering)

1. Paragraph i compiles from `startState = endState(i-1)` (paragraph 0 uses the set's initial state).
2. Director cache key = hash(`normalizedText`, `lang`, `startStateDigest`, `BIBLE_VERSION`). Cache hits never call
   the API (`localStorage`, LRU 200 entries).
3. On edit of paragraph i: (a) immediately compile an **offline-parser preview** and show it (status `directing`);
   (b) call the director; when it returns, replace the preview and set `ready` / `adjusted`.
4. After paragraph i changes, **recompile** (compiler only, no LLM) every downstream paragraph whose `startState`
   changed. If a downstream BeatScript fails validation against its new start state (e.g. `eat jam_jar` but nobody
   holds it), the compiler auto-repairs where trivial (insert `take`) or marks the paragraph `draft` and re-directs it.
5. At most 2 director calls in flight; newer edits of the same paragraph cancel older calls (AbortController).
6. Remix choices `{ cameraSeed: number, timeOfDay, musicMood }` are stored per
   paragraph version and applied by the compiler — **never** trigger an LLM call.

### 6.6 Fixtures (golden path, offline-safe)

`src/director/fixtures/` holds three example episodes × {en, ru}, each 3–4 paragraphs with hand-authored BeatScripts:
**Pancake morning** (Masha cooks for Bear, flour sneeze), **Bear's nap** (Masha wakes Bear in the hammock and gets
carried on his shoulders), **Fishing trip** (Bear fishes at the pier, Masha throws the ball, splash). Each fixture
includes quoted dialogue, explicit music and ambience, and event SFX so the golden path shows off the sound design. Loading an
example uses the fixtures (no API calls) and renders instantly. The fixtures double as e2e test data and few-shot
examples for the director prompt.

---

## 7. Engine specification

### 7.1 Look and feel

Three.js (latest, ES modules). **Match the series' look**: soft, warm, saturated 3D CG, *not* cel shading and *no*
outlines. Use `MeshStandardMaterial` / `MeshPhysicalMaterial` with high roughness: `sheen` for fabric (Masha's
dress and kerchief), a subtle warm emissive or `sheen` on skin to fake subsurface scattering, and Bear's fur either
as shell fur (6–10 shells with a noise alpha mask; P1) or as a soft normal-mapped noise. ACES filmic tone mapping,
sRGB output. Light rig: warm key light with soft shadows (PCFSoft, 2048 map), a cool sky/hemisphere fill, and a rim
light so silhouettes read against the forest. Sky gradient per time of day, light atmospheric fog, grass as a
textured ground plus instanced tufts near the camera. Cap pixel ratio at 2. Target
**≥ 50 FPS** on a 2020+ laptop with integrated GPU at 1280×720 canvas. Keep the total scene under ~150 draw calls
(merge static set geometry with `BufferGeometryUtils.mergeGeometries` per material).

### 7.2 Set: "Bear's yard" (`src/engine/set/bearsYard.ts`)

Ground ~40×40, origin at the center, +z toward the default camera (south). All marks also live in
`src/shared/bible/set.ts` with coordinates, a facing hint, and a description for the prompt.

| Mark | Position (x, z) | Description |
|---|---|---|
| `clearing` | (0, 0) | Open grass in front of the house |
| `porch` | (-6, -2.6) | Wooden porch with three steps in front of Bear's house |
| `door` | (-6, -3.6) | Front door; `enter`ing the house = walk to the door and fade out (posture `offstage`) |
| `garden` | (5, -5) | Vegetable beds: carrots and cabbages, small fence |
| `beehive` | (10, -8) | Wooden beehive on a stump; buzzing ambience nearby |
| `swing` | (8, 2) | Rope swing hanging from a big oak |
| `hammock` | (-11, 2) | Hammock between two pines (Bear's nap spot) |
| `pond_shore` | (-6, 8) | Shore of a small round pond (radius ~3.5, centered at (-8, 10)) |
| `pier` | (-5.5, 9.5) | End of a small wooden pier; fishing spot |
| `table` | (2, 1.5) | Outdoor wooden table with a samovar/teapot |
| `bench` | (2, 3) | Bench beside the table |
| `woodpile` | (-12, -5) | Stacked logs with an axe-free chopping stump (no axe — canon/safety) |
| `path_entry` | (0, 16) | Forest path where characters enter and exit the yard |
| `big_tree` | (-2, -10) | Large pine behind the house; hiding spot |
| `bush` | (6, 7) | Round bush; hiding spot |
| `creek` | (12, 9) | A small creek crossing the yard's east edge, with a plank footbridge at this mark |
| `van` | (14, -1) | The Wolves' old ambulance van (boxy Soviet-era 4×4 minibus, faded white/cream with a red stripe), parked at the edge of the forest. Set dressing and a hiding spot in the prototype |

Bear's house: a two-storey log cabin (stacked cylinder logs, gable roof with planks, chimney with a soft smoke
particle effect, warm windows that glow at night), porch, door. Surround the yard with a dense stylized forest of
pines and birches (instanced), a picket fence fragment, flowers, a few rocks; the creek winds from north-east to
south-east and feeds the pond. Locomotion paths: straight lines with simple obstacle avoidance around the house
footprint, pond, creek, van and table (a waypoint graph of ~12 nodes is enough).

Every set element is a **stand-in for an existing Animaccord 3D source**. Build each as a separate named group, and
keep their placement in `set.ts`, so a production export (glTF) can replace any element 1:1 (§7.3 asset manifest).

### 7.3 Characters — stand-in rigs, as close to the originals as possible

Build procedurally from smooth primitives (spheres, capsules, lathe-profiled dress, tube-bent arms). Rigidly attach
each body part to a `THREE.Bone` in a **standard humanoid skeleton that uses Mixamo bone names** (`Hips`, `Spine`,
`Spine1`, `Spine2`, `Neck`, `Head`, `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `RightShoulder`…,
`LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`, `RightUpLeg`…). Rest pose: T-pose, so open motion clips retarget
cleanly (§7.4). Faces are separate procedural rigs (eyes, lids, brows, mouth visemes) on the `Head` bone. Each
character module exports `build(): CharacterRig` and a `CharacterLook` config (all colors and proportions in one
object for easy tuning).

**Likeness protocol (no official assets are available — the stand-ins must be good enough that Animaccord's own
artists don't wince).** Aim for a faithful, respectful *maquette*: recognizable at a glance, charming, never uncanny.
1. **Reference board (first 15 minutes of M2, character subagent).** Download 6–10 reference images of Masha and of
   Bear (front, three-quarter, side, a close-up of each face; e.g. from the Wikipedia/Fandom articles or the official
   site) into the git-ignored `refs/` folder. **Never commit or deploy them** (add `refs/` to `.gitignore`; they must
   not end up in `public/` or `dist/`). View them with the Read tool.
2. **Measure, don't guess.** Write `docs/LIKENESS.md` with a proportion sheet measured from the references (head :
   body ratio, eye size and spacing relative to head width, kerchief outline, dress length, Bear's height relative to
   Masha, belly and ear shapes, muzzle size) and a color sheet sampled from the images with a small Python/PIL script
   (median color of hand-picked regions: kerchief, dress, sleeves, skin, cheeks, iris, hair, Bear's fur, muzzle,
   nose). Replace the default hex values below with the sampled ones.
3. **Sculpt, don't stack primitives.** Shape the heads, kerchief, dress and Bear's body by deforming high-segment
   geometry with displacement functions (cheek bulges, small chin, pear-shaped belly, kerchief shell that leaves an
   oval face opening and ends in a chin knot with two short tails), with smooth normals, so the forms read as
   sculpted rather than assembled. The eyes carry most of the life: large irises, specular highlights, eyelids that
   blink, and brows that act.
4. **Compare side by side, and iterate at least three times.** Each pass: render front, three-quarter and face
   close-up screenshots at the references' angles; render a black **silhouette** version and compare it with the
   reference silhouettes; score each character 1–5 against this rubric — silhouette, proportions, face, colors,
   materials, motion feel — as an Animaccord art director would; log scores and fixes in `LIKENESS.md`. Stop when
   every score is ≥ 4 or the time box ends (pass 1 in M2, passes 2–3 in M6).
5. When in doubt, prefer *simpler and cleaner* over detailed and wrong. A clean, stylized maquette is respected; a
   busy, off-model one is despised.

**Asset manifest (`src/engine/assets.ts`)**: every character, set element and prop resolves through a manifest entry
`{ id, kind, source: "procedural" | { gltf: url }, skeletonMap?, scale, offset }`. Replacing a stand-in with an
official Animaccord glTF export must need **only a manifest change** (plus a bone-name map if the official rig uses
different names). Provide one working example of a glTF-sourced entry (e.g., the three.js `RobotExpressive.glb`
loaded as a hidden test character) to prove the path works.

**Masha** (reference: the series' main character; verify colors against the Animaccord style guide if available,
otherwise use these defaults):
- Height 1.0 m in scene units; chibi proportions — head ≈ 40% of height; short limbs; small hands.
- Skin light peach `#FFDCC8`; rosy cheek discs `#F6A6A6`.
- Big round eyes ~⅓ of face width: white sclera, **green** iris `#3E9B4F`, black pupil, two white highlights;
  upper eyelids for blinks; expressive thin dark-brown brows.
- Blond fringe `#F3C64B` visible on the forehead under the headscarf.
- **Headscarf** (kerchief) in magenta-pink `#C7317D` covering the head, tied under the chin with a small knot.
- **Sarafan dress** in the same magenta-pink, A-line flaring to just above the knees; long sleeves slightly lighter
  `#D9549A`; pale stockings; small dark-pink shoes `#8E2457`.
- Mouth: separate viseme meshes or a morphable shape — `rest` (small smile), `open_small`, `open_wide`, `o`, `e`,
  `frown`, `grin`.
- Personality in motion: quick, bouncy, never still — idle is a fidget loop (rocking on heels, looking around).

**Bear** (reference: the series' gentle giant, a retired circus performer):
- Height 2.4 m (≈2.4× Masha); pear-shaped bulky body, big round belly, short thick legs, long arms, walks upright.
- Fur brown `#7A4A2B`; lighter tan muzzle and belly patch `#C9A27A`; small round ears with tan inner ear; small dark
  eyes with highlights; big black nose `#1E1410`; heavy expressive brows.
- Never speaks. Expressions come from brows, eyes and posture; emotes are sound + gesture (sigh = shoulders rise
  and fall; grunt; hum; snore).
- Personality in motion: slow, weighty, patient; signature `facepalm` and long-suffering `sigh`; tender when hugging
  or carrying Masha.

Secondary motion: dress hem sway (Masha), ear wiggle and belly jiggle (Bear), procedural blinking every 2–5 s,
breathing on the chest bone in every pose, look-at head turn toward the speaker or target.

### 7.4 Motion library and player

- **Body motion comes from open motion clip libraries** (motion capture or keyframed), retargeted onto the stand-in
  skeletons with `SkeletonUtils.retargetClip` (or a direct name-mapped track rebinding when the skeletons share
  Mixamo names). Try sources in this order and stop at the first that gives ≥ 15 of the §6.2 verbs (time box: 40
  minutes total):
  1. Quaternius **Universal Animation Library** (CC0) or other Quaternius CC0 animated-character packs, if they can be
     downloaded without a login;
  2. three.js example models with embedded clips (`RobotExpressive.glb` CC0: Idle, Walking, Running, Jump, Dance,
     Wave, Yes, No, Sitting, Standing, ThumbsUp, Punch→*not used*, Death→*not used*; `Xbot.glb`: idle/walk/run plus
     additive agree/headShake/sad/sneak), fetched from `raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/`;
  3. CMU Graphics Lab motion capture (BVH, free for any use) via a GitHub mirror, loaded with `BVHLoader`.

  Record every asset's source URL, author and license in `docs/ASSETS.md`. Keep downloaded files in `public/assets/`.
  Never use a source that needs a login or forbids this use.
- **Bear** uses the same humanoid clips (he walks upright in the series), retargeted onto his proportions and played
  slower with added weight (lower hips, wider stance, a delayed belly-jiggle layer). Bear-specific verbs with no clip
  (`facepalm`, `sigh`, `carry`) and anything the libraries lack are authored procedurally as additive layers.
- A verb implementation maps to `clip | procedural | clip + additive procedural`, exposed as a pure function
  `(localT, params, rig, ctx) → PoseLayer` (bone rotations, root offset, face params). Sample clips at `localT`
  without a running `AnimationMixer` clock, so evaluation stays pure. Loopable verbs repeat within their clip
  duration.
- **Faces are always procedural** in the prototype (motion libraries carry no faces): emotion presets
  (brows, lids, mouth), blinks, look-at, and visemes from dialogue.
- `blend.ts`: 0.2 s crossfade between consecutive clips; an additive breathing layer; look-at layer.
- Locomotion uses the compiled path, speed per verb (walk 1.2 m/s Masha / 1.0 Bear; run 3.0 / 2.2; tiptoe 0.6),
  turning in place before moving, foot-plant-ish leg cycle synced to distance traveled.
- `evaluate(timeline, t)` is **pure and deterministic**: it returns every actor's pose, the camera, active fx, and
  lighting for time t. The renderer applies it. Playback = `evaluate(clock)`; scrubbing = `evaluate(scrubT)`. Unit-test
  determinism (same t → identical output).

### 7.5 Auto-cinematographer (`src/compiler/camera.ts`)

Rules, in priority order: user override > beat `shot` hint > automatic rules:
1. Establishing **wide** at episode start and whenever the action moves to a different mark cluster.
2. Dialogue → **medium-close** on the speaker; after a punchline or slapstick beat, a 1–1.5 s **reaction** shot on
   the other character.
3. Locomotion longer than 2 s → **tracking** (camera follows at a fixed offset, smoothed).
4. Bear looming or Masha's mischief → **low_angle** is allowed.
5. Shot length 1.2–6 s; keep the camera on one side of the line between the two actors (180° rule); ease-in-out
   dolly within a shot; never put the camera inside geometry (clamp to a bounding region; nudge if it collides with
   the house).

### 7.6 Sound design: voices, vocalizations, foley, event SFX, ambience, music

Sound is half of a cartoon; treat it as P0. The compiler produces six audio tracks (§6.4). The player schedules them
on one shared `AudioContext` (unlocked on the first user gesture), with buses: **voice**, **vocals + foley + SFX**,
**ambience**, **music**, then master. Players get one master volume / mute button; bus levels are fixed in a mix
config constant.

| Track | Where it comes from | Prototype sound source |
|---|---|---|
| **Dialogue** | `line` on beats (the child's quoted words or the director's lines) | TTS (§ below), with lip-sync |
| **Vocalizations** | `emote` on beats, plus **automatic effort vocals** from the grammar (jump "hup!", landing "oof", Bear's huff after running, a giggle on `swing`/`spin`, a sigh on `facepalm`) and automatic reactions from ambient life (§6.3) | Masha: short TTS interjections in the UI language ("Hee-hee!", "Wheee!", "Ой!") at high pitch. Bear: synthesized low vocal tones (formant-filtered oscillator + noise) |
| **Foley** (automatic, never written by the child) | Locomotion and body verbs via `FoleyRule`s: a footstep on every foot contact of the gait cycle, its surface taken from the position (porch/pier/footbridge = wood, creek/pond edge = water, path = dirt, else grass); Bear's steps heavier and lower with a ground thump; cloth rustle on fast moves; prop handling sounds | CC0 sample packs (try Kenney's "Impact Sounds" / "RPG Audio" packs from kenney.nl, CC0), else synthesized |
| **Event SFX** | `sfx` on beats ("the door slams", "a crash", "thunder") | CC0 samples or synthesized |
| **Ambience** | `ambience` per paragraph (birds, forest wind, creek, rain, thunderstorm, night crickets, bees); defaults from the set and time of day (day → birds + light wind; night → crickets); positional layers near the creek and the beehive | Synthesized loops (filtered noise for wind/rain/creek, chirp generators for birds and crickets) or CC0 loops |
| **Music** | `music` per paragraph (mood, intensity, start/continue/stop); crossfades across paragraph boundaries and keeps playing across them when the mood stays the same | Procedural folk-flavored score per mood: plucked "balalaika" (Karplus-Strong), accordion-like pad (detuned saws + low-pass), light percussion; tempo and instrumentation vary by mood and intensity |

Mixing rules: music and ambience **duck** ~8 dB under dialogue (gain automation, 150 ms attack, 400 ms release).
Foley, vocals and SFX are **spatialized** relative to the current camera (`StereoPannerNode` for pan plus distance
attenuation), so a character running off-screen sounds off-screen. Audio is scheduled ahead with `AudioContext`
time, never with `setTimeout`. When scrubbing, nothing plays; on play, start mid-cue at the right offset. Record every
sample's source and license in `docs/ASSETS.md`. Time-box sample hunting to 20 minutes, then synthesize.

- Dialogue duration = max(1.2 s, chars / 13 per second) + 0.3 s. Visemes from text: map vowels (EN `a e i o u y`;
  RU `а о у э и ы е ё ю я`) to `open_wide / e / e / o / o / e…`, consonant runs to `open_small`, punctuation pauses
  to `rest`, ~12 visemes per second.
- TTS (`speechSynthesis`): per speaking character, choose the best available voice for the language (prefer names
  containing "Google", then any match); Masha pitch 1.6, rate 1.05. Use `onboundary` word events, when available,
  to tighten the lip-sync. TTS must **never block or crash** playback: if no voice is available (headless tests),
  skip silently and keep the lips moving. Production swaps in studio voices (Masha's real voice) through the same
  voice-profile interface.
- Modules: `src/engine/audio/{bus.ts, tts.ts, vocals.ts, foley.ts, sfx.ts, ambience.ts, music.ts, scheduler.ts}`;
  compiler side `src/compiler/audioCues.ts` (foley from gait contacts and surfaces, effort vocals, ducking,
  ambience and music cue resolution across paragraphs).

---

## 8. Director (LLM) specification

### 8.1 Endpoint (`worker/direct.ts`)

`POST /api/direct` body: `{ lang: "en"|"ru", paragraph: string, previous: string[] (≤ 3 most recent paragraphs),
worldState: WorldState, episodeId: string, paragraphId: string, model?: "claude-opus-5-5" | "claude-haiku-5-5" }`.
`model` is optional and allow-listed (anything else → 400). It's used by the director eval against the deployed
Worker and by a model toggle in the Behind-the-scenes overlay (P1), so funders can watch cost per paragraph change
live. Default: `DIRECTOR_MODEL` env, else `claude-opus-5-5`.
Response: `{ beatScript: BeatScript, source: "llm"|"offline", latencyMs, usage: { input_tokens, output_tokens,
cache_read_input_tokens, cache_creation_input_tokens } | null, model }`.

Pipeline: auth gate → rate limit → length check (paragraph ≤ 600 chars) → **deterministic pre-filter** (§9) → Claude
call → zod validation → **deterministic post-validator** (§9) → response. On any failure (no key, timeout of 20 s,
refusal, invalid output after one repair retry) → return the offline-parser BeatScript with `source: "offline"` and
an `error` string. **The endpoint never returns a 5xx for a director failure.**

### 8.2 Claude API usage (TypeScript SDK `@anthropic-ai/sdk`, runs inside the Worker)

- Model `claude-opus-5-5` (env `DIRECTOR_MODEL` overrides), `output_config: { effort: "low", format:
  zodOutputFormat(BeatScriptSchema) }` via `client.messages.parse(...)`; `max_tokens: 4000`. Read
  `response.parsed_output` (null → repair retry once with the validation error appended, then offline fallback).
  Check `stop_reason === "refusal"` before reading content → offline fallback + `rule_hits` note.
- **Do not** send `temperature`/`top_p`/`top_k` and do not disable thinking (both return 400 on this model).
- Try enabling server-side refusal fallback (`client.beta.messages` + `betas: ["server-side-fallback-2026-07-01"]`,
  `fallbacks: "default"`). If combining it with structured outputs fails, drop it, rely on the offline fallback, and
  log the decision in `NOTES.md`. Do not spend more than 15 minutes on this.
- Prompt caching: the system prompt (bible + grammar + rules + few-shots) is static → mark it with
  `cache_control: { type: "ephemeral" }`. The per-request user message carries the language, world-state JSON, previous
  paragraphs, and the paragraph. No timestamps or IDs in the system prompt.
- If the SDK has a Workers incompatibility, add `compatibility_flags = ["nodejs_compat"]`; do not hand-roll `fetch`
  calls unless the SDK genuinely cannot run (log it).

### 8.3 System prompt content (`src/director/prompt.ts`)

1. Role: "You are the director of a Masha and the Bear cartoon. Turn the child's script paragraph into staged beats."
2. **Character bible** (from `src/shared/bible/characters.ts`):
   - *Masha*: a small, fearless, endlessly curious, talkative, mischievous girl with a huge heart; she rarely walks
     when she can run; loves sweets, jam, games and being the center of attention; causes chaos innocently and then
     charms her way out; talks a lot, asks questions, gives Bear orders, laughs loudly.
   - *Bear*: a big, kind, retired circus bear who loves peace and routine — his garden, beehives, fishing, cooking,
     napping; patient and paternal; exasperated by Masha's chaos but always forgives and protects her; **never speaks
     words** — he communicates with gestures, sighs, grunts, hums and facial expressions; signature moves: facepalm,
     long sigh, gentle hug, carrying Masha on his shoulders; secretly enjoys her company.
   - Relationship dynamics: Masha initiates, Bear reacts; slapstick consequences land softly; every scene ends warm.
   - Mark these "to verify against the Animaccord series bible" in a code comment; keep them editable data.
3. The set (marks with descriptions), props, verbs (from the grammar descriptions), emotions, shots.
4. **Expansion guidance** ("a few words express a lot"): turn each sentence into 2–4 beats with in-character
   business; add reactions (`with_previous: true`, optional `delay_s`) so both characters act in parallel; add at most one or two short Masha
   lines per paragraph when natural; respect continuity with the world state (who holds what, who is where, who is
   asleep); total 3–10 beats for a typical 1–3-sentence paragraph; prefer the most specific verb.
5. Canon and safety rules (§9) with the instruction to rewrite, never refuse, and to record each change in
   `rule_hits` with a short, warm `kid_message` in the UI language.
6. **Speech and sound**: keep the child's quoted words verbatim as `line`s on the right speaker (Bear's quotes become a
   fitting `emote` + gesture, with a `bear_silent` rule hit); map music, ambience and event-sound requests to
   `music` / `ambience` / `sfx`; when the script says nothing about sound, choose music and ambience that fit the
   mood and set (keep the previous paragraph's music with `change: "continue"` unless the mood shifts); add `emote`s
   generously so characters sound alive (giggles, gasps, grunts, sighs). Don't list footsteps or other automatic foley.
7. 3–4 few-shot examples (EN and RU) derived from the fixtures: terse paragraph → BeatScript JSON, at least one with
   quoted dialogue and one with explicit music/ambience requests.

### 8.4 Quality bar for the director (checked in §13)

For the 6 golden prompts in `tests/golden/prompts.json` (3 EN, 3 RU, including one canon-violating prompt), every
response must parse, pass the post-validator with 0 errors, contain ≥ 3 beats, give Bear no `line`, and place every
`line` in the requested language. Run this as `npm run eval:director`. It uses the real API directly when
`ANTHROPIC_API_KEY` is set locally. Otherwise, run it against the **deployed** Worker
(`EVAL_TARGET=https://mabear.ilya-baimetov.workers.dev npm run eval:director`, logging in with `DEMO_PASSWORD`); it
passes only if every response has `source: "llm"`. Run the eval on **both** `claude-opus-5-5` and `claude-haiku-5-5`, and log
a comparison table in `STATUS.md`: pass rate, P50 latency, mean cost per paragraph, and a one-line judgment of
staging richness. The deployed default stays `claude-opus-5-5` unless the operator sets `DIRECTOR_MODEL`. The
results feed the Economics panel.

---

## 9. Canon and safety rules (`src/shared/rules.ts`)

Two layers: the **LLM** applies the rules while directing (prompt), and a **deterministic validator** enforces the
hard ones on every BeatScript (including offline and fixture ones). Both produce `rule_hits` shown in the UI.

| Rule | Hard (validator)? | Behavior |
|---|---|---|
| `bear_silent` — Bear never speaks words *(canon; verify with Animaccord)* | Yes | Bear `line` → removed; emote `grunt`/`hum` added; hit recorded ("Bear doesn't talk in our show — he grumbled instead!") |
| `cast_only` — only bible characters, marks, props | Yes | Unknown actor/target/prop → dropped or mapped to nearest allowed; other franchises' characters never appear |
| `no_weapons` — no weapons or real violence; soft slapstick is fine | Yes (word lists EN/RU) + LLM | knife/gun/sword/axe → toy or removed; hitting → playful pillow bonk or nothing |
| `no_scary` — no gore, horror, death, injury | LLM + word list | Reframe as a gentle surprise |
| `kind_language` — no insults or profanity | Word list EN/RU + LLM | Replace with a kind equivalent |
| `no_brands` — no real brands or products | LLM | Generic noun |
| `no_personal_data` — strip names, addresses, phone numbers the child types about themselves | Regex (digits, emails) + LLM | Remove |
| `in_character` — Masha is mischievous but never cruel; Bear is never aggressive toward Masha | LLM | Restage |

The pre-filter runs **before** the LLM call (it masks blocked words and records hits); the post-validator runs on the
result. Unit-test every hard rule in both languages.

## 10. Offline parser (`src/director/offline/`)

Deterministic, ~200–400 lines, EN + RU lexicons: split into sentences; detect the actor (Masha / Маша, Bear /
Медведь / Мишка; pronouns → the last mentioned actor); map verb stems to grammar verbs (e.g., "run|runs|ran|бежит|
побежала" → `run_to`); targets by mark and prop lexicons ("garden|огород", "pond|пруд", "jam|варенье"…); quoted
text and `NAME:` lines → `line` for that speaker (Bear → emote + rule hit); sound lexicon ("music", "музыка",
"rain", "дождь", "thunder", "гром", "birds", "птицы", "door slams", "хлопнула дверь"…) → `music` / `ambience` /
`sfx`; default emotion per verb; ensure ≥ 1 beat per sentence and ≥ 2 beats per paragraph (add a
reaction beat for the other actor). It powers the instant preview, the no-key fallback, and the tests.

## 11. Security, access control, cost protection (`worker/`)

- **Password gate**: every route except `/login` and `/api/health` requires a cookie `mb_session` = HMAC-SHA256
  (`DEMO_PASSWORD`, timestamp) signed with the `SESSION_SECRET` env (if `SESSION_SECRET` is unset, derive it from
  `DEMO_PASSWORD`). `/login` is a minimal branded page (EN/RU); 7-day cookie, `HttpOnly; Secure; SameSite=Lax`.
- `X-Robots-Tag: noindex, nofollow` on every response; `robots.txt` disallows everything.
- Rate limit `/api/direct`: 30 requests per 10 minutes per session cookie and 200 per hour globally per isolate
  (best-effort in-memory). Paragraph length ≤ 600 chars; previous context ≤ 3 paragraphs.
- Secrets live only in Worker secrets (`ANTHROPIC_API_KEY`, `DEMO_PASSWORD`, `SESSION_SECRET`). Never commit secrets,
  never log them, never send the API key to the browser.
- Local/test mode: env `MOCK_DIRECTOR=1` makes `/api/direct` return the offline parser output (or a fixture when the
  paragraph text exactly matches one) with a fake `usage`, so e2e tests run without a key.

## 12. Deployment (Cloudflare Workers with static assets)

- `wrangler.toml`: `name = "mabear"`, `main = "worker/index.ts"`, `compatibility_date` = today's date,
  `[assets] directory = "./dist"`, `binding = "ASSETS"`, `not_found_handling = "single-page-application"`,
  `run_worker_first = true` (so the password gate covers the assets too).
- Scripts: `npm run build` (vite build → `dist/`), `npm run dev` (vite + `wrangler dev` or a vite proxy to a local
  mock), `npm run deploy` (`wrangler deploy`).
- **Deployment is Cloudflare Workers Builds (git push → build → deploy); no API token is needed in this
  environment.** A build trigger ("Deploy prototype branch", trigger `3d4e8714-763e-4964-a55b-bc20a7b2efe0`) on the
  Worker `mabear` (account `2f26060a68f7297a6c57ca6b1b9704ca`) builds every push to `claude/keen-pascal-xwbndk`.
  Its commands are gated on a repo-root file **`.deploy-ready`**:
  build `if [ -f .deploy-ready ]; then npm ci && npm run build; else echo skip; fi`,
  deploy `if [ -f .deploy-ready ]; then npx wrangler deploy; else echo skip; fi`.
  **Create and commit `.deploy-ready` only once the password gate works and the unit and e2e tests pass** (M7). From
  then on, every push deploys, so keep the branch green. `package-lock.json` must be committed (`npm ci`).
- Follow builds through the Cloudflare MCP connector (`mcp__CloudFlare_API__execute`):
  `GET /accounts/{account_id}/builds/workers/e7aad35669b44223a2dc22aa1bdf8934/builds` for the latest build,
  `GET /accounts/{account_id}/builds/builds/{build_uuid}/logs` for its logs. To rebuild without a new commit:
  `POST /accounts/{account_id}/builds/triggers/3d4e8714-763e-4964-a55b-bc20a7b2efe0/builds` with
  `{ "branch": "claude/keen-pascal-xwbndk" }`. A failed build is a red CI: fix it and push.
- **Worker secrets are already set**: `DEMO_PASSWORD` and `SESSION_SECRET` (their values are also in the git-ignored
  `.secrets.env`; load with `set -a; . ./.secrets.env; set +a`; never print, commit or copy them).
  **`ANTHROPIC_API_KEY` is added by the owner directly in the Cloudflare dashboard.** The run never sets, overwrites,
  reads or deletes it. If it is missing, the deployed director answers `source: "offline"`; record that in `STATUS.md`.
- The Worker is served at https://mabear.ilya-baimetov.workers.dev (a 503 placeholder until the first real deploy).
- `wrangler.toml` must keep `name = "mabear"`, so the Builds deploy targets the existing Worker. Don't put secrets in
  `[vars]`.
- After deploying: smoke test with curl — `/api/health` → 200; `/` without the cookie → login page; a login POST with
  the password from env → cookie; `/api/direct` with the cookie on two golden prompts → `source: "llm"` and a valid
  BeatScript. Print the URL (the workers.dev URL is fine).

## 13. Testing and verification

- **Unit (vitest)**: schema round-trips; grammar coverage (every verb has a motion implementation and an i18n label);
  compiler determinism and world-state continuity (positions, held items, posture across paragraphs); incremental
  recompile (editing ¶2 changes only ¶2, plus downstream recompiles, with no director call for downstream); all hard
  rules in EN/RU; offline parser on 20 EN + 20 RU sentences (including dialogue and sound requests); audio cues
  (footstep count ∝ distance walked; surface switches to wood on the porch and pier; Bear's steps lower and louder;
  effort vocals on jump/fall; music continues across paragraphs with the same mood and crossfades on change; ducking
  windows match dialogue; quoted words preserved verbatim; a Bear quote yields no dialogue and one emote); camera rules (establishing shot first, speaker framed
  during dialogue, shot lengths within bounds); price/cost math; viseme generation.
- **E2E (Playwright, Chromium at `/opt/pw-browsers`, launched with `--use-angle=swiftshader
  --enable-unsafe-swiftshader --autoplay-policy=no-user-gesture-required`)** against `vite preview` + mock director:
  1. The app loads; the canvas renders a non-blank frame (pixel variance check on a screenshot).
  2. Load the "Pancake morning" example → all paragraphs `ready`; Play all → the playhead advances; the active card
     highlights.
  3. Type a new 2-sentence paragraph → it reaches `ready`/`adjusted`; the timeline grows.
  4. Edit paragraph 2 → exactly **one** director request is observed (route interception); other cards keep their
     version numbers.
  5. Canon: "Bear says thank you to Masha" → no Bear dialogue in the compiled segment and an `adjusted` chip.
  6. EN → RU toggle → UI strings switch (assert 3 labels) and a RU example loads.
  7. Behind the scenes (`?pitch=1`) → the drawer shows plan size, cost, FPS and the economics panel; it's absent
     without the parameter. A 🎥 remix re-renders without a director request.
  7b. Sound: a paragraph with "It starts to rain. Spooky music." compiles to `ambience` containing `rain` and
     `music.mood = spooky`; during playback the app's audio debug hook (`window.__mabearAudio`) reports scheduled
     dialogue, foley and music cues (assert counts > 0; actual audio output isn't verified headless).
  8. Save screenshots to `docs/screenshots/` (player.png, behind-the-scenes.png, masha-closeup.png,
     bear-closeup.png, ru-mode.png).
- **Visual self-review**: run the §7.3 likeness protocol (reference board, measured proportions and sampled colors,
  ≥ 3 side-by-side passes with silhouettes, rubric scores in `docs/LIKENESS.md`).
- **Performance**: in a non-headless-equivalent check, log the average FPS of a 10 s playback in the e2e run (headless
  SwiftShader FPS is not representative; just assert > 10 there) and the scene's draw-call count (assert < 200).

## 14. Definition of Done (the `/goal` condition refers to this list)

1. `npm run typecheck`, `npm test` and `npm run e2e` all exit 0, with their summaries printed in the transcript.
2. `npm run build` succeeds; the bundle has no secrets (`grep -r "sk-ant" dist/` returns nothing).
3. All P0 rows of §1 are demonstrable, and each P0 row maps to at least one passing test (list the mapping in
   `STATUS.md`).
4. Screenshots from §13.8 exist and were reviewed; Masha (magenta kerchief + sarafan, green eyes, blond fringe, chibi
   proportions) and Bear (big brown upright bear, tan muzzle, round ears) are recognizable; `docs/LIKENESS.md` shows
   ≥ 3 passes with rubric scores (target ≥ 4 everywhere); `refs/` is git-ignored and absent from `dist/`.
5. The director eval (§8.4) passes with real API calls, locally or against the deployed Worker — **or**, if no
   Anthropic key is available anywhere (the deployed Worker answers `source: "offline"`), `STATUS.md` says "director
   eval not run: key absent".
6. Deployed to Cloudflare via Workers Builds (`.deploy-ready` committed, latest build `success`), behind the
   password gate, with the §12 smoke test output printed.
7. `docs/ASSETS.md` lists the source, author and license of every third-party asset, and the Behind-the-scenes
   System layers legend matches the §0 table;
8. `docs/DEMO_SCRIPT.md` (a 5-minute funder walkthrough mapping D1–D8 to clicks and lines to say) is written;
   `docs/STATUS.md` is current; everything is committed and pushed to the session's designated branch.

## 15. Execution plan for the autonomous run (time-boxed; T = goal start)

Work in this order. Commit and push after every milestone (`git push -u origin <designated-branch>`), and append a
3-line entry to `docs/STATUS.md` (done / next / risks). If a milestone overruns its box by 50%, cut its P1/P2 items,
log them as deferred, and move on. **P0 before P1 before P2, always.**

| Milestone | Box | Content | Parallelizable |
|---|---|---|---|
| M0 Bootstrap | T+0:00–0:15 | Vite + React + TS, three, zod, @anthropic-ai/sdk, vitest, playwright, wrangler; scripts; CLAUDE.md conventions; STATUS/NOTES files | — |
| M1 Contracts | T+0:15–0:40 | `src/shared/*` (schemas, grammar, bible, rules, pricing), fixtures (EN first, RU next), schema tests. **Freeze contracts; later changes must be additive.** | — |
| M2 Engine | T+0:40–2:00 | Set (incl. creek, van), Masha and Bear rigs on Mixamo-named skeletons + procedural faces, asset manifest, open motion clips retargeted + procedural layers for every P0 verb, blend, evaluate, series look (§7.1), fx, render the fixtures | Subagent A (characters + faces + motion/retarget), subagent B (set + look + fx + asset manifest) |
| M3 Compiler + rules + parser | T+0:40–1:30 | compile, world state, camera, dialogue/visemes, audio cues, validator, offline parser + unit tests | Subagent C |
| M4 Director | T+1:15–2:00 | Worker (auth, rate limit, direct), prompt, mock mode, client, eval script | Subagent D |
| M5 App | T+1:30–2:45 | Store + paragraph pipeline (§6.5), editor, stage, story bar, remix buttons, Behind-the-scenes overlay (economics, data view, layers), i18n, integrate audio | Main thread integrates; Subagent E builds the audio engine (§7.6 buses, scheduler, TTS, vocals, foley, SFX, ambience, music) from T+0:40 against the frozen Segment contract |
| M6 Editing + polish | T+2:40–3:15 | Likeness passes 2–3 (§7.3) first, then remix polish (D7), data view (D8), performance pass | Subagent for likeness while the main thread does D7/D8 |
| M7 Verify + ship | T+3:15–3:45 | E2E, screenshots, director eval, deploy + smoke test, DEMO_SCRIPT, final STATUS | — |
| Buffer | T+3:45–4:00 | Fixes only | — |

Subagent rules: give each subagent the file list it owns plus a pointer to §6 contracts; subagents must not edit files
outside their list; the main thread merges, runs all tests, and owns `store.ts` / `App.tsx` integration. Launch
independent subagents in a single message so they run concurrently.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Stand-in characters look cheap or off-model → Animaccord's artists despise them | §7.3 likeness protocol (references, measured proportions, sampled colors, ≥ 3 scored passes); the series' soft CG look, not cel shading; good lighting; close-ups only where the face is strong |
| Director latency (Opus at low effort may take several seconds) | Instant offline preview while waiting; prompt caching; `DIRECTOR_MODEL` env lets the operator choose a faster model |
| WebGL in headless tests | SwiftShader flags; tests assert non-blank pixels, not exact images |
| TTS unavailable or voices vary | Never block; lips keep moving; Studio legend says "placeholder voice" |
| Free text breaks the compiler | Zod-strict schema + deterministic validator + offline fallback; the endpoint never 5xxs |
| Secrets leak | Worker secrets only; `grep sk-ant dist/` in DoD; no secrets in logs or repo |
| Scope creep | §3 out-of-scope list; P2 items only after every P0/P1 item is green |
| Open motion libraries can't be downloaded or don't retarget cleanly | 40-minute time box (§7.4), then procedural motion for the missing verbs; log the decision in NOTES.md |
| Frontier-LLM cost per paragraph undermines the economics story | Economics panel separates the prototype's stand-in cost from the production projection and the diffusion baseline; the eval compares Opus vs Haiku |
