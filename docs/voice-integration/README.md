# Selected Masha voice integration

The user's selected Russian #2 and English #6 are the same voice: MiniMax Speech 2.8 HD `Lively_Girl`. Story playback now uses that exact recipe, with speed 1, pitch 0 and the audition's normalization settings. There is no browser-speech substitution.

## Playback

- 66 recordings cover the supplied EN/RU stories, interjections and character-tap reactions. `src/shared/recordedSpeech.json` maps normalized lines to actual MP3 files and measured durations.
- New dialogue is generated through an authenticated Worker route and cached in a Durable Object. Identical normalized lines reuse the recording across replays and sessions.
- Compilation respects the recording duration. Playback uses AudioBufferSource nodes on the same AudioContext clock as the other audio: Pause suspends that clock; Resume continues it; seeking into dialogue starts at the corresponding recording offset.
- Preparation is visible and cancellable. Unavailable speech produces an explicit error; no rejected voice takes over.

## Allowance and evidence

| Item | Estimated cost | Evidence |
|---|---:|---|
| Original eight audition recordings | $0.10647 | `../voice-audition/jobs.json`, `results.json` |
| 66 production recordings, 1,041 characters | $0.10410 | `plan.json`, nine submission receipts, three result files |
| Maximum runtime allowance, 10,000 characters | $1.00000 | Durable `reservedCharacters` counter in `worker/speech.ts` |
| Total known estimate plus full runtime allowance | $1.21057 | Below the approved $2 voice cap |

These are estimates at the checked [published MiniMax rate](https://fal.ai/models/fal-ai/minimax/speech-2.8-hd/api), not verified invoice debits. No generation job remains in flight. The asset-generation budget is separate and has not been expanded. Runtime reservations are durable and occur before submission; an ambiguous submission is held for review instead of automatically spending again. Raising the cap requires an explicit decision.

`FAL_KEY` has been saved to the `mabear-storybook` Cloudflare Worker secret store with the user's authorization. It is not bundled into the frontend or copied into this repository. CDN downloads never receive the fal authorization header.

## Review and verification

Independent adversarial review found and verified fixes for preparation cancellation, language-switch races, transient-result recovery, unavailable AudioContext spending, and bounded Durable Object request timing. See [the review](adversarial-review.md).

- 23 focused review tests passed across `speechWorker`, `recordedSpeech`, `voicePlaybackReview`, and native `speechRuntime`.
- The actual-browser `selectedVoice.spec.ts` passed against the built application and real local Worker: MP3 decode, chosen identity, mid-line seek offset, paused audio/playhead clock, resume without duplicate dialogue, and no WebSpeech call.
- The final full unit run passed 652 tests across 46 files. Release-wide browser checks and production verification are recorded in `../release-voices-locations/`.

## Authenticated production verification

The user signed into Chrome. Two fresh lines, one English and one Russian, were directed by live `claude-opus-5-5` and generated through the deployed speech Durable Object; both returned ready audio and played. Reloading the page and replaying the bilingual story returned both recordings from the durable cache without new generation. Live Pause held 5.0092 seconds; Resume advanced from that position to 5.1508 seconds. The Russian moment successfully moved into the new house interior. Exact IDs and results are in [live-verification.json](live-verification.json).

The initial live attempt exposed a Cloudflare-specific defect: `redirect: 'error'` throws during native Request construction, before network I/O. The Node mock did not reproduce that. Both provider and CDN fetches now use `manual`, with non-success status rejection; no redirects or credentials are forwarded. A native workerd regression reproduces the old failure and exercises the fixed request path, audio storage and redirect rejection. The two failed pre-fix reservations remain conservatively held and were not automatically retried.

The two successful live lines total 67 characters, estimated at $0.0067; this is included within the $1 runtime allowance, not additional to it. Known generated voice work is therefore estimated at $0.21727. Actual invoice debits remain unverified.
