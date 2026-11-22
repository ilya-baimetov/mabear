# Garden-to-kitchen object continuity

Local implementation; no deployment or paid asset generation.

## Scope and ownership

| Element | Control | Persistent state |
|---|---|---|
| Nine garden carrots | Existing individual prop meshes | `carrot`, `carrot_2` … `carrot_9`; planted/harvested remains explicit |
| Kitchen bowl | Static open mesh on preparation table | One carrot slot, `kitchen_bowl` |
| Existing rear-counter pot | Existing static enamel pot; no replacement | One carrot slot, `kitchen_pot` |
| Carried carrot | Existing authored animation and measured hand contacts | One actor owns the same identified prop |
| Transfer | Midpoint of authored `take` / `put_down` | Actor ↔ bowl, actor → pot; no cloning or hidden stand-in |

`src/shared/kitchenContainers.ts` defines the visible container positions, resting carrot transforms and actor approaches. Rendering, compiler and evaluator use those same definitions. Masha and Bear can reach the bowl; only Bear can deposit into the rear-counter pot. Pot retrieval is explicitly refused and preserves its contents. Unsupported reach and occupied containers preserve the prior object state.

The compiler routes the carrier through the existing doorway. Container access is serialized even when the director marks consecutive actors' beats as simultaneous. Surface transfers wait until the actor reaches the physical approach; failed navigation cannot deposit an item remotely. Bowl rim clearance is an authored vertical withdrawal, followed by movement toward the carry pose. The pot receives an above-rim release and a short time-derived fall of the same carrot. Near the pot, the carry pose raises the carrot; a bounded approach arc brings it over the opening without overextending the arm. After release, a separate empty-paw path clears the rim before lowering to idle. The handoff uses one measured palm vertex so changing mixed skin weights cannot switch the contact anchor.

The offline EN/RU parser resolves `bowl/миска` and `pot/кастрюля`, including contents references such as “Bear takes it from the bowl” in a new scene. Explicit numbered-carrot requests never substitute another carrot. A take explicitly from an empty bowl does not acquire that carrot from the garden or another hand. Carrying a prop to a place becomes that actor's walk, preserving the existing Bear/Masha shoulder-ride meaning of `carry`.

## Staging correction

The existing stove-to-preparation-table aisle was only 0.57 m between navigation silhouettes, so the rear counter could not be reached. The preparation table, helper and working prop anchors move 0.55 m toward the room front, opening the aisle to 1.12 m. The side chair aligns with its table, clear of the stove-to-counter turn; the south chair retains its 0.30 m shift. The bowl-to-pot route uses the center of this measured adult corridor instead of generic furniture-corner waypoints. Bear tucks both paws while carrying the carrot, with the same held-prop origin at the pickup and deposit endpoints. Bear approaches the bowl from outside the table edge. The original pot mesh remains on the rear counter, with a 0.34 m radius instead of 0.43 m and its center moved 0.30 m toward the aisle and 0.07 m sideways, clearing the window sill. Shared table/support constants keep ordinary cooking and pickups aligned. Food work slots are separated from the new bowl and the resting pan, with more than 4 cm of conservative mesh-footprint clearance. The child’s food pickup remains on the helper; the adult’s floor approach and lean avoid reaching through the bowl. No new textures, character assets or speculative kitchen inventory were introduced.

## Checks

`tests/unit/kitchenObjects.test.ts` exercises actual EN/RU paragraphs, unique object ownership, all eight untouched carrots, doorway continuity, arbitrary seeks/replay/serialization, deletion and replacement of scenes, occupied containers, unsupported reach, concurrent container access, ordinary cooking support, honey-pot semantics and shoulder-ride semantics.

The same test file also covers the authored counterpart of the bounded bench action: a rotated sphere must remain above the floor, retain its actual mesh origin and orientation across scene boundaries, and be retrieved from that pose without physics. Its optional free-prop rest pose is included in both director and editor material cache keys.

Actual kitchen travel and all preparatory-turn camera boundaries are checked in the same test file. Native loaded-rig contact, continuous travel framing and pot-skin checks are recorded separately by the root evidence harness. Numerical state tests do not establish visual quality or hand reach; initial native checks found and drove corrections to Bear's bowl reach and Masha's elevated bench grasp.

## Remaining boundaries

- Two one-slot static containers, not arbitrary nested inventories.
- One uncut carrot can be placed in the pot. Taking it back out is not supported; neither are cooking, chopping, liquids or mixing.
- Container transfers and the brief pot release/fall are authored, not Rapier vegetable dynamics.
- Only the two measured actors have supported container approaches.
- The limited offline parser and AI director can still require clearer wording for compound instructions outside these supported actions.
