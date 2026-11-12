# Revised interior integration: adversarial source review

Review scope: root integration in `compile.ts`, shared house/prop layout, runtime props and stage visibility; persistence and deterministic seek. This review is independent of the geometry author. Camera/navigation implementation was authored by this reviewer and is covered by separate actual-story proof and tests, not claimed as independently reviewed here.

## Findings

| Finding | Trigger and evidence | Consequence | Required update |
|---|---|---|---|
| Kitchen pickups still exceed the child's reach | `src/compiler/compile.ts:256` sends every Masha pickup at `house_kitchen` to the helper. `src/shared/propPlacement.ts:10–13` special-cases pancakes but otherwise scatters props around the prep-table centre. At review time the helper-to-prop horizontal distances were cake 1.36 m, flour bag 1.99 m, frying pan 1.40 m and jam jar 1.39 m; the model's measured arm length is 0.198 m (`characterReach.ts:5`). | A newly authored indoor pickup can still pull an object across the table or produce an overstretched hand/contact, even though walking reaches the helper correctly. | Put kitchen props at reachable work slots along the helper's table edge, or choose an item-specific supported stance. Test a small actor picking up a non-pancake prop using the actual rig, including the attachment frame. |
| Cooking switches remove a stationary set prop in place | `src/engine/set/houseInterior.ts:38–40` sets the enamel pot's visibility to the inverse of any adult cooking state, driven from `stage.ts:258`. | During a continuous shot the pot can disappear as cooking starts and reappear as cooking ends. Seeking is deterministic, but the change is a visible continuity pop. | Give the pot a permanent parking spot while the stove is reserved for the handled frying pan, or model a visible put-aside action. Do not solve it by an unexplained visibility toggle. |
| Gaze height ignores the new raised helper | `src/engine/player/evaluate.ts:655–657` estimates the head from root Y plus standing height; the helper raises the complete rig later in `stage.ts`. `otherHead` similarly ignores support. | A child standing 0.8 m above the floor solves her neck toward a table target as though still on the floor, producing the wrong vertical gaze; conversations can look below/above the supported actor. | Include physical support height in explicit and conversational head estimates. Recheck the helper cooking face after the correction. |

## Checks that did not produce findings

- Saved stories persist text, BeatScripts and remixes, not compiled coordinates. `store.ts:267–280` restores and recompiles, and `store.ts:646–653` rebuilds the episode from current semantic marks. An old save therefore picks up the new house stage without a database migration.
- `sceneCut` evaluation selects the source/destination pose by time and calculates opacity directly from clip progress; scrubbing does not rely on previous frames.
- Interior wall cutaways and window tint are assigned from the current camera/light state. They do not accumulate transforms or tint between seeks.
- Runtime `restPlacement` now delegates indoor props to the same shared placement function as the evaluator, removing the previous hard-coded kitchen location.
- All named destinations remain reachable in the navigation audit. Existing failing route assertions were for newly introduced inter-stage cuts; every exterior-to-exterior semantic route still reaches its target with clear ground segments.

## Evidence boundary

This is a source review, not proof that hands, chair cushions or camera framing look correct. Iteration03 and later actual-story captures must verify cooking, pickup, transfer, eating and stand-up visually. The interior is still an untextured shape/proportion pass; this review does not approve later texture work.

## Review → update status

All three findings were addressed in source before iteration04:

- Kitchen props now use dedicated east-edge work slots and `housePickupPosition(item)` on a longer real landing. The helper geometry centre is separate from Masha's cooking stance. The pan and pancake plate occupy different Z slots. Generic pickup distance drops from 1–2 m to about 0.32 m horizontally; actual-rig attachment still requires the iteration04 visual check.
- The enamel pot is permanently parked beside the stove; the action-dependent visibility function was removed. It no longer vanishes at cook-beat boundaries.
- Explicit and conversational gaze estimates include `cookingSupportHeightAt`, so the raised landing is reflected in neck direction.

Focused navigation, actual-story transition and indoor camera-clearance tests pass after these updates. New camera shots follow the exiting actor and use a measured pair composition for the seated handoff. Iteration04 is the remaining visual acceptance pass; this source report does not substitute for it.


## Iteration04 still-frame review

Viewed the actual compiler/stage captures for Cozy Evening (English) cooking, give, eat and stand-up, plus the custom kitchen visit's child cooking, Bear sitting and child eating.

- The connected kitchen, flat wall return, fireplace, reading group and raised entrance are now present in actual story shots.
- The handoff view exposes both profiles and the plate instead of putting Bear's back over Masha.
- The chair exit follows the child and shows her feet and the adult clearing the route.
- Child cooking shows the helper, both supported feet, hands and pan; the plate is separate from the working pan.
- Bear's revised seated pose no longer buries his pelvis in the cushion.

Accepted these still-frame compositions for the release. A tiny floor-edge sliver remains in the wide shot's extreme lower-right corner; this is cosmetic and does not hide the scene or an interaction. Continuous pickup/attachment and playback proof remains with the capture reviewer before source freeze.
