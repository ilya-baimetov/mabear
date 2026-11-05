// Price table (spec §4.4). Every constant carries a source and an as-of date. Never present an unsourced number as fact.
import type { Usage } from "./schema";

export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  /** cache write (5-min ephemeral) = 1.25 × input, per Anthropic prompt-caching pricing */
  cacheWritePerM: number;
  source: string;
  asOf: string;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2, cacheWritePerM: 5, source: "MaBear spec §4.4 price table (operator-provided); https://www.anthropic.com/pricing", asOf: "2026-11-05" },
  "claude-haiku-5-5": { inputPerM: 0.1, outputPerM: 0.5, cacheReadPerM: 0.01, cacheWritePerM: 0.125, source: "MaBear spec §4.4 price table (operator-provided); cache rates assumed at 0.1×/1.25× input; https://www.anthropic.com/pricing", asOf: "2026-11-05" },
};

/** Cost in USD of one director call. Unknown model → 0. */
export function costUsd(model: string, usage: Usage | null): number {
  if (!usage) return 0;
  const p = MODEL_PRICES[model];
  if (!p) return 0;
  return (
    (usage.input_tokens * p.inputPerM +
      usage.output_tokens * p.outputPerM +
      usage.cache_read_input_tokens * p.cacheReadPerM +
      usage.cache_creation_input_tokens * p.cacheWritePerM) /
    1_000_000
  );
}

/** Diffusion video price per generated second (Veo on Vertex AI). */
export const VIDEO_PRICE = {
  low: 0.05,
  high: 0.75,
  /** value used in the calculator */
  default: 0.4,
  label: "per pitch deck, unverified",
  source: "Pitch deck range; check https://cloud.google.com/vertex-ai/generative-ai/pricing (Veo rows)",
  asOf: "2026-11-05",
};

/** Equivalent 1080p video bitrate: H.264 @ ~8 Mbit/s ≈ 1 MB/s. */
export const VIDEO_BYTES_PER_SECOND = 1_000_000;
export const VIDEO_BITRATE_LABEL = "H.264 1080p @ ~8 Mbit/s ≈ 1 MB per second";

/** Production projection: small trained model, cost per paragraph (assumption, editable in the UI). */
export const PRODUCTION_COST_PER_PARAGRAPH = {
  value: 0.0002,
  label: "assumption: small distilled text→timeline model (~1B params) on commodity GPUs",
  asOf: "2026-11-05",
};

/** Egress price for the scale calculator (per GB). */
export const EGRESS_PER_GB = {
  value: 0.0,
  label: "Cloudflare Workers static/egress: no bandwidth charge",
  source: "https://developers.cloudflare.com/workers/platform/pricing/",
  asOf: "2026-11-05",
};

export const SCALE_DEFAULTS = { users: 10_000_000, paragraphsPerUserPerDay: 10 };

export interface ScaleRow {
  perParagraphUsd: number;
  dailyServerUsd: number;
  dailyEgressBytes: number;
}

export function scaleRow(perParagraphUsd: number, bytesPerParagraph: number, users: number, perUserPerDay: number): ScaleRow {
  const n = users * perUserPerDay;
  return { perParagraphUsd, dailyServerUsd: perParagraphUsd * n, dailyEgressBytes: bytesPerParagraph * n };
}

export function diffusionCostPerParagraph(durationS: number, pricePerSecond = VIDEO_PRICE.default): number {
  return durationS * pricePerSecond;
}
