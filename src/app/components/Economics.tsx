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
import { useStrings } from "../useStore";

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

export function Economics({ durationS, planBytes, directorCost, costNote }: { durationS: number; planBytes: number; directorCost: number; costNote: string }) {
  const t = useStrings();
  const [users, setUsers] = useState(SCALE_DEFAULTS.users);
  const [ppd, setPpd] = useState(SCALE_DEFAULTS.paragraphsPerUserPerDay);
  const [videoPrice, setVideoPrice] = useState(VIDEO_PRICE.default);
  const [prodCost, setProdCost] = useState(PRODUCTION_COST_PER_PARAGRAPH.value);
  const dur = durationS || 8;
  const cols = [
    { key: "video", name: t.bts.colVideo, per: diffusionCostPerParagraph(dur, videoPrice), bytesPer: dur * VIDEO_BYTES_PER_SECOND, note: `${dur.toFixed(1)} s × $${videoPrice}/s (${VIDEO_PRICE.label})`, render: t.bts.gpuCloud },
    { key: "proto", name: t.bts.colProto, per: directorCost, bytesPer: planBytes, note: costNote, render: t.bts.onDevice },
    { key: "prod", name: t.bts.colProd, per: prodCost, bytesPer: planBytes, note: `${t.bts.assumption}: ${PRODUCTION_COST_PER_PARAGRAPH.label}`, render: t.bts.onDevice },
  ].map((c) => ({ ...c, scale: scaleRow(c.per, c.bytesPer, users, ppd) }));
  return (
    <section className="bts-sec" data-testid="economics">
      <h3>{t.bts.economics}</h3>
      <div className="scale-inputs">
        <label>{t.bts.users} <input type="number" value={users} min={1} onChange={(e) => setUsers(Number(e.target.value) || 0)} /></label>
        <label>{t.bts.perUserDay} <input type="number" value={ppd} min={1} onChange={(e) => setPpd(Number(e.target.value) || 0)} /></label>
        <label>{t.bts.videoPerS} <input type="number" step={0.05} value={videoPrice} onChange={(e) => setVideoPrice(Number(e.target.value) || 0)} /></label>
        <label>{t.bts.prodPerP} <span className="assume">{t.bts.assumption}</span><input type="number" step={0.0001} value={prodCost} onChange={(e) => setProdCost(Number(e.target.value) || 0)} /></label>
      </div>
      <table className="econ">
        <thead>
          <tr><th />{cols.map((c) => <th key={c.key}>{c.name}</th>)}</tr>
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
        Video price: {VIDEO_PRICE.label} (${VIDEO_PRICE.low}–${VIDEO_PRICE.high}/s); source: {VIDEO_PRICE.source}; as of {VIDEO_PRICE.asOf}. Video payload: {VIDEO_BITRATE_LABEL}. Egress: {EGRESS_PER_GB.label} ({EGRESS_PER_GB.source}).
      </p>
    </section>
  );
}
