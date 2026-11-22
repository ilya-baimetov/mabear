# Carrot adversarial review → update

Independent reviewers: parent agent (runtime/editor/API and geometry/resource paths), Rapier implementer (object ownership/persistence/capacity), evidence agent (native render sweep and actual-story screenshots). No deployment or paid service calls.

| Finding | Update | Behavioral proof |
|---|---|---|
| Picking generic `carrot` could target the old singleton while decorative plants stayed visible | Nine stable prop IDs replace the front bed instances | Native sweep verifies unchanged transforms of the eight unpicked carrots |
| Garden action was an unreadable wide shot; bench action was occluded by the table | Authored close action views from the hand side; ball action views track the evaluated root too | Actual-story captures and normal editor screenshot |
| Explicit bench walks targeted the seat centre and departures clipped its corner | Carrot-specific routes use a front waiting point and clear left corner for arrival and departure | Full actual-story footprint sweep at 31 ms intervals |
| Masha stood inside raised soil with feet at ground height | Front row moved to reachable bed edge; actor-specific approach remains outside front board | Native pose/root inspection and feet visible in final capture |
| Initial grasp targeted the buried root, causing a 14 cm attachment jump | Grip moved to exposed leafy stem; supported crouch shared with the Rapier contact update | Final exposed-stem/soil-row sweep measured Masha 15.82 mm, Bear approximately 0.03 mm; Hare 33.61 mm is retained as an explicit secondary-rig limit |
| Sideways carrot penetrated bench by about 8 cm and overhung its narrow seat | Lengthwise orientation and measured mesh offset; shared renderer/compiler placement | Native bbox minimum y 0.473 m above the 0.470 m seat; z within seat |
| Two carrots placed on bench overlap because identity slots were too close | One capacity-limited bench carrot slot; occupied refusal preserves held object; auto put-aside uses a free supported mark | Occupied-slot, freeing-slot and clap-with-occupied-slot story tests |
| Throwing legacy `carrot` back to garden could restore `planted: true` next scene | Modern releases persist `planted: false`; legacy migration only applies once to old schema | Throw/release → next paragraph tests |
| Generic garden request could retrieve a carrot from bench instead | Filter by named source and prefer still-planted objects | Two harvests separated by bench placement test |
| Explicit unavailable/consumed identity could be recreated or stolen | Refuse impossible ownership transitions; retain current owner | Consumed, wrong-owner, invalid-number and occupied-hand cases |
| New close views created very short camera fragments; long split moves restarted | Merge short fragments; sample each split cue's actual endpoint keys | Randomized compiler invariants and evaluated camera continuity test |
| Occupied-hand carrot prerequisites could repeatedly insert a refused pickup | Refuse impossible acquisition before insertion; a state-keyed retry guard stops any failed pickup prerequisite that makes no progress | Timed independent EN/RU direct-text matrix and occupied/foreign-item unit cases |
| Row too close to front board made crowns emerge from wood | Move crowns fully inside soil; keep feet outside and use exposed-stem grip plus authored forward lean | Final native geometry/contact probes |
| New enum inputs exposed a pre-existing infinite cupboard prerequisite repair | Reject inaccessible/absent prerequisites before inserting `take` | Exact eat/give/throw/drop BeatScript regressions; seeded compiler fuzz terminates |
| Nine asset identities could decode/upload nine copies | Shared loaded model resources, independent object transforms | Parent's resource-sharing and cancelled-stage tests |
| Typed ball drop lacked explicit item/holding resolution; waiting was not recognized | EN/RU drop and wait parsing, with ball identity preserved | Typed English/Russian take → drop tests and shared continuity story checks |

Remaining limits are stated in [README](README.md); later full-suite/build/visual results are recorded with the shared evidence package. The review does not claim rigid-body carrots, arbitrary container contents or comprehensive contact polish for every actor.
