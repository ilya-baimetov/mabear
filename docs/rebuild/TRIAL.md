# Masha replacement-asset trial

The user rejected the first upgrade as marginal. This trial tests whether a different asset pipeline produces a substantial visual improvement before changing the game again.

Authorized external fal spending ceiling: **$20 total**. One completed Meshy request: **$1.40 at published rates**, leaving $18.60 of the authorized ceiling. The connector does not expose the invoiced transaction charge. See `trial.json` for the ledger and `REVIEW.md` for results.

## Input

`inputs/masha-reference-front.png` is a generated front A-pose reference, created with the built-in image generator from the official reference retained in ignored `refs/`. Prompt: `inputs/masha-prompt.txt`. It is a **2D input image**, not a rendered result from a replacement game model.

## Experiment

1. Verify fal connection, supported 3D endpoint, current per-operation cost and remaining budget.
2. Generate one textured Masha mesh. Inspect front, side and rear geometry, face silhouette, separated limbs, skirt and texture seams before spending on extra variants.
3. If the geometry is promising, rig it and test idle/walk/arm movement. Inspect face stability and skirt deformation; an attractive static mesh alone is insufficient for the story playground.
4. Render the real candidate and current character with matched camera, scale and lighting. Preserve the original deployment while assessing the candidate.
5. Return the actual comparison, spent amount, defects and recommendation. Expand to other assets only after the user judges this sample worth pursuing.

## Acceptance questions

| Check | Evidence needed |
|---|---|
| Visual quality | Actual 3D render shows a substantial improvement in facial shape, hair, cloth and silhouette |
| Likeness | Recognizably closer to the supplied reference from multiple angles, not merely higher texture resolution |
| Motion | Rig can move without severe joint/skirt collapse; disclose any missing facial animation |
| Runtime | Mesh and texture sizes can fit the existing web game; quantify actual payload and render cost |
| Budget | Record every submitted billable operation; stop before exceeding the authorized total |

Provider reference: https://fal.ai/models/meshy/v7.1/image-to-3d . At inspection on 2026-11-06 it lists $1.20 textured, +$0.20 rigging (including basic walking/running), +$0.12 for an additional animation preset. We used the included basic animations, so no extra animation charge was requested. The canonical endpoint is `meshy/v7.1/image-to-3d`, without the older `fal-ai/` prefix.
