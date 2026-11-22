// Economics panel (spec §4.4, D5): diffusion video vs this prototype vs production projection, per paragraph and at scale.
import { useState } from "react";
import {
  EGRESS_PER_GB,
  PRODUCTION_COST_PER_PARAGRAPH,
  SCALE_DEFAULTS,
  VIDEO_BITRATE_LABEL,
  VIDEO_BYTES_PER_SECOND,
  VIDEO_PRICE,
  diffusionCostPerParagraph,
  scaleRow,
} from "../../shared/pricing";
import { useStore, useStrings } from "../useStore";

export function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  if (n < 1e12) return `${(n / 1e9).toFixed(1)} GB`;
  if (n < 1e15) return `${(n / 1e12).toFixed(1)} TB`;
  return `${(n / 1e15).toFixed(1)} PB`;
}

function nonNegative(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function Economics({ durationS, planBytes, directorCost, costNote }: { durationS: number; planBytes: number; directorCost: number; costNote: string }) {
  const s = useStore();
  const t = useStrings();
  const [users, setUsers] = useState(SCALE_DEFAULTS.users);
  const [ppd, setPpd] = useState(SCALE_DEFAULTS.paragraphsPerUserPerDay);
  const [videoPrice, setVideoPrice] = useState(VIDEO_PRICE.default);
  const [prodCost, setProdCost] = useState(PRODUCTION_COST_PER_PARAGRAPH.value);
  const dur = durationS || 8;
  const videoPriceLabel = s.lang === "en"
    ? VIDEO_PRICE.label
    : `Veo 3.1 видео+звук 1080p в Vertex AI, $0.40 за секунду (Lite 720p $${VIDEO_PRICE.low}, 4k $${VIDEO_PRICE.high})`;
  const prodLabel = s.lang === "en"
    ? PRODUCTION_COST_PER_PARAGRAPH.label
    : "допущение: небольшая дистиллированная модель текст→таймлайн (~1 млрд параметров) на обычных GPU";
  const bitrateLabel = s.lang === "en" ? VIDEO_BITRATE_LABEL : "H.264 1080p @ ~8 Мбит/с ≈ 1 МБ/с";
  const egressLabel = s.lang === "en" ? EGRESS_PER_GB.label : "Cloudflare Workers static/egress: без платы за трафик";

  const cols = [
    {
      key: "video",
      name: t.bts.colVideo,
      per: diffusionCostPerParagraph(dur, videoPrice),
      bytesPer: dur * VIDEO_BYTES_PER_SECOND,
      note: s.lang === "en"
        ? `${dur.toFixed(1)} s × $${videoPrice}/s (${videoPriceLabel})`
        : `${dur.toFixed(1)} с × $${videoPrice}/с (${videoPriceLabel})`,
      render: t.bts.gpuCloud,
    },
    { key: "proto", name: t.bts.colProto, per: directorCost, bytesPer: planBytes, note: costNote, render: t.bts.onDevice },
    { key: "prod", name: t.bts.colProd, per: prodCost, bytesPer: planBytes, note: prodLabel, render: t.bts.onDevice },
  ].map((c) => ({ ...c, scale: scaleRow(c.per, c.bytesPer, users, ppd) }));

  return (
    <section className="bts-sec" data-testid="economics">
      <h3>{t.bts.economics}</h3>
      <div className="scale-inputs">
        <label>{t.bts.users} <input type="number" value={users} min={0} onChange={(e) => setUsers(nonNegative(e.target.value))} /></label>
        <label>{t.bts.perUserDay} <input type="number" value={ppd} min={0} onChange={(e) => setPpd(nonNegative(e.target.value))} /></label>
        <label>{t.bts.videoPerS} <input type="number" min={0} step={0.05} value={videoPrice} onChange={(e) => setVideoPrice(nonNegative(e.target.value))} /></label>
        <label>{t.bts.prodPerP} <span className="assume">{t.bts.assumption}</span><input type="number" min={0} step={0.0001} value={prodCost} onChange={(e) => setProdCost(nonNegative(e.target.value))} /></label>
      </div>
      <table className="econ">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">{s.lang === "en" ? "Metric" : "Показатель"}</span></th>
            {cols.map((c) => <th scope="col" key={c.key}>{c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr><td>{t.bts.perParagraph}</td>{cols.map((c) => <td key={c.key} data-testid={`econ-per-${c.key}`}>{usd(c.per)}</td>)}</tr>
          <tr><td>{t.bts.payload}</td>{cols.map((c) => <td key={c.key}>{bytes(Math.round(c.bytesPer))}</td>)}</tr>
          <tr><td>{t.bts.dailyCost}</td>{cols.map((c) => <td key={c.key} data-testid={`econ-daily-${c.key}`}>{usd(c.scale.dailyServerUsd)}</td>)}</tr>
          <tr><td>{t.bts.dailyEgress}</td>{cols.map((c) => <td key={c.key}>{bytes(c.scale.dailyEgressBytes)}</td>)}</tr>
          <tr><td>{t.bts.rendering}</td>{cols.map((c) => <td key={c.key}>{c.render}</td>)}</tr>
          <tr className="notes"><td>{t.bts.basis}</td>{cols.map((c) => <td key={c.key}>{c.note}</td>)}</tr>
        </tbody>
      </table>
      <p className="note">
        {s.lang === "en"
          ? `Video price: ${VIDEO_PRICE.label} ($${VIDEO_PRICE.low}–$${VIDEO_PRICE.high}/s); source: ${VIDEO_PRICE.source}; as of ${VIDEO_PRICE.asOf}. Video payload: ${bitrateLabel}. Egress: ${egressLabel} (${EGRESS_PER_GB.source}).`
          : `Цена видео: ${videoPriceLabel} ($${VIDEO_PRICE.low}–$${VIDEO_PRICE.high}/с); источник: ${VIDEO_PRICE.source}; на ${VIDEO_PRICE.asOf}. Поток видео: ${bitrateLabel}. Трафик: ${egressLabel} (${EGRESS_PER_GB.source}).`}
      </p>
    </section>
  );
}
