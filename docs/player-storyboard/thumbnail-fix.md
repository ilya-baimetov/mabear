# Settled storyboard frames

The live voice check exposed a misleading card: an indoor moment showed the yard because every thumbnail sampled its first 0.4 seconds, during the incoming location handoff.

Thumbnails now sample the middle of a spoken line, otherwise a substantial action, then move past hidden location handoffs. This chooses a render time without seeking or starting the player. The existing same-task monitor restoration remains unchanged.

Five real-compiler regressions pass: bilingual indoor dialogue and the return outside, pond fishing, a travel-only handoff, and empty/very short bounds. Frontend and Worker TypeScript checks and `git diff --check` pass.

The actual browser proof used the English Cozy evening fixture with no paid requests. Its three cards show the house, the seated meal, and the return outside. The playhead remained at 0 and playback stayed stopped before and after capture; there were no page errors. See [full studio](06-indoor-thumbnails.png), [first card](07-indoor-first-thumbnail.png) and [capture assertions](thumbnail-proof.json).

The heuristic selects one representative instant per moment. It is not an editorial shot picker and cannot summarize every action in a long paragraph.
