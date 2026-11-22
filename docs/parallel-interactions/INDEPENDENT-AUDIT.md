# Independent integration audit

21 November 2026. Local, independent, read-only runtime review. One blocking defect was found, fixed by the carrot implementation agent, and independently verified. No additional actionable correctness defect was found within the checks below. This is a bounded review, not proof that every story works.

## Confirmed defect and fix

The compiler repeatedly inserted a prerequisite pickup that its new occupied-hand carrot rule refused. The original action then retried forever. Both ordinary text stories below timed out after three seconds:

```text
Scene 1: Masha takes the ball.
Scene 2: Masha eats carrot number 2.
```

```text
Scene 1: Masha picks carrot number 2.
Scene 2: Masha eats carrot number 3.
```

Control story `Masha picks carrot number 2.` followed by `Masha waves.` completed normally.

The implementation agent changed `src/compiler/compile.ts` to refuse acquisition of another carrot before inserting the prerequisite, retain the held item, and stop repeated prerequisite attempts with the same original beat and material state. Inspection found no queue-index loophole in that guard. New regressions are in `tests/unit/gardenCarrots.test.ts`.

## Independent fix verification

Eleven isolated direct-text probes completed with exit code 0, collectively taking approximately 3.7 seconds including process startup. Each had a three-second timeout. Held ball/carrot identity remained with Masha; the requested carrot remained planted. These were real parser/compiler inputs, without hand-authored BeatScripts.

Run from the repository root; this reproduces the exact eleven-case verification matrix:

```sh
python3 - <<'PY'
import subprocess, json
cases = []
for holding in ['the ball', 'carrot number 2']:
    for action in ['eats carrot number 3', 'gives carrot number 3 to Bear',
                   'throws carrot number 3 to the clearing', 'drops carrot number 3']:
        cases.append(['Masha takes ' + holding + '.', 'Masha ' + action + '.'])
cases += [
    ['Masha picks carrot number 2.', 'Masha eats carrot number 3.'],
    ['Маша берёт мяч.', 'Маша ест морковку номер 2.'],
    ['Masha picks carrot number 2. Masha eats carrot number 3. Masha gives it to Bear.'],
]
for texts in cases:
    lang = 'ru' if texts[0].startswith('Маша') else 'en'
    code = (
        "import {textStory} from './scripts/interactive-objects-fixtures.ts';"
        "const t=textStory(" + json.dumps(texts) + "," + json.dumps(lang) + ");"
        "const s=t.segments.at(-1).segment.endState;"
        "console.log(JSON.stringify({duration:t.duration,holding:s.actors.masha.holding,"
        "c2:s.props.carrot_2,c3:s.props.carrot_3,ball:s.props.ball}));"
    )
    try:
        result = subprocess.run(
            ['node', '--import', 'tsx', '--input-type=module', '-e', code],
            capture_output=True, text=True, timeout=3)
        print(json.dumps({'texts':texts, 'exit':result.returncode,
                          'stdout':result.stdout.strip(), 'stderr':result.stderr}))
    except subprocess.TimeoutExpired:
        print(json.dumps({'texts':texts, 'timeout':True}))
PY
```

The original carrot-2/eat-carrot-3 case was rerun exactly. The originally failing English ball/eat-carrot-2 case was covered after the fix by English ball/eat-carrot-3 and Russian ball/eat-carrot-2; it was not separately rerun verbatim.

## Additional physics and integration checks

The physics probe compiled text with `textStory`, created `createRapierReplay`, called `setTimeline`, and inspected the ending frame. Its deterministic test socket was `sampleBall: f => ({pos:[f.actors.masha.pos[0]+.1,.4,f.actors.masha.pos[2]+.25],rotation:[0,0,0,1]})`. This tests simulation and ownership, not the loaded rig or GPU rendering.

Base scenes, in order:

1. `Masha takes the ball and walks to the bench.`
2. `Masha drops the ball and waits.`
3. `Masha walks to the clearing. Masha waits. Masha takes the ball.`

| Probe | Exact variation | Observed result |
|---|---|---|
| Repeated cycles | Append `Masha drops the ball and waits.` and then repeat scene 3 | 35.791-second story; two physical pickups; no fallback; final ball owner Masha |
| Later scene | Append `Masha waves. Masha walks to the clearing.` to the base scenes | 27.296-second story; one physical pickup; no fallback; final ball owner Masha |
| Unsupported transfer | Keep base scenes 1–2, replace scene 3 with `Bear takes the ball.` | Authored fallback; final ball owner Bear agrees with ordinary evaluation |
| Immediate retrieval | Keep base scene 1, then `Masha drops the ball. Masha takes the ball.` | Atomic authored fallback: `ball is not settled at the retrieval approach` |

For repeated cycles and the later-scene case, comparison at each scene boundary ±0.00001 seconds measured a maximum Masha root displacement of about 0.000000946 m. This is a scene-boundary check, not a complete motion-quality measurement.

Read-through also covered preview-prefix handling, source timeline cloning/invalidation, carrot ownership and planting reconstruction across scenes, legacy normalization, unsupported-story eligibility, and shared static-asset loading/disposal. No second actionable defect was identified from those checks.

## Limits and handoff

- No browser, live GPU, native rig-contact, camera-visibility, media-quality, or performance acceptance review was performed by this auditor.
- No remote APIs, paid services, deployment, commits, runtime edits, or broad test-suite rerun were performed.
- Probe output was observed in the audit chat; no separate raw probe log was saved. The command above is reproducible and the physics inputs/setup are recorded here.
- Final full-suite/build checks, native visual validation after the subsequent carrot-row/contact adjustment, source fingerprinting, and captures remain root's responsibility. The audit does not certify those later results.

## Evidence-method review

A subsequent **read-only** review inspected the capture, performance, packaging and media-check scripts. No browser, tests, capture or performance probes were run by this auditor.

The baseline/current fixture files were byte-identical; harness differences were header wording only. Capture advances the actual evaluator and stage using wall-clock elapsed time, so the 1× playback claim is supported. Native Player controls are verified separately, as the README states.

The initial dedicated performance script measured only story seconds 0–8. This excluded ball retrieval at 25.451 seconds and carrot placement/retrieval at 15.185/25.308 seconds in the reviewed evidence. Root accepted this gap and requested full-story measurements, with cold preparation reported separately. The auditor did not execute or accept that final rerun; root and the evidence agent own its acceptance and record it separately.

| Field | Measurement boundary |
|---|---|
| `coldMs` | Cold replay-cache end seek after assets/WASM load; not application startup |
| `renderP95` | Synchronous render-call CPU/driver time; not asynchronous GPU execution time |
| Recording/package `frames` | Render callbacks, not encoded video frames |
| Package `duration` | Sum of scene spans; media playback reads actual container duration |
| Capture-proof benchmarks | Initial five-second samples; final performance comparisons should use the corrected dedicated `performance.json` |

The runtime fingerprint covers `src`, as documented. No additional concrete story/provenance mismatch was found. Root subsequently reopened a camera-only correction for the initial ball grab; that correction and its final capture were **not reviewed by this auditor**.
