# Masha performance checkpoint

A real WebGL before/after comparison of the shipped Masha rig and the opt-in rebuilt face/contact rig. The candidate is not enabled in the main game's actor factory; this checkpoint precedes changes to other characters.

```sh
npm run performance:dev      # localhost:5184
npm run performance:build
npm run performance:deploy  # separate authenticated Worker
```

Preview Worker: `mabear-masha-performance`. It shares the original app's authentication service and uses no director API key. See `release.json` for deployment status and verification.

The comparison supports linked orbit, a shared scrubber, quarter/half speed, camera presets, and a recording made directly from the two WebGL renderers. Three scenes cover facial expression, a lollipop grasp/taste, and palm contact. The recording is silent; it does not demonstrate improved voice generation or audio-aligned lip sync.

## Evidence

- `adversarial-review.md`: parent review and corrective changes.
- `independent-animation-review.md`: independent rendered review and follow-up.
- `independent-code-review.md`: independent regression review.
- `browser-checks.json`: final 363-frame geometry/contact sweep and deterministic seeking.
- `proof/masha-before-after-v2.mp4`: current actual 3D capture, 24.002 seconds, 1920 × 850. Smaller upper teeth, refined lids, rebuilt hands, corrected cuff and tongue joins.
- `proof/masha-before-after.mp4`: superseded first capture retained because it was shown to the user; its rounded teeth were rejected.
- `proof/final-face.png`: current face screenshot.

No new fal credits used. No other character's animation has been changed. Generated hair, clothing topology, and extreme close-up skin transitions still limit fidelity.
