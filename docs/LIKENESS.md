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

### Pass 5 — 2026-11-05 05:02 UTC (performance cut: ≤ ~25k triangles per character)

The integrated app froze in headless SwiftShader (whole scene 871k triangles). Tessellation was cut everywhere,
keeping the face densest: Masha **107,072 → 25,060** triangles, Bear **125,980 → 25,228** (meshes 26 / 27).
Merged meshes now keep their index buffers (≈3× fewer vertices to shade). Sculpted head icospheres detail
32 → 14 (Masha) / 28 → 13 (Bear), kerchief 34 → 16, bodies 26 → 10–11, limbs 10–14 → 4–6, eye spheres
32×24 → 22×14, iris rings 40×14 → 32×9.

**Masha** — `pass5-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 3.5 | 3.5 | 4 | 3.5 | 2 |

- No regression: silhouettes identical to pass 4, the face reads the same in the close-up.
- The lower-resolution kerchief first showed crumpled slivers at the face opening (the "squeeze the inside into a
  band" trick needs dense meshes). Rebuilt: triangles wholly inside the opening are dropped and boundary vertices
  snap onto the oval, so the rim is now *cleaner* than in pass 4 at a quarter of the triangles.

**Bear** — `pass5-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3.5 | 3.5 | 4 | 4 | 3.5 | 2 |

- No visible regression (pass 4 vs pass 5 face close-ups side by side are near-identical; fur breakup is slightly
  coarser, which reads fine at series viewing distance).

### Pass 6 — 2026-11-05 05:06 UTC

Changes: felted fabric (roughness 0.93, sheen roughness 0.82, so it reads as felt, not satin); rounder fringe lock tips;
chubbier cheeks (0.075 → 0.088); wider happy mouth; the kerchief cape flares more and dips to a soft point at the
back; the pale blouse shows in a small V under the knot; two orange hem stripes (`#E8643C`, denser hem rows so
they resolve); yellow soles (`#E3B04A`). Bear: belly patch reaches higher onto the chest (centre 1.04 m, half-height
0.5 m); broader feet. Secondary motion now reads `sway`/`jiggle` the way `evaluate()` produces them (oscillating
0..1 signals, 0.5 = rest). Previously they were treated as amplitudes. Triangles: Masha 26.3k, Bear 25.2k.

**Masha** — `pass6-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 3.5 | 3.5 | 4.5 | 4 | n/s |

- Fabric now has the soft matte look of the series; the hem stripes and yellow soles match the reference stamp.
- Remaining: proportions. The reference torso is shorter and the dress starts right under the kerchief knot, while
  ours shows a band of bodice. The face could still be wider relative to the eyes. Low-poly sleeves show faceted
  shading at the elbow seam.

**Bear** — `pass6-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3.5 | 3.5 | 4 | 4 | 3.5 | n/s |

- Belly patch now spans chest to groin like the reference.
- Remaining: in the reference the upper body is more massive and the arms rounder at the shoulder. Motion feel
  will be scored in the integrated app (n/s = not scored yet).

### Pass 7 — 2026-11-05 05:10 UTC (first motion-feel scoring)

New in the bench: `tools/likeness.html?motion=<fixture>&char=<id>&t0=&dt=&n=` compiles a fixture episode with the
real compiler, samples `evaluate()` and renders a filmstrip with a tracking ¾ camera (both characters in the scene);
`npx tsx scripts/likenessShots.ts --pass N --motion <fixture>:<char>:<t0>:<dt>:<n>`. Strips:
`pass7-motion-f0-masha-0.png` / `pass7-motion-f0-bear-0.png` (whole "Pancake morning", 12 samples) and
`pass7-motion-f0-masha-0.2.png` (run, 0.1 s steps), `pass7-motion-f0-bear-37.png` (walk, 0.15 s steps).

Look changes: Masha's hem 3 cm lower (legs visible 0.14 m ≈ reference 0.13), chunkier shoes, iris 0.63 → 0.655 of
the sclera, lids open wider; Bear's upper body broader, fur breakup amplitude +20 % and a subtle clump value
variation in the vertex colours.

