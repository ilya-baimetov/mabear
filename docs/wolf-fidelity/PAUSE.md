# Historical pause snapshot — resumed and superseded

See README.md for current verification and proof.

# Paused for app restart

Agent: fidelity_wolves. No paid jobs, no browser/GPU sessions, no running process handles.

## Changed files

- `src/engine/characters/wolf.ts`: first substantial geometry pass written, NOT visually validated. Shorter legs, rounder torso and haunches, larger distinct head/muzzle/eye proportions, pale broad belly, reduced feather-like tufts, physical lower jaw animated from face emotion/viseme, rounder pale paws, smoother bushy tail.
- `tools/wolf-fidelity-baseline.ts`: exact original wolf module with imports remapped, intended for matched-angle before/after harness. Not imported by production.
- `docs/wolf-fidelity/references/sly-wolf-official.webp`
- `docs/wolf-fidelity/references/silly-wolf-official.webp`

## Important resume blockers

1. Skeleton changed but motion dimensions were NOT updated. Root had not granted ownership of `wolfStyle` in `src/engine/motion/verbs/common.ts` when pause arrived. DO NOT ship as-is. Proposed matching values at base 2m: hipHeight .8; leg x .135, y -.05, thigh .35, shin .33, ankle .07, toe .15; shoulderHeight ~1.31. Needs runtime ground/contact verification.
2. Typecheck initially reported TS17006 for unary minus before exponentiation at wolf.ts:215. Parentheses fixed immediately before pause; no subsequent check run. Other type errors may remain.
3. No rendered after evidence yet. Need matched-angle before/after view, official-reference comparison, idle/walk/sit interaction checks, mouth/profile review, geometry bounds/ground contacts. Wait for root GPU availability.
4. Jaw is a new physical joint driven by mouthShapeFor. Shared humanoid mouth decal hidden. Must inspect tongue, teeth, palate and muzzle overlap under multiple emotions and profiles.
5. Existing CHARACTER_HEIGHTS kept at 2.05/1.93. Geometry heights now approximate those; measure actual bounds.

## Reference interpretation

Official portraits: https://www.mashabear.com/en-us/characters/sly-wolf and https://www.mashabear.com/en-us/characters/silly-wolf . Image paths /assets/images/characters/{sly-wolf,silly-wolf}/1.png@x1.webp . Episode close-up already local: docs/yard-reference/frames/episode17-300s.jpg; full-body seated: episode17-298s.jpg . The huge bellies at298s are a porridge-overeating gag, not normal anatomy. Normal wolves are lean but rounded, with substantial thighs/shoulders and large faces; do not make them fat bears.

Big gray Wolf has high forehead, large rounded nose and broad muzzle. Smaller warm-gray Wolf has flat brow, longer slimmer muzzle and smaller oval nose. Existing bible assigns taller Wolf as leader; official Sly is flatter-brow and longer-muzzled. Actor IDs unchanged; parent should reconcile names/personality separately.

## Next steps

Run typecheck, acquire only wolfStyle motion function ownership, create standalone tools/wolf-fidelity.html + .ts harness using baseline/current imports, render matched shots in same lighting/pose/camera, iterate from actual pixels. Existing wolves screenshot docs/yard-reference/after/wolves-story.png shows baseline skinny models but does not substitute for controlled comparison. Update root with evidence. No paid generation authorized for this subtask.
