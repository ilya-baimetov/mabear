// Behind the scenes: which browser TTS voice speaks each language, with a test button and a per-browser override.
// Browser voices differ per OS and browser (e.g. Chrome/Edge on macOS vs Safari), so the operator can pick the one
// that sounds right; the choice is stored in this browser only (localStorage).
import { useEffect, useState } from "react";
import { chooseVoice, childPitch, isChildVoice, scoreVoice, voicePrefKey } from "../../engine/audio/tts";
import { CHARACTERS } from "../../shared/bible/characters";
import type { Lang } from "../../shared/schema";
import { useStrings } from "../useStore";

const SAMPLE: Record<Lang, string> = { en: "Hi! I'm Masha. Let's play!", ru: "Привет! Я Маша. Давай играть!" };

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

export function VoicePicker() {
  const t = useStrings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth()?.getVoices() ?? []);
  const [prefs, setPrefs] = useState<Record<Lang, string>>(() => ({ en: read("en-US"), ru: read("ru-RU") }));
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const upd = () => setVoices(s.getVoices());
    upd();
    s.addEventListener("voiceschanged", upd);
    return () => s.removeEventListener("voiceschanged", upd);
  }, []);
  if (!synth()) return null;
  const profile = CHARACTERS.masha.voice!;
  return (
    <div className="voice-picker" data-testid="voice-picker">
      <h4>{t.bts.voice} <span className="achip">{t.bts.voicePlaceholder}</span></h4>
      {(["en", "ru"] as Lang[]).map((lang) => {
        const bcp = profile.lang[lang];
        const base = bcp.split("-")[0];
        const list = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().split("-")[0] === base).sort((a, b) => scoreVoice(b, bcp) - scoreVoice(a, bcp));
        const active = chooseVoice(voices, bcp, prefs[lang] || null);
        const test = () => {
          const s = synth();
          if (!s || !active) return;
          s.cancel();
          const u = new SpeechSynthesisUtterance(SAMPLE[lang]);
          u.voice = active;
          u.lang = active.lang || bcp;
          u.pitch = childPitch(active, profile.pitch);
          u.rate = profile.rate;
          s.speak(u);
        };
        return (
          <div key={lang} className="voice-row">
            <b>{lang.toUpperCase()}</b>
            <select
              data-testid={`voice-select-${lang}`}
              value={prefs[lang]}
              onChange={(e) => {
                const v = e.target.value;
                try {
                  if (v) localStorage.setItem(voicePrefKey(bcp), v);
                  else localStorage.removeItem(voicePrefKey(bcp));
                } catch {
                  /* storage blocked: the choice lasts until reload */
                }
                setPrefs({ ...prefs, [lang]: v });
              }}
            >
              <option value="">{t.bts.voiceAuto}{active && !prefs[lang] ? ` — ${active.name}` : ""}</option>
              {list.map((v) => (
                <option key={v.voiceURI || v.name} value={v.name}>
                  {v.name} · {v.lang} · {v.localService ? t.bts.voiceLocal : t.bts.voiceOnline}{isChildVoice(v) ? " · 🧒" : ""}
                </option>
              ))}
            </select>
            <button className="btn small" data-testid={`voice-test-${lang}`} disabled={!active} onClick={test}>▶ {t.bts.voiceTest}</button>
            {!list.length && <span className="achip">{t.bts.voiceNone}</span>}
          </div>
        );
      })}
    </div>
  );
}

function read(bcp: string): string {
  try {
    return localStorage.getItem(voicePrefKey(bcp)) ?? "";
  } catch {
    return "";
  }
}
