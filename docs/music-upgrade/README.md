# Recorded chamber score

Replaces the production procedural music with nine generated instrumental recordings. The requested palette is acoustic chamber music: strings, clarinet/bassoon, piano/harp, and light percussion, with distinct arrangements for every existing mood. These are generated recordings, not recordings of hired musicians.

- Generation: `elevenlabs/music/v2.5` through Fal; nine 45-second requests, no retries. Current rate returned by Fal: $0.60/minute; estimated total $4.05 against the approved $5 ceiling. Final account charges were not independently retrieved. Request IDs, original URLs, and exact prompts are in [generation.json](generation.json).
- Runtime: bundled `/assets/music/*-v1.mp3`; no generation calls or provider keys during playback. Decode/cache only required moods. One-second overlap edits the recordings into roughly 44-second loops; conservative RMS/peak normalization leaves room for dialogue.
- Same mood across scenes retains one playing source. Different moods overlap with the compiler's cue fade (normally two seconds). Soft/medium/full smoothly change gain; these are not independently orchestrated stems. Dialogue ducking and master mute remain on the existing buses.
- Pause suspends the shared audio clock. Seek uses the recording's scene-section-relative offset. Late downloads join at the current phase. Optional score preparation waits at most 1.2 seconds alongside speech, with background loading continuing.
- Legacy procedural composition remains only for diagnostic comparison; production playback uses recordings.

## Audition and checks

[Playful before](playful-before.m4a) / [after](playful-after.m4a), [calm before](calm-before.m4a) / [after](calm-after.m4a). Excerpts are rendered by the actual old/new WebAudio directors and matched to 0.07 RMS before AAC encoding. Full mood assets remain in `public/assets/music/`.

`node scripts/checkMusic.mjs` against Vite renders the comparisons and measures all nine processed loops; [audio-checks.json](audio-checks.json) records finite samples, conservative peaks, RMS, and small waveform discontinuities at loop boundaries. Signal checks do not establish musical phrase continuity or subjective orchestration quality; the auditions expose those for listening.

Independent adversarial review found and fixed two issues: optional music could block playback setup for a ten-second fetch timeout; retiring a cue near its old endpoint could truncate its newly scheduled fade. The focused tests cover loading deduplication/retry, late start, seek phase, timeline extensions, and retirement. Browser verification exercises actual story playback with recorded speech and music on one pause/resume clock.

UI terminology now uses Scene / Сцена for the app's authored story sections. Internal IDs and saved-story schemas remain compatible. Individual storyboard drawings are panels; professional conventions differ between animation and live action ([Storyboard Pro](https://docs.toonboom.com/help/storyboard-pro-24/storyboard/getting-started/panel.html)).
