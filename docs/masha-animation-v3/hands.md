# Masha hand and contact refinement

Masha only; the candidate remains opt-in. No other actor, prop mesh, shared motion implementation or production actor factory was changed. Existing three-second taste timing and the facial `mouthTarget(frame)` callback are preserved.

## Changes from the earlier performance candidate

| Area | Previous problem | Updated result |
|---|---|---|
| Rest silhouette | Long straight fingers read as claws; relaxation was an interpolation toward a prop-grasp shape. | Shorter, fuller child fingers, rounded pads, less splayed thumb and an independent natural relaxed pose. |
| Grasp | The prior thumb/finger shape could intersect the 6mm-radius stem or leave visible gaps, despite perfect socket agreement. | Curves wrap the measured stem; opposing thumb and four finger pads conform to its cylinder. Geometric tests inspect the rendered surfaces, not only the socket. |
| Clap contact | The anchor sat in front of an off-center palm point, allowing about 2mm of pad overlap. | Contacts use the actual ellipsoid support along the shared contact plane. Wrists angle outward and fingers cup gently away, keeping palms, fingers and cuffs separated. |
| Clap timing | Symmetric mechanical approach/release with rigid vertical wrists. | Faster approach, 60ms contact hold, slower release and a small asymmetric wrist opening. Seeking remains an absolute-time evaluation. |
| Diagnostics | An authored target gap could be mistaken for a measured surface gap. | The runtime field is named `targetSurfaceGap`; independent surface measurements are recorded separately. |

## Actual surface verification

[hand-surface-checks.json](hand-surface-checks.json) was measured from the candidate's transformed WebGL mesh geometry. The prop frame uses the real socket position/orientation, excluding inherited bone scale, exactly as the prop renderer does.

- 61 samples across one full clap cycle: minimum separating-plane clearance over both hands' palm/finger/thumb/cuff vertices is 0.4016mm. During the contact hold it stays 0.4016–0.4017mm. Because all vertices of each triangular hand surface stay on their respective side of a separating plane, those rebuilt hand surfaces do not interpenetrate in this bounded sweep. This is intentionally a submillimetre visual contact, not a claim of zero mathematical gap.
- 16 samples through the three-second grasp/taste cycle: nearest surface gaps to the stem, testing vertices and triangle centers, range 0.0137–0.1603mm across the four fingers. The opposing thumb stays 0.107–0.112mm away. Every digit is within 1mm; no sampled point penetrates the cylinder.
- The tests initially caught a 0.78mm middle-finger crossing and a 1.9mm closed-finger gap; both were corrected rather than relaxing the assertions.

`npx tsc --noEmit -p tsconfig.performance.json` passes. `npx vitest run tests/unit/mashaPerformance.test.ts tests/unit/mashaContacts.test.ts`: 11 tests pass. These include actual-GLB stand/sit/sleep/carried reach checks, deterministic seek restoration, the new 61-frame separating-plane check and the opposing-digit stem checks.

## Visual inspection and limits

Actual updated captures: [hold](proof/updated-candidate-hold.png), [taste](proof/updated-candidate-taste.png), [clap](proof/updated-candidate-clap.png), [clap side](proof/updated-candidate-clap-side.png). Earlier-candidate stills are retained with `before-candidate-` names for internal review; the user's primary before/after remains current shipped game versus candidate.

The hand silhouette is softer and the grasp is visibly closed. Source clothing seams and the plain rolled cuff remain below production-cartoon quality. The contact solver is authored for this Masha asset and lollipop; this is not a general collision solver, and the finite sampled checks do not prove every arbitrary pose or prop. Full temporal judgment belongs to the parent recording and independent animation review.