**Masha** — `pass7-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 4 | 3.5 | 4.5 | 4 | 3.5 |

- Proportions now match the reference sheet (head + kerchief 0.43, legs below the hem 0.14, chunky shoes).
- Motion: the run reads quick and bouncy, the skirt swings and tilts with the leading thigh, blinks land, and the
  wave/point/clap gestures are clear at a glance. Arms are a little stiff and the run has no squash (motion layer).
- Face is still the weakest score: it reads "cute doll" more than Masha. The reference has a wider, flatter lower
  face and a more mischievous mouth.

**Bear** — `pass7-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 3.5 | 3.5 | 4 | 4 | 3.5 | 3.5 |

- Motion: the walk is weighty, with a wide stance and visible hip bob; yawn/facepalm/surprised poses read. In some
  frames the forearms pass through the belly when the arms swing back. Suggestion for the motion layer: Bear's arm
  poses need ~10–15° more abduction (rotate `LeftArm`/`RightArm` away from the body) to clear the belly.
- Silhouette and proportions are held at 3.5: the reference shoulders are higher and rounder, and the legs even
  shorter relative to the belly.

### Pass 8 — 2026-11-05 05:15 UTC

Masha's face was compared with both reference close-ups side by side (contact sheet of stamp 3, stamp 1 and the
render). Changes: smaller eyes with a much bigger, brighter iris (r 0.045 → 0.04, iris 0.655 → 0.72 of the sclera,
`#5CB052`) and the upper lid resting on the top of the iris, as in the reference; lighter, finer brows (`#A0683F`); the
fringe comes lower; the kerchief opening is lower on the forehead and wider (top 0.8 → 0.7 rad, half-width
1.0 → 1.08 rad) so the face reads wide and round; heavier toddler cheeks (bulge 0.088 → 0.11, lower); slightly
bigger button nose; wider, lower mouth. Bear: legs shorter (hips 0.72 → 0.66 m) with the torso lengthened to keep
2.4 m, higher rounder shoulder mass, belly lower. Triangles: Masha 26.3k, Bear 25.2k (unchanged).

**Masha** — `pass8-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 4 | 3.5 | 4.5 | 4 | 3.5 |

- The face is now recognisably the same character family as the reference: round wide face in a low kerchief, big
  green irises under resting lids, rosy cheeks. It stays at 3.5 because the reference's eyes are smaller relative
  to the face and the expression is more knowing and mischievous; ours is still a little "anime doll". Spec §7.3 asks
  for eyes ~⅓ of the face width, and we stay with the spec.

**Bear** — `pass8-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 4 | 4 | 4 | 3.5 | 3.5 |

- The silhouette is now a clear pear: short thick legs, low heavy belly, high round shoulders, long arms (paws at
  the bottom of the belly), small head sunk into the shoulders.
- Materials are held at 3.5: shell fur (spec P1) would lift it, but it multiplies fur draw calls and fill cost, which
  conflicts with the headless/integrated-GPU budget. Deferred deliberately.

### Pass 9 — 2026-11-05 05:17 UTC

Masha gets her signature expression. A new `FaceConfig.mouth.smirk` adds a one-sided smile to every emotion; it fades
out while visemes play. Masha uses 0.35, Bear 0. The closed-mouth line is thicker and darker so it reads in wide
shots. The mouth sits closer to the nose (as in the reference) with a stronger corner lift. Bear is unchanged from
pass 8 (re-rendered for a complete set).

