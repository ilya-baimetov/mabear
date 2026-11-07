# Masha voice audition

Same-origin route: `/voice/`. Russian and English; same spoken text across the current browser voice and four generated candidates. Candidate selection is local to this audition and never replaces production voices.

| Option | Endpoint | Voice | Direction |
|---|---|---|---|
| Current | Existing Web Speech implementation | User's saved choice or existing ranking | Current Masha pitch/rate; actual device voice shown |
| A | google/gemini-3.8-flash-tts | Leda | Bright, playful acted delivery |
| B | fal-ai/minimax/speech-2.8-hd | Lively_Girl | Light, mischievous stock voice |
| C | fal-ai/qwen-3-tts/voice-design/1.7b | Designed synthetic voice | Custom youthful cartoon direction |
| D | elevenlabs/tts/eleven-v4 | Jessica | Expressive stock alternative |

These are audition directions, not verified rankings. Character age, Russian pronunciation, and emotional acting need the user's listening judgment. Stock voices may sound older than Masha. Separate Qwen generations do not guarantee identical timbre across languages. No real performer's recording or episode audio was submitted to a generation model.

## Budget and provenance

User explicitly approved **up to $2 additional** for this audition. One batch of eight jobs completed, no retries. Published spoken-character estimate: **$0.10647** for 338 characters across four rates. This is an estimate, not an account debit or invoice; style instructions and provider billing details may affect the charge. All eight jobs are short and the $2 ceiling remains controlling. `jobs.json` records accepted job handles, exact submitted recipes and the approval. `results.json` preserves unchanged model results, including returned audio URLs and ElevenLabs timing data. No added credits were treated as permission to spend more.

Live schemas/prices were checked before submission. Original downloaded outputs are retained beside derived `*-level.wav` website assets. Native fal gallery was presented using unchanged completed results. Originals are downloadable generation outputs; website copies serve the actual integrated audition.

## Comparison fairness

Decoded with macOS AudioToolbox. `audio-checks.json` records actual durations, rates, channels, bytes and gain. Derived WAVs only apply constant gain to approximately -20 dBFS RMS across samples above -50 dBFS, capped below -0.5 dBFS peak. This is **not LUFS normalization**. No pitch shift, time stretch, denoise, vocal enhancement, or silence trimming. Browser TTS cannot be captured through WebAudio here and remains device-dependent.

Current voice imports the game's actual `chooseVoice`, `childPitch`, `profileFor` and existing localStorage preference. The audition has an independent visible current-voice volume control, starting at80%, so a muted/zero-volume game cannot silently bias the comparison. Independent review caught and corrected that issue. Changing this control does not change game settings. The browser voice is not represented as a generated audio file.

## Review and updates

- Independent review caught native speech remaining paused after cancel. Fixed cancel + resume before restarting or switching language, with a mock-speech browser regression.
- Direct `/voice/` links now retain the audition destination through the shared password login; the return cookie only permits this fixed local route.
- Prevent simultaneous playback: a recording pauses other recordings and cancels current TTS; starting TTS pauses recordings. Switching language stops all previous audio.
- Baseline speech has explicit unavailable/error/completed state; no fake waveform or fabricated recording.
- Candidate preference persists separately per language and does not touch game voice preference.
- Model details are collapsed; the listener sees directions and option letters before vendor names.
- UI transparently distinguishes available recordings from device-dependent browser synthesis.

## Validation

- All eight actual files decoded; durations 13.09–17.09 seconds. Nonzero speech RMS, no clipping after constant gain.
- CUA Chrome: actual current voice selection shown as Milena for Russian; generated sample A starts, sample B pauses A; language switch loads all four English recordings and pauses previous audio. Browser end events were observed, not a perceptual voice-quality assessment.
- `tests/e2e/voiceAudition.spec.ts`: actual built Worker/password gate; all eight recordings load and advance; exclusive playback; per-language choice persistence; no production voice preference mutation; mobile width; no page errors. Both browser scenarios passed on port8798, including paused speech restart/language switching. The real installed voice still needs listening judgment.
- Proof screenshots in `proof/`. Tests use mock director but the audition does not invoke a director.

Official reference: [Google speech generation](https://ai.google.dev/gemini-api/docs/speech-generation), [ElevenLabs voice design](https://elevenlabs.io/docs/eleven-creative/voices/voice-design). Endpoint contracts and pricing are retained in the tool history; filenames alone are not quality evidence.
