# Likeness log — Masha and Bear stand-in rigs (spec §7.3)

> Confidential. The stand-ins are procedural maquettes of Animaccord's characters, built only to demonstrate the
> system. Reference images live in the git-ignored `refs/` folder and are never committed or deployed.

## 1. Reference board

Downloaded into `refs/` (git-ignored) on 2026-11-05 and viewed with the Read tool:

| File | What it shows | Source |
|---|---|---|
| `Masha_and_the_Bear_2019_stamp_of_Russia_1a.jpg` | Masha, full body, three-quarter, walking, smiling | Wikimedia Commons (2019 Russian postage stamp; used on the en.wikipedia article) |
| `Masha_and_the_Bear_2019_stamp_of_Russia_2a.jpg` | Bear, full body (feet cropped), three-quarter, dancing | same series |
| `Masha_and_the_Bear_2019_stamp_of_Russia_3a.jpg` | Bear face close-up (three-quarter) + Masha head and shoulders | same series |

Limits of the board: only 3 images (all official CG renders, which is the right style). Wikimedia started answering
HTTP 429 (rate limit) after a few requests, and the Fandom wiki answers 403 to scripted requests, so no side views and
no straight-front views were obtained. Where the board is silent (side profile, back, Masha's legs) we use the
written spec (§7.3) and knowledge of the series. Retry later for: a front view of each character, Bear's side profile.

## 2. Proportion sheet (measured in pixels on the references)

**Masha** (stamp 1, full figure 253 px from kerchief top to shoe sole):

| Measure | Reference | Stand-in target |
|---|---|---|
| Head incl. kerchief / height | 108 / 253 = **0.43** | 0.40–0.42 (head + kerchief top at 1.0 m, chin at 0.63 m) |
| Kerchief outer width / height | 120 / 253 = 0.47 (widest at cheek/shoulder level: bell shape) | 0.42–0.46, widest at the bottom |
| Face (skin) width / kerchief width | 87 / 120 = 0.72 | 0.70 |
| Eye (sclera) width / face width | 20 / 87 = 0.23 in ¾ view → ≈ 0.28–0.30 frontal | 0.29 (spec says ~⅓) |
| Iris / sclera diameter | ≈ 0.65 | 0.64 |
| Eye spacing (centre–centre) / face width | ≈ 0.40 frontal | 0.38 |
| Dress: shoulders → hem / height | 107 / 253 = 0.42 | 0.40 (A-line, hem at 0.17 m) |
| Hem width / shoulder width | ≈ 100 / 60 = 1.7 | 1.8 |
| Legs visible below hem (incl. shoes) / height | 33 / 253 = **0.13** | 0.15 |
| Arms | short, puffed sleeves to the wrist | upper 0.11 m, fore 0.10 m |

**Bear** (stamp 2, ≈255 px from ear tip to sole, feet cropped; stamp 3 for the face):

| Measure | Reference | Stand-in target |
|---|---|---|
| Height vs Masha | spec: 2.4× (stamp 3: Bear head width ≈ 1.75 × Masha's kerchief width) | 2.4 m |
| Head incl. ears / height | 70 / 255 = 0.27; head without ears ≈ 0.22 | 0.22–0.25 |
| Head sits on the shoulders, no visible neck | yes | yes |
| Body width (arms excluded) / height | ≈ 0.48, widest at belly/hips (pear) | 0.45–0.5 |
| Belly patch | tan oval, ≈ 85 × 125 px: width 0.33, height 0.49 of body height; from chest (below armpits) to groin | 0.31 × 0.36 of height, centred at 1.03 m |
| Muzzle | long, protruding ≈ 0.6 × head radius forward; tan; tan face mask covers the eyes and everything below, brown widow's peak between the eyes | snout ellipsoid, tan mask |
| Nose | big black oval at the snout tip, ≈ 0.3 × head width | 0.17 m wide |
| Ears | round, ≈ 0.3 × head width, darker brown than the body, slightly lighter inner | 0.2 m discs |
| Eyes | small (≈ 0.11 × head width), white sclera visible, dark iris, highlight | r 0.033 m |
| Legs | short, thick; arms long (paws reach the thigh) | legs ≈ 0.30 of height |

## 3. Colour sheet

Median colour of hand-picked regions (`refs/` images, Python/PIL script kept outside the repo; regions listed as
x0,y0,x1,y1 on the 350 px stamps). Printed stamps are darker and warmer than the on-screen show, so each base colour
is the sampled value lifted toward the spec default and checked in the ACES-tone-mapped render.

| Region | Sampled | Spec default | Used (`MASHA_LOOK` / `BEAR_LOOK`) | Note |
|---|---|---|---|---|
| Masha kerchief (lit top) | `#893254` | `#C7317D` | `#B8327A` | sampled region partly in shadow |
| Masha dress | `#A6336C` | `#C7317D` | `#B8327A` | same fabric as kerchief |
| Masha sleeves | `#A2A5B3` | `#D9549A` | `#CFCDE8` | **spec default is wrong**: the blouse sleeves are pale lilac-grey, not pink |
| Masha skin | `#EFAB7B` | `#FFDCC8` | `#F9CBA8` | |
| Masha cheeks | `#ED9076` | `#F6A6A6` | `#F59A8C` | |
| Masha iris (green-filtered pixels) | `#3D6541` | `#3E9B4F` | `#4E9A4A` + rim `#1F4A24` | |
| Masha fringe | `#CD9563` | `#F3C64B` | `#E2AE62` / dark `#B57A3A` | spec default too yellow |
| Masha shoes | `#543137` | `#8E2457` | `#7A2A5C` | purple-magenta |
| Masha hem trim | (orange-red stripes, too thin to sample) | — | `#D9506A` | |
| Bear fur | `#603C2E` | `#7A4A2B` | `#6E4128` (pass 1) | |
| Bear belly patch | `#CF904A` | `#C9A27A` | `#D9A062` | spec default too grey |
| Bear muzzle | `#F3B771` | `#C9A27A` | `#E8B676` | muzzle lighter than belly |
| Bear nose | `#393736` | `#1E1410` | `#1E1410` | glossy; sample includes highlight |
| Bear ears | `#342F2F` | (fur) | `#4E2C1C` | darker than body |
| Bear inner ear | `#473837` | tan | `#9A6646` | only slightly lighter than the ear |
| Bear brows | `#523932` | — | `#4A2A1A` | |

## 4. Passes

Rubric (1–5, as an Animaccord art director would score it): **silhouette, proportions, face, colors, materials,
motion feel**. Screenshots: `docs/likeness/pass<N>-<char>-<shot>.png` (front, three-quarter, face close-up,
silhouette), rendered by `npx tsx scripts/likenessShots.ts --pass N` (bench page `tools/likeness.html`, warm key +
hemisphere + rim light, ACES). Motion feel is judged from the rig's secondary motion only until the motion library
is integrated (it is owned by the motion module).

### Pass 1 — 2026-11-05 04:44 UTC (first build)

**Masha** — `pass1-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3 | 3 | 2.5 | 4 | 3 | 2 |

- Silhouette: kerchief reads as a tall hood/helmet; the reference is a bell — rounder, flatter crown, widest at
  cheek/shoulder level. Dress A-line reads.
- Face: eyes bulge out of the face (sclera spheres protrude, shadowed lower rims = "frog eyes"); eyes too far
  apart and too high; nose is a pink clown ball; brows float too high; fringe is a flat helmet-shaped patch with no
  locks; sparkle artefacts on the irises (degenerate normals at the ring centre).
- Body: skirt renders darker than the bodice (inverted lathe winding), bodice is a separate tall cylinder; legs thin.
- Materials: rim of the face opening shows pinched-triangle creases.
- Fixes for pass 2: sink the eyes (depth 0.5 → 0.7), move them closer and lower, analytic iris normals, brighter
  sclera; smaller skin-coloured nose; brows lower; fringe with 4–5 locks reaching the brows; kerchief: flatter crown,
  lower and wider flare, smoother tuck at the rim; skirt profile reversed and continuous with the bodice; thicker legs,
  rounder shoes.

**Bear** — `pass1-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 2.5 | 3 | 2.5 | 3.5 | 2.5 | 2 |

- Silhouette: head sits on a visible long neck (Bear has none — the head sinks into sloping shoulders); legs too
  long and straight ("stilts"); arms thin; upper body too narrow.
- Face: snout too short and low (reference: long protruding muzzle with the nose at the tip); eyes bulge; head too
  round ("teddy").
- Colors: fur renders too orange/light vs the reference reddish-brown.
- Materials: smooth plastic; no fur breakup at all.
- Fixes for pass 2: shorter, thicker legs (hips 0.85 → 0.72 m) and a longer torso; shoulder/trapezius mass up to the
  head, neck hidden; longer forward snout; deeper eyes; darker fur; geometric fur noise on every fur surface for a
  soft tufted breakup; thicker arms, bigger paws and feet; broader cheeks, flatter crown.

### Pass 2 — 2026-11-05 04:49 UTC

**Masha** — `pass2-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3.5 | 3.5 | 3.5 | 4 | 3 | 2 |

- Better: skirt now lit like the bodice (one continuous A-line read), eyes sit in the face instead of bulging,
  button nose, brows close to the eyes, fringe has locks, thicker legs and rounder shoes.
- Still wrong: white specks on the irises (iris disc almost coplanar with the sclera → z-fighting); thin bright
  lines inside the face opening (squeezed rim band coplanar with the skin); the side puffs read as ear-muffs and
  the bell flare starts too high; fringe tips are a regular zig-zag ("crown"), not swept locks; cheek blush too faint.
- Fixes for pass 3: iris stands off the sclera (and highlights above it); the squeezed band dives under the skin;
  side puffs smaller and lower, stronger bottom flare; asymmetric swept locks; stronger blush; lash flicks merged into
  the lid mesh; tessellation trimmed (head 40 → 32, kerchief 40 → 34; 128k → 107k triangles, 28 → 26 meshes).

**Bear** — `pass2-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3.5 | 3.5 | 3 | 4 | 3 | 2 |

- Better: neck gone (shoulders slope into the head), shorter thicker legs, massive pear body, soft tufted fur
  breakup, darker reddish-brown fur close to the sampled colour.
- Still wrong: muzzle too short and wide (the reference has a long snout with the nose at the tip); head a bit
  large vs the body (head/body width 0.55 vs reference 0.47); tan mask creeps around the sides of the head (reference:
  front of the face only, brown cheeks); iris specks (same z-fight as Masha).
- Fixes for pass 3: longer, narrower snout; head radius 0.27 → 0.255 and smaller jowls; tan mask limited to the
  front; neck mesh removed (hidden anyway: 28 → 27 meshes); nose slightly smaller.

### Pass 3 — 2026-11-05 04:51 UTC

**Masha** — `pass3-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3.5 | 3.5 | 3.5 | 4 | 3.5 | 2 |

- Fixed: iris specks gone, bright lines inside the face opening mostly gone, ear-muff puffs gone, rosy cheeks
  now read, fringe locks are swept rather than a crown.
- Still wrong: **silhouette** — the kerchief still tapers toward the neck; the reference kerchief falls over the
  shoulders as a cape, so the figure reads as a bell/triangle. Small crumple artefacts remain at the inner rim
  (rolled lip narrower than the mesh resolution).
- Fixes for pass 4: rebuild the lower half of the kerchief as a bell cape over the sides and back (front under the
  chin keeps the head shape), `capeDrop` 0.26 m; wider, softer rolled lip.

**Bear** — `pass3-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3.5 | 3.5 | 3.5 | 4 | 3 | 2 |

- Fixed: longer muzzle with the nose at the tip, tan mask on the front only, head/body ratio closer.
- Still wrong: muzzle now too narrow at the base (reference: wide, heavy lower face); ears a little small; upper
  arms thinner than the shoulder mass; nose could be bigger (reference nose is huge).
- Fixes for pass 4: wider snout base, ears +12 %, thicker upper arms at the shoulder, nose +10 %.

### Pass 4 — 2026-11-05 04:54 UTC

**Masha** — `pass4-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 3.5 | 3.5 | 4 | 3.5 | 2 |

- The kerchief now falls over the shoulders: the black silhouette reads as Masha (bell kerchief + A-line dress +
  short stocking legs). Rim is clean at normal viewing distance.
- Open issues for the next pass: cape should flare a bit more and come to a soft point at the back; fringe is
  still a little zig-zag (rounder lock tips, darker roots); face could be chubbier at the cheeks with a wider happy
  mouth; fabric reads as satin, the series' kerchief/dress look soft and slightly fuzzy (raise sheen roughness, add a
  subtle fabric noise); add the white blouse collar peeking under the knot and the two orange hem stripes; shoes need
  the yellow sole accent. Motion feel cannot be judged until the motion layer drives the rig (idle fidget, bouncy
  run); secondary motion (skirt follows the thighs and sways, breathing) is in place.

**Bear** — `pass4-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3.5 | 3.5 | 4 | 4 | 3.5 | 2 |

- Face close-up now reads as the series Bear: tan mask with the brown widow's peak, heavy brows, small eyes with
  whites, big glossy nose on a long muzzle, round dark ears.
- Open issues for the next pass: belly patch should reach higher onto the chest; arms hang straight down like a
  costume — the reference holds them slightly forward and bent (motion-layer rest pose); feet could be broader;
  shell fur (spec P1) would lift materials to 4; check the head can turn without exposing a gap at the shoulders.

## 5. Next pass checklist (append new passes below)

1. `npx tsx scripts/likenessShots.ts --pass N` (vite on port 5180 is started automatically).
2. Look at every PNG next to `refs/` (contact sheets help); score the rubric honestly; list concrete fixes.
3. Apply fixes in `src/engine/characters/{masha,bear,face,rig}.ts` (look objects hold all colours and proportions).
4. `npx vitest run tests/unit/characters.test.ts` stays green (heights, bones, identity rest, apply, mesh budget).
