# Rapier continuity — local implementation

No deployment or external-service calls. Before source is commit `d260fe2`.

The eligible story chain is Masha taking a ball, releasing it in the central
yard, moving around furniture, returning to its simulated resting position,
and taking it again. The normal story compiler and existing Three.js rigs,
motion library, Player and contact solver remain in use.

## Ownership and timing

- Animation owns bones, facial expressions, cameras and held props.
- Rapier owns the eligible Masha root and the released ball. Release samples
  the loaded hand/socket pose. Acquisition uses the exact settled transform;
  its ownership transfer remains at the authored pickup midpoint.
- A 60 Hz canonical cache includes exact clip, release, acquisition and scene
  boundaries. Backward seeks, previews and replay read the same samples.
- An internal copy of the timeline reconciles routes and pickup contacts.
  Saved user scenes and the compiler's source timeline are never mutated.
- The visibility graph uses conservative table, bench and cooking-helper
  silhouettes inflated by the Masha capsule. Furniture marks are approached
  from a free edge. A pickup approaches the actual physical sphere position,
  not the ball's old semantic mark or rotating mesh base origin.
- If necessary, the approach borrows time from the immediately preceding
  idle, leaving at least 0.25 seconds of that idle. Pickup/scene/end times
  remain unchanged. Unreachable or still-too-short routes fall back for the
  entire story before exposing any physics-controlled frames.
- Ground support uses the matching flat yard collider, with a y=0 lower
  bound to prevent KCC numerical penetration at zero-motion positions.

## Ground-ball grasp

A ball on the ground is acquired on its exposed upper surface, lifted, then
regripped into the existing carry pose. Reaching below a resting ball was
physically impossible for the rig and caused a visible attachment jump.
The contact offset retains the actual sphere orientation after rolling.

## Validation and remaining scope

`tests/unit/rapierContinuity.test.ts` tests the real compiled story through
WASM: obstacle clearance, ground support, landed-position acquisition,
rotated ball support, arbitrary seek order, every clip/scene boundary,
preview/end holds, content invalidation and atomic fallback. It also verifies
unchanged authored hug/shoulder-ride and cupboard stories.

Native rendered-story contacts, before/after media, full editor controls and
performance evidence are collected separately in `../parallel-interactions/`.

This remains one actor and one prop in the existing covered yard. There is
no actor/actor collision, ragdoll, cloth, general pathfinding, moving-ball
chase, bench/table retrieval or expansion to other locations. A free ball
must be settled and reachable from the ground. Other actors, paired actions,
unsupported story actions and failed route/contact plans retain animation.

Continuity is validated as one transaction before playback; cold preparation
can therefore block briefly. The canonical cache makes later seeks cheap,
but this step does not move simulation into a Web Worker. Continuity chains
are capped at 60 seconds to bound that preparation; longer chains fall back
before any root or ball takeover. Simple drop-only trials retain their old
180-second cap. See the native performance results for measured cost.
