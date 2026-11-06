# Character asset revision

Private Animaccord presentation prototype. These are newly authored, rigged approximations; no production character files were supplied.

Reference sources inspected:

- [Official Masha character page](https://www.mashabear.com/en-my/characters/masha), [reference render](https://www.mashabear.com/assets/images/characters/masha/1.png@x1.webp).
- [Official Bear character page](https://www.mashabear.com/en-my/characters/bear), [reference render](https://www.mashabear.com/assets/images/characters/bear/1.png@x1.webp).

Reference renders are stored only under ignored `refs/`. They are not runtime assets and must not be deployed.

| Area | Observed problem | Revision |
|---|---|---|
| Masha eyes | Oversized green irises, protruding white spheres, bright artificial reflection disks | Smaller eyes and irises, recessed flattened eyeballs, warm sclera edge shading, smaller highlights, radial iris fibres |
| Masha face | Nose looks attached as a separate sphere; cheeks lack shaping | Nose tip, bridge and cheek mass sculpted into the continuous head mesh |
| Masha hair | Broad scallops read as moulded plastic | Finer irregular fringe edge, directional ridges, root extends beneath scarf |
| Masha clothes | Puffy helmet shape and plain dress stripes | More explicit scarf peak, shortened cape, subdued purple-magenta, filtered cotton weave, herringbone hem |
| Bear head | Small face, intersecting snout/cranium seam | Larger head and broader muzzle; a single smooth implicit head/muzzle surface |
| Bear and Wolves | Coarse bumpy outer form, insufficient fur at silhouettes | Lower geometry noise; directional fine strand shading plus tapered surface fibres that skin with the existing bones |
| Shared materials | Overbright eye glow and shiny skin | Lower eye emissive response, softer highlights, rougher skin and cloth |

The fur fibres are merged into the existing character material batches before skin binding. They add geometry without additional draw calls, shell overdraw, downloads or frame-time allocations. Eyes and clothes retain deterministic animation and the existing fade mechanism.

Geometry checks, 2026-11-05:

| Rig | Triangles | Draw calls including its shadow pass |
|---|---:|---:|
| Masha | 31,797 | 12 |
| Bear | 29,670 | 5 |
| Big Wolf | 28,314 | 4 |
| Little Wolf | 28,314 | 4 |

`tests/unit/characters.test.ts`: 40/40 passing, including skeleton structure, pose/viseme combinations, grounding, fade stability, and the unchanged draw/triangle budgets. Final `npm run typecheck` also passed after the geometry, iris, cotton, and hair shader changes.

Visual review is iterative. The first refreshed Masha close-up still showed large eyes, a separate button nose and a gap under the scarf. Those findings led to the second geometry refinement. Final rendered inspection and remaining limits are recorded below once captured; these checks do not constitute Animaccord approval or production likeness certification.

## Final still review

Reviewed `masha-final-face.png`, `masha-final-front.png`, `masha-final-three.png`, and `desktop-current.png` against the official reference above. Also reviewed the earlier Bear close-up (`bear-pass2.png`). These are observations from the actual rendered build, not a score inferred from the code.

| Check | Finding | Disposition |
|---|---|---|
| Eye/face intersection | Both pupils and iris rims remain visible in the final front and three-quarter views; the prior far-eye clipping is gone | Fixed in reviewed views; extreme gaze and moving poses still need animation QA |
| Hair/scarf join | The dark open-looking strip under the scarf peak is no longer visible | Fixed in reviewed views |
| Nose | The separate ball and broad bridge from earlier passes are replaced by a small, continuous facial relief | Improved; still a simplified facial sculpt |
| Material/readability | Hair reads pale blonde with finer strands; eye highlights are smaller; magenta clothing is calmer; Bear's muzzle/fur is substantially more coherent | Meaningful visual improvement over the original prototype |
| Masha likeness | Headscarf, blonde fringe, green eyes, front teeth and dress identify the character readily | Approximation remains: broad round face, very regular eyes, simple mouth and mitten-like hands lack the production model's nuance |
| Clothing and pose | No obvious holes or detached pieces appear in the reviewed stills | Waist join and regular hem pattern remain visibly procedural; neutral benchmark arms read stiff |
| Full-game framing | In `desktop-current.png`, both protagonists occupy a small area of the canvas while a large foreground lawn dominates | A composition issue, not a rig defect. Prefer a closer opening shot or an early character-focused camera beat for the presentation |

Verdict: the revised characters are suitable for another private prototype review and materially improve the original assets. They are not equivalent to production art. No obvious remaining clipping defect was found in these four final stills, but still-image review cannot certify motion, extreme expressions, object contact, or every camera angle. The main integration pass owns Wolves and animation review. Avoid claiming Animaccord art approval, production parity, or complete likeness validation.

Final integration follow-up: the pancake motion filmstrip and Wolves three-quarter render were inspected. The larger Bear head exposed an inherited shoulder-ride overlap; rider clearance and actual-eye camera targeting were corrected, then verified with raycasts against Bear’s posed skinned mesh and the final `carried-focus-final.png` render. The establishing shot was tightened after the small-character framing finding. These changes close the specific reviewed defects; they do not certify every generated action/contact.
