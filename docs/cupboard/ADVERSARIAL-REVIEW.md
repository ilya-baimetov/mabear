# Adversarial review → update

Self-review of the implemented cupboard feature, using actual text stories, the regular editor and loaded character meshes. No independent reviewer is claimed.

| Finding | Impact | Update / evidence |
|---|---|---|
| First camera viewed Bear's back through the preparation-table foreground | Shelf, hand and jar movement were hard to judge | Reframed from the refrigerator side, above the aisle; inspect final action recording |
| Original generic carry target put the jar back inside the pantry | Jar clipped through the cabinet after taking it | Explicit withdrawal clears the shelf lip, then lowers into a reachable carry pose |
| A generic table-height clamp held the jar up until the pickup ended | Visible jump down at the next clip | Cupboard withdrawal owns its own vertical path; measured pickup/carry boundary discontinuity below 0.02 mm |
| Right paw could not follow the end of the opening arc naturally | Early release and excessive reach | Use the nearer free left paw for the full door stroke; right paw retrieves/carries the jar |
| Reopening while holding the jar could redirect its carrying paw | Held object moved with the door operation | Door contacts always use the left paw; rendered empty-cupboard reopening keeps ownership |
| A stable carrying pose could override a later wave/object gesture | Subsequent authored action disappeared | Blend out the special carry during those actions; added actual rendered wave check |
| Final video review caught a cut behind the refrigerator after closing | The last half-second hid the completed action | Hold the cupboard camera through the scene's final pause; scene-end camera check and recaptured footage |
| Duplicate take or a consumed jar could trigger generic prop appearance | Cupboard seemed to refill | Existing ownership/unavailability guards prevent manufacturing a second jar |
| Bear arrived holding another prop | Putting it on the same pantry anchor would overlap contents | Place the previous item visibly on the preparation table before retrieving the jar |
| Door state writes could overwrite cupboard state | Unrelated object changed after a later entrance action | Preserve sibling state and filter cues by object identity; independent-door tests |
| Old saves lacked the new prop key | Strict world-state parsing could reject saved stories | Additive default during schema load and compiler normalization; legacy-world test |
| Removing the scene could leave cached contents/open state | Editor and replay disagreed with the new text | Include cupboard and jar ownership in state/cache digests; real edit/delete/reload checks passed |

## Evidence and acceptance

- Same English text captured before and after, using an isolated pre-change source copy.
- English/Russian, implicit prerequisite, pronoun continuation, repeated request, unavailable/other-owned jar and unsupported child reach checked in story compilation.
- Actual main-app pause/resume, reverse/forward seek, replay, edits, deletion and persistence checked.
- Complete cupboard scene rendered at 30 samples per story second; geometric grip and attachment continuity checked against the live loaded rig.
- Cozy evening and Bear's nap regression samples compare exact actor states, props, contacts and cameras against the baseline.
- Final source remains local. Deployment was not requested for this task and was not performed.

## Accepted limitations

- This is an authored interaction for one reachable compartment and one contained jar, not arbitrary-container simulation.
- Hand support uses the broad imported paw surface; fingers do not wrap individually around the knob. The maximum full-strength surface gap is about 2.6 cm at the closed end of the stroke.
- Kitchen spacing and Bear's imported body remain approximate. No claim of complete mesh-vs-furniture collision or new Rapier coverage.
- Some existing general room-traversal shots still include foreground furniture/rack occlusion. The dedicated cupboard shot remains clear through the closing hold.
- Requesting other cupboard contents is outside this release; the system's general offline noun interpretation is not a full inventory language.
- No live paid AI-director call, paid generation or voice request was made. Updated prompt text has static coverage only; offline compilation and the main renderer were exercised.
