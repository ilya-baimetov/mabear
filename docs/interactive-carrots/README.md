# Individually addressable garden carrots

Implemented locally on 21 November 2026. **Not deployed.** No external-service credits or new generated assets were used. The shared comparison, actual-story recordings and device measurements are in [parallel-interactions](../parallel-interactions/).

## What changed

The south/front garden bed now contains nine independent objects: `carrot` is number 1; `carrot_2`–`carrot_9` are numbers 2–9, left to right viewed from the yard. They replace that bed's decorative instances. The rear bed remains background scenery.

A story can select one carrot, pull it out, carry it, put it on the bench and retrieve that same carrot. The other eight remain in place. Each carrot uses the existing textured model; one decoded model and its GPU resources are shared across independent transforms.

| State | Persistent contract | Transform owner |
|---|---|---|
| Planted | `at: garden`, `planted: true` | Garden slot, reconstructed from story time |
| Held | `at: actor`, `planted: false` | Existing authored hand/contact animation |
| Placed | `at: supported mark`, `planted: false` | Shared surface placement, with visible hand release |
| Eaten | `at: hidden` | Hidden; a later request cannot regrow that identity |

No carrot rigid bodies were added. Carrot actions retain animation ownership; a mixed unsupported physics story falls back coherently to authored animation.

## Try in the normal editor

English, one paragraph per scene:

1. Masha picks carrot number 2 from the garden.
2. Masha walks to the bench and puts carrot number 2 on the bench.
3. Masha walks to the clearing.
4. Masha picks carrot number 2 from the bench. Masha waves.

Russian:

1. Маша берёт морковку номер 2 с грядки.
2. Маша идёт к скамейке и кладёт морковку номер 2 на скамейку.
3. Маша идёт на поляну.
4. Маша берёт морковку номер 2 со скамейки. Маша машет.

`Second carrot`, `carrot 2`, `вторую морковку` and `морковку номер 2` address the same identity. Generic requests select an available planted carrot at the requested place, rather than stealing a held carrot or resurrecting a consumed one. Numbers outside 1–9 do not silently select carrot 1.

The director prompt/schema expose the same identities and `put_down` action. Verification uses the local deterministic director; no paid live-director request was made.

## Boundaries

- The bench has **one carrot slot**, clear of the existing book. If occupied, a second deliberate placement is refused and the new carrot remains held. Retrieving its occupant frees the slot. The garden path has separate loose-carrot positions.
- One hand carries one item. A second carrot requires freeing the hand first. A receiver holding a carrot cannot silently accept another item.
- A request to drop a carrot becomes a gentle authored placement at the actor's current semantic place, with a compiler repair note. This is not a simulated fall. The ball retains the Rapier drop path.
- The task's matched playback covers Masha. Native probes measured a 15.82 mm planted-carrot handoff for Masha, approximately 0.03 mm for Bear, and 33.61 mm for Hare. Hare's short rig retains a visible small acquisition correction; broader actor/placement polish remains deferred.
- A whole-world object system, planting/growing, packing piles of objects, cloth and new paired-body physics remain outside this change.

## Verification

`tests/unit/gardenCarrots.test.ts` checks English/Russian actual text, exact identity, contact-time ownership, unchanged neighbors, arbitrary seek order, replay, scene replacement/deletion, cache digests, old saves, occupied hands/bench, consumed objects, generic source selection, invalid numbers and no replanting after throw/release.

The adversarial round also exposed a latent compiler repair loop: Masha could repeatedly try to acquire an unreachable cupboard item before throwing/eating/giving it. The compiler now refuses the impossible prerequisite instead of looping. Exact BeatScript regressions cover those requests.

Typecheck and 55 targeted behavioral checks passed after the final prerequisite-loop and bench-routing fixes. The shared final report records final test counts, full suite/build, normal editor control checks, source fingerprint, native contact measurements and recordings. Contact errors are measured on the rendered rigs; no zero-error claim is made.
