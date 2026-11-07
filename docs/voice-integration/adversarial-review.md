# Independent voice integration review — 2026-11-06

Scope: selected MiniMax Lively_Girl playback, asynchronous preparation, paid-request coordination, cache, private API routes and language changes. Source review and controlled local tests only; no paid request, production deployment, credential read, or audible browser test was performed by this reviewer.

## Findings → updates

| Finding | Consequence | Update verified |
|---|---|---|
| `begin()` replaced speech-preparation `waiting=true` with the director's false pending state | A compiled fixture displayed Play while recordings loaded; ordinary Pause could not cancel preparation | Parent preserved waiting while speech prepares; controller test checks pending state |
| A transient 503 while fetching a completed fal result permanently failed the stored job | Retry could never recover the paid output | Parent retains pending state for transient result errors; regression recovers the same job without another POST |
| A custom story's language could change during preparation without changing its episode or timeline | Playback started with the new language after loading only old-language interjections | Parent rechecks language before completion and re-prepares; explicit EN→RU race regression passes |
| Missing AudioContext was detected only after an unknown line could be generated | Unsupported audio environments could spend without playback capability | Parent rejects before network access; no-request regression passes |
| Submit plus status/result/audio requests could exceed a Durable Object concurrency-block deadline | An otherwise successful request could be reset before returning | Parent now returns pending directly after submission and limits subsequent network calls to bounded timeouts; paid reservation is already durable |

## Independent regression coverage

**19 tests passed across three new files**, with frontend TypeScript check passing afterward:

- `tests/unit/speechWorker.test.ts`: concurrent normalized-line deduplication, reservation before provider I/O, fixed selected recipe, language separation, lifetime allowance, ambiguous submission across object recreation, persisted multipart audio, CDN credential isolation, untrusted CDN URL rejection, transient result recovery, authentication on generation/media paths, cross-origin rejection.
- `tests/unit/recordedSpeech.test.ts`: exact baked asset reuse without a paid call or WebSpeech fallback, parallel decode deduplication, real decoded duration, selected range and mid-line inclusion, language cache separation, explicit generation denial, single-job polling, untrusted playback URL rejection, readiness boundary, no charge without an audio context.
- `tests/unit/voicePlaybackReview.test.ts`: language switch during asynchronous voice preparation, stale completion after episode replacement, visible pending state.

The tests use fake storage, fetch and decoding. They prove the tested decisions and invariants, not production fal latency, billing or perceptual voice quality. Parent-owned browser tests must still verify actual MP3 decoding, pause/resume/seek synchronization, and absence of WebSpeech substitution in the built app. Production auth/Worker and the new Durable Object binding require deployment-time verification.

Remaining operational limit: the hard character allowance intentionally stops new generation once exhausted. Existing cached recordings remain available. Unknown submission outcomes deliberately require review rather than automatic paid retries.

## Live-runtime finding and update

The release owner's authenticated live check exposed `redirect: 'error'` being rejected by workerd before network I/O. Independent follow-up confirmed the behavior in official Cloudflare documentation/source and a local workerd runtime. Both upstream and CDN fetches now use `manual`, reject non-success status codes, and do not follow redirects.

`tests/unit/speechRuntime.test.ts` adds four native-runtime checks: reproducing the unsupported option, exercising the actual bundled coordinator through successful submission/poll/download/storage, rejecting submission redirects, and rejecting CDN redirects without forwarding credentials. The combined voice review suite passes **23/23 tests**. No secrets or paid provider calls were used by the independent reviewer. The release owner separately verified fresh English/Russian production speech and cache reuse in Chrome.
