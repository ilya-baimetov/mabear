import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { FIXTURES } from '../src/director/fixtures/index';
import { CHARACTERS } from '../src/shared/bible/characters';
import { mashaSpeechInput, speechKey, speechLanguage, MASHA_VOICE } from '../src/shared/speech';
import type { Lang } from '../src/shared/schema';
import {REACTIONS} from '../src/app/react';

const lines = new Map<string, { text: string; lang: Lang; uses: string[] }>();
function add(text: string, lang: Lang, use: string) {
  const key = speechKey(text, lang), old = lines.get(key);
  if (old) old.uses.push(use); else lines.set(key, { text, lang, uses: [use] });
}
for (const fx of FIXTURES) for (const p of fx.paragraphs) for (const b of p.beatScript.beats) {
  if (b.actor === 'masha' && b.line) add(b.line, speechLanguage(b.line, fx.lang), fx.id);
}
for (const [emote, values] of Object.entries(CHARACTERS.masha.interjections!)) for (const lang of ['ru', 'en'] as Lang[]) add(values![lang], lang, emote);
for(const reaction of REACTIONS.masha)if(reaction.line)for(const lang of ['ru','en'] as Lang[])add(reaction.line[lang],lang,'tap reaction');
const requests = [...lines.values()].map((line, index) => ({
  index, ...line, key: speechKey(line.text, line.lang),
  file: `${createHash('sha256').update(speechKey(line.text, line.lang)).digest('hex').slice(0, 24)}.mp3`,
  endpoint_id: MASHA_VOICE.endpoint, input: mashaSpeechInput(line.text, line.lang),
}));
const characters = requests.reduce((n, r) => n + r.text.length, 0);
mkdirSync('docs/voice-integration', { recursive: true });
writeFileSync('docs/voice-integration/plan.json', JSON.stringify({ voice: MASHA_VOICE, prior_audition_estimate_usd: .10647, voice_cap_usd: 2, characters, estimated_generation_usd: characters / 1000 * .1, requests }, null, 2) + '\n');
console.log(JSON.stringify({ clips: requests.length, characters, estimateUsd: characters / 1000 * .1 }));
