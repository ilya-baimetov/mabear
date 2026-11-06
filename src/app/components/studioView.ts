/** On a phone, the playback dock stays with the writer; Play brings the stage back into view. */
export function revealStage(): void {
  if (!window.matchMedia("(max-width: 800px)").matches) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelector(".stage-col")?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
}
