import { childPitch, chooseVoice, profileFor } from '../src/engine/audio/tts';
import { MIX, masterLevel } from '../src/engine/audio/bus';
import portrait from '../src/app/components/assets/masha.webp';
import './style.css';

type Lang = 'ru' | 'en';
type Candidate = { id: string; letter: string; label: string; model: string; voice: string; clips: Record<Lang, string> };
type Manifest = { text: Record<Lang, string>; candidates: Candidate[] };
let lang: Lang = 'ru';
let manifest: Manifest;
let baseline: 'idle' | 'playing' | 'paused' = 'idle';
let baselineVolume = .8;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let utteranceGeneration = 0;
const app = document.querySelector<HTMLDivElement>('#app')!;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const get = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* optional preference */ } };
function voice() { return typeof speechSynthesis === 'undefined' ? null : chooseVoice(speechSynthesis.getVoices(), profileFor('masha').lang[lang]); }
function stopBaseline() {
  utteranceGeneration++;
  if (typeof speechSynthesis !== 'undefined') { speechSynthesis.cancel(); speechSynthesis.resume(); }
  currentUtterance = null;
  baseline = 'idle';
  updateBaseline();
}
function pauseFiles(except?: HTMLAudioElement) { document.querySelectorAll('audio').forEach(a => { if (a !== except) a.pause(); }); }
function updateBaseline(message?: string) {
  const button = document.querySelector<HTMLButtonElement>('#baseline-play');
  if (!button) return;
  const selected = voice();
  button.disabled = !selected;
  button.textContent = baseline === 'playing' ? 'Ⅱ Pause current voice' : baseline === 'paused' ? '▶ Resume current voice' : '▶ Play current voice';
  document.querySelector('#baseline-status')!.textContent = message ?? (selected ? `${selected.name} · ${selected.lang} · ${baseline === 'idle' ? 'Ready' : baseline}` : 'No voice for this language is installed in this browser. The recorded options below still work.');
}
function playBaseline() {
  const selected = voice();
  if (!selected) return updateBaseline();
  pauseFiles();
  if (baseline === 'playing') { speechSynthesis.pause(); baseline = 'paused'; return updateBaseline(); }
  if (baseline === 'paused') { speechSynthesis.resume(); baseline = 'playing'; return updateBaseline(); }
  stopBaseline();
  const generation = utteranceGeneration;
  const profile = profileFor('masha');
  const utterance = new SpeechSynthesisUtterance(manifest.text[lang]);
  currentUtterance = utterance; // retain while the browser speaks
  utterance.voice = selected;
  utterance.lang = selected.lang || profile.lang[lang];
  utterance.pitch = childPitch(selected, profile.pitch);
  utterance.rate = profile.rate;
  utterance.volume = MIX.voice * masterLevel(baselineVolume, false);
  utterance.onend = () => { if (generation !== utteranceGeneration) return; baseline = 'idle'; currentUtterance = null; updateBaseline('Finished.'); };
  utterance.onerror = e => { if (generation !== utteranceGeneration) return; baseline = 'idle'; currentUtterance = null; updateBaseline(`Browser voice could not play (${e.error}). Try again or use another browser.`); };
  baseline = 'playing'; updateBaseline(); speechSynthesis.speak(currentUtterance);
}
function render() {
  const favorite = get(`mabear.audition.favorite.${lang}`);
  app.innerHTML = `<header><a class="brand" href="/">← Back to the studio</a><span class="eyebrow">VOICE AUDITION · MASHA ONLY</span></header>
    <main><section class="intro"><img class="portrait" src="${portrait}" alt="Masha"><div><p class="eyebrow">A SMALL VOICE. A BIG PERSONALITY.</p><h1>Which Masha sounds right?</h1><p>Listen to the same scene in five voices. Judge her character, pronunciation and acting—not just how smooth the recording sounds.</p></div></section>
    <section class="scene"><div class="scene-top"><div><span class="eyebrow">THE SCENE</span><h2>A little too much porridge</h2></div><div class="languages" aria-label="Sample language"><button data-lang="ru" aria-pressed="${lang === 'ru'}">Русский</button><button data-lang="en" aria-pressed="${lang === 'en'}">English</button></div></div><blockquote lang="${lang}">${escape(manifest.text[lang])}</blockquote><p class="arc">Bright idea <span>→</span> comic panic <span>→</span> relief <span>→</span> delight</p></section>
    <section class="baseline card"><div class="card-title"><span class="number">NOW</span><div><h2>Current game voice</h2><p>The existing voice, played by your browser with the game's Masha settings.</p></div></div><div class="baseline-controls"><button class="primary" id="baseline-play">▶ Play current voice</button><button class="secondary" id="baseline-restart">Restart</button></div><label class="baseline-volume">Current voice volume <input id="baseline-volume" type="range" min="0" max="1" step="0.05" value="${baselineVolume}" aria-label="Current voice volume"><output>${Math.round(baselineVolume * 100)}%</output></label><p class="status" id="baseline-status" role="status"></p><details><summary>What am I comparing?</summary><p>This uses the same voice picker, saved voice preference, pitch and speed as the game. Its sound depends on the voices installed on your device. Audition volume is independent of the game volume. Options A–D are generated recordings of the same words. No episode audio or actor recording was uploaded or cloned. The recordings have matched active-speech RMS levels (not LUFS); pitch and timing are unchanged. Browser speech volume cannot be measured here, so adjust it by ear. Music is omitted so you can hear the acting.</p></details></section>
    <div class="options">${manifest.candidates.map(c => `<section class="card option"><div class="card-title"><span class="number">${c.letter}</span><div><h2>${escape(c.label)}</h2><p>Same scene · ${lang === 'ru' ? 'Russian' : 'English'}</p></div></div><audio controls preload="metadata" src="${c.clips[lang]}" aria-label="Option ${c.letter}: ${escape(c.label)}"></audio><p class="file-status" role="status"></p><label class="favorite"><input type="radio" name="favorite" value="${c.id}" ${favorite === c.id ? 'checked' : ''}><span>My pick for ${lang === 'ru' ? 'Russian' : 'English'}</span></label><details><summary>Voice details</summary><p>${escape(c.model)} · ${escape(c.voice)}. An audition candidate; not yet used in stories.</p></details></section>`).join('')}</div>
    <footer><p id="choice-status" role="status">${favorite ? 'Your pick is saved on this device.' : 'Choose a favorite after listening—or tell me none is good enough.'}</p><p>This audition does not change voices in your stories. Your preference stays on this device; tell me your choice in chat to guide the next step.</p></footer></main>`;
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(b => b.onclick = () => { stopBaseline(); pauseFiles(); lang = b.dataset.lang as Lang; render(); });
  document.querySelector<HTMLButtonElement>('#baseline-play')!.onclick = playBaseline;
  document.querySelector<HTMLButtonElement>('#baseline-restart')!.onclick = () => { stopBaseline(); playBaseline(); };
  document.querySelector<HTMLInputElement>('#baseline-volume')!.oninput = e => {
    baselineVolume = Number((e.target as HTMLInputElement).value);
    document.querySelector('.baseline-volume output')!.textContent = `${Math.round(baselineVolume * 100)}%`;
    if (baseline !== 'idle') { stopBaseline(); updateBaseline('Volume changed. Play to hear the current voice at this level.'); }
  };
  document.querySelectorAll<HTMLAudioElement>('audio').forEach(a => {
    a.volume = .8;
    a.onplay = () => { stopBaseline(); pauseFiles(a); };
    a.onerror = () => { a.parentElement!.querySelector('.file-status')!.textContent = 'This recording could not load. Reload to try again.'; };
  });
  document.querySelectorAll<HTMLInputElement>('input[name="favorite"]').forEach(input => input.onchange = () => { save(`mabear.audition.favorite.${lang}`, input.value); document.querySelector('#choice-status')!.textContent = `Option ${manifest.candidates.find(c => c.id === input.value)!.letter} saved for ${lang === 'ru' ? 'Russian' : 'English'} on this device. Tell me your pick in chat.`; });
  updateBaseline();
}
window.addEventListener('pagehide', () => { stopBaseline(); pauseFiles(); });
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener('voiceschanged', () => updateBaseline());
fetch('/assets/voices/masha-audition/manifest.json').then(async response => {
  if (!response.ok) throw new Error('Missing audition');
  manifest = await response.json() as Manifest;
  render();
}).catch(() => { app.innerHTML = '<main><h1>The audition could not load.</h1><p>Please reload to try again.</p><a href="/">Return to the studio</a></main>'; });
