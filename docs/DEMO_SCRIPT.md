# MaBear — 5-minute funder walkthrough

> Confidential — prepared under contract for Animaccord. Laptop + Chrome, sound on.
> URL: https://mabear.ilya-baimetov.workers.dev (password from the operator). Open it as
> `https://mabear.ilya-baimetov.workers.dev/?pitch=1` so the **Behind the scenes** drawer is available (toggle with **Shift+B**).
> Before the meeting: log in once, click **⟲ New**, then type and render one paragraph so the director's prompt cache is warm.

| Time | Demo moment | Click / type | Say |
|---|---|---|---|
| 0:00 | Setup | Show the empty yard. Shift+B closes the drawer, so the player view is clean. | "This is a game, not a studio tool. A child writes a story; Masha and the Bear act it out." |
| 0:20 | **D1** — the magic | Click **Examples ▾ → Pancake morning**, then **▶ Play all**. | "Three paragraphs of kid text became a staged, voiced, scored scene. Nothing here is video: the frames come from this laptop's GPU." |
| 1:00 | **D3** — character knowledge | **⟲ New**, type `Bear naps. Masha wakes him.` and press **Ctrl+Enter**. Play it. | "Four words. The system knows Bear naps in the hammock, Masha tiptoes up, he tumbles out, facepalms and sighs. That knowledge is the moat — in production it's learned from your episode archive." |
| 1:40 | **D10** — sound is part of the script | Add a paragraph: `It starts to rain. Spooky music. Masha runs home shouting "Bear!"` | "Rain ambience, the music turns spooky, splashy footsteps, Masha's voice. Nobody wrote 'footsteps' — foley is automatic." |
| 2:10 | **D2** — fast, cheap iteration | Edit paragraph 1 (e.g. `Bear naps. Masha tickles his nose.`). Point at the version counters. | "Only that paragraph went back to the director; the rest is cached and simply recompiled." |
| 2:40 | **D4** — trust | Add `Bear says thank you and Masha grabs a knife.` | "Amber chip: Bear doesn't talk in the show, so he grumbles instead, and the knife became a spoon. The rules run *before* anything renders; the drawer shows each rule hit." Open Shift+B → *Rule report*. |
| 3:10 | **D7** — remix without AI | On a card: 🎥 (another camera), ☀️/🌙 (time of day), 🎵 (music mood). | "Re-rendered locally in milliseconds, at $0 — no AI call. Try doing that with video diffusion." Point at "Re-rendered locally in N ms · $0". |
| 3:40 | **D5** — economics at internet scale | Drawer → *Economics*. Leave defaults (10M users × 10 paragraphs/day). | "Per paragraph: diffusion video vs our prototype vs a small trained model. The plan is a few KB instead of megabytes of video, and rendering costs us nothing because it happens on the device." Point at plan size and FPS. |
| 4:15 | **D8** — the data moat | Drawer → *Data view*. | "This is the paragraph as tracks: Masha, Bear, camera, dialogue, vocals, foley, music, light. Every episode you've produced already exists in this format — that's the training set nobody else has." |
| 4:25 | **D9** — playable (bonus) | After a scene ends, click Masha or Bear on the stage. | "Tap a character and they react — computed on the device, no AI call." |
| 4:35 | **D6** — international | Click **RU**, then **Примеры → Блинное утро**, play. | "Same engine, Russian UI, Russian lines and voice." |
| 4:50 | Honesty + close | Drawer → *System layers*. | "We label every layer: live, stand-in or placeholder. Tonight Claude + a bible stand in for the model your archive trains. The funding builds that model." |

## If something goes wrong
- **Director slow or offline:** the card shows the instant preview and still plays (⏳ → ✅/❌). Use the Examples (fixtures, no AI call).
- **No sound:** click anywhere once (browsers unlock audio on the first gesture); check 🔊.
- **TTS voice missing:** lips still move; voices are placeholders (studio voices in production).