**Masha** — `pass9-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 4 | 4 | 4.5 | 4 | 3.5 |

- The knowing half-smile is the single most "Masha" cue the face was missing; with the low wide kerchief, big
  green irises and rosy cheeks she now reads as the character in the front, ¾ and close-up views. Caveat: eyes stay
  larger than in the reference, because the spec asks for ~⅓ of face width.

**Bear** — `pass9-bear-*.png`: unchanged scores from pass 8 (4 / 4 / 4 / 4 / 3.5 / 3.5).

**Status after 9 passes:** every rubric score is ≥ 4 except Bear materials (3.5; shell fur deferred for
performance) and motion feel for both (3.5; scored from `evaluate()` filmstrips; the remaining issues are in the
motion layer: stiff arms and no squash in Masha's run, Bear's forearms clipping the belly). Re-score motion feel in
the integrated app once it runs.

### Pass 10 — 2026-11-05 05:24 UTC (Bear fur material)

Bear's fur gets a procedural strand texture in the fragment shader (`furMaterial` in `rig.ts`): fine anisotropic
value flecks plus a derivative-based bump (0.0012 m) from the same mesh-local noise. It fades out when a strand
gets smaller than a pixel, so wide shots stay clean, and needs no UVs or textures. It costs no draw calls and no
triangles; per fragment it adds one 3D value-noise evaluation. The first try was far too strong (bump scaled in
noise units instead of metres) and read as a dirty carpet; scaled to metres it reads as soft plush fur in
close-ups. The brows can now take a custom material (`FaceConfig.brows.material`), and Bear's are fur.

| Bear | Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|---|
| pass 10 | 4 | 4 | 4 | 4 | 4 | 3.5 |

### Pass 11 — 2026-11-05 05:30 UTC (QA art review fixes)

QA review (main thread) and fixes:

- Masha: the kerchief **ballooned into a puffy hood** (worst when the head turns, since the cape is rigid on the
  head). Fix: shell 1.10 → 1.06 × skull radius, cape flare 0.45 → 0.18, cape drop 0.26 → 0.20 m. It hugs the
  skull now and still falls to the shoulders.
- Masha (and Bear): **pupils converged** (each eye aimed at a near target separately). Fix: parallel gaze from one
  world direction taken between the eyes, plus 0.02 rad of divergence; with no look-at the eyes follow the head's
  forward direction.
- Masha: **white speck on the dress under the knot** (the blouse V). Fix: removed. Simpler is cleaner.
- Bear: **white sclera rings look startled** (spec: small dark eyes with highlights). Fix: r 0.033 → 0.03, iris
  0.6 → 0.82 of the eye, warm off-white sclera, lids lower (-0.55 → -0.38). Now dark eyes with a thin rim and
  the highlight.
- Bear: **inner ears brown** → tan `#C8955E` (spec).
- Bear: **seams at the neck and shoulders, dark bib under the head**. Fix: chest, both shoulder caps and a neck
  ruff are now one surface. It is a smooth union of ellipsoids, ray-cast along every icosphere direction from the
  chest centre, so there is no crease. The caps are spheres around the arm joints, so the arms turn inside them
  without exposing a seam. The head, nose and ears no longer cast shadows onto the chest. That removes the hard
  "bib"; the body still casts the ground shadow.

Triangles: Masha 26.2k, Bear 26.2k; meshes 26 / 27 (≤ 44 draw calls each including shadow casters).

**Masha** — `pass11-masha-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 4 | 4 | 4.5 | 4 | 3.5 |

**Bear** — `pass11-bear-*.png`

| Silhouette | Proportions | Face | Colors | Materials | Motion feel |
|---|---|---|---|---|---|
| 4 | 4 | 4 | 4 | 4 | 3.5 |

- Bear's face now reads calm instead of startled. The head sits in a fur ruff on sloping shoulders, with no
  stacked-primitive joints in front, ¾ or close-up views. Motion feel is re-scored after 06:15 once the motion
  owner's arm fixes land.

## 5. Next pass checklist (append new passes below)

1. `npx tsx scripts/likenessShots.ts --pass N` (vite on port 5180 is started automatically).
2. Look at every PNG next to `refs/` (contact sheets help); score the rubric honestly; list concrete fixes.
3. Apply fixes in `src/engine/characters/{masha,bear,face,rig}.ts` (look objects hold all colours and proportions).
4. `npx vitest run tests/unit/characters.test.ts` stays green (heights, bones, identity rest, apply, mesh budget).
