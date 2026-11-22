import { useEffect, useRef } from "react";
import { useStore } from "../useStore";
import { playback } from "../playback";

/** The chosen voice is fixed across devices; browser voice menus cannot replace it. */
export function VoicePicker() {
  const s = useStore();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = root.current;
    return () => {
      panel?.querySelectorAll("audio").forEach((a) => a.pause());
    };
  }, []);

  const audioLabel = (lang: "ru" | "en") => {
    if (s.lang === "ru") {
      return lang === "ru" ? "Русский пример голоса" : "Английский пример голоса";
    }
    return lang === "ru" ? "Russian voice sample" : "English voice sample";
  };

  return (
    <div className="voice-picker" data-testid="voice-picker" ref={root}>
      <h4>
        {s.lang === "en" ? "Masha’s voice" : "Голос Маши"}{" "}
        <span className="achip">MiniMax · Lively Girl</span>
      </h4>
      <p>
        {s.lang === "en"
          ? "Your selected voice in Russian and English."
          : "Выбранный голос на русском и английском."}
      </p>
      <a
        className="voice-audition-link"
        href="/voice/"
        target="_blank"
        rel="noopener noreferrer"
      >
        {s.lang === "en" ? "Compare Masha’s voices" : "Сравнить голоса Маши"}
      </a>
      {(["ru", "en"] as const).map((lang) => (
        <div className="voice-row" key={lang}>
          <b>{lang === "ru" ? "Русский" : "English"}</b>
          <audio
            controls
            preload="none"
            aria-label={audioLabel(lang)}
            src={`/assets/voices/masha-audition/lively-${lang}-level.wav`}
            onPlay={(event) => {
              playback.pause();
              root.current?.querySelectorAll("audio").forEach((a) => {
                if (a !== event.currentTarget) a.pause();
              });
            }}
          />
        </div>
      ))}
    </div>
  );
}
