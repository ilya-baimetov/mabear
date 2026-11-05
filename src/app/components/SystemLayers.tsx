// Honesty legend (spec §2): renders the §0 layer table with Live / Stand-in / Placeholder tags.
import { useStrings } from "../useStore";

type Tag = "Live" | "Stand-in" | "Placeholder";
export const LAYERS: { layer: string; production: string; prototype: string; tag: Tag }[] = [
  { layer: "Text → staging plan", production: "Model trained on Animaccord scripts aligned with episode timelines, plus the character bible (the writers' implicit knowledge, made explicit and partly derivable from the footage)", prototype: "Claude + a written character bible (prompt) → a validated beat script", tag: "Stand-in" },
  { layer: "Plan → body motion", production: "Learned text-to-motion trained on episode character animation", prototype: "Open motion-capture/animation clip libraries retargeted onto the rigs, plus procedural layers", tag: "Stand-in" },
  { layer: "Faces, lip-sync, exclamations", production: "Learned from episode facial animation and audio", prototype: "Procedural face rig: emotions, blinks, visemes from text", tag: "Stand-in" },
  { layer: "Characters, sets, props", production: "Animaccord's existing production 3D sources", prototype: "Stand-in models built in code, as close to the originals as possible", tag: "Stand-in" },
  { layer: "Voice, music, SFX", production: "Studio voices, score, SFX library", prototype: "Browser TTS (placeholder voice), synthesized music and SFX", tag: "Placeholder" },
  { layer: "Rendering", production: "Real-time 3D on the user's device", prototype: "Same, live", tag: "Live" },
  { layer: "Canon and safety", production: "Studio rulebook + review of public posts", prototype: "Live: prompt + deterministic validator", tag: "Live" },
];

export function SystemLayers() {
  const t = useStrings();
  return (
    <section className="bts-sec" data-testid="system-layers">
      <h3>{t.bts.layers}</h3>
      <table className="layers">
        <thead>
          <tr><th>{t.bts.layer}</th><th>{t.bts.production}</th><th>{t.bts.prototype}</th><th /></tr>
        </thead>
        <tbody>
          {LAYERS.map((l) => (
            <tr key={l.layer}>
              <td>{l.layer}</td>
              <td>{l.production}</td>
              <td>{l.prototype}</td>
              <td><span className={`tag tag-${l.tag.replace(/\W/g, "").toLowerCase()}`}>{l.tag}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        In production, the text→plan and plan→motion layers are one model trained on Animaccord's episode archive. Here they are approximated by Claude + a character bible and by open motion libraries.
      </p>
    </section>
  );
}
