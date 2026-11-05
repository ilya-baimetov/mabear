// A5 look pass: post-processing policy, environment tint, metric UVs, texture manifest (pure parts, no WebGL).
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TOD_PRESETS, UV_TILE_M, envTintAmount, metricUV } from "../../src/engine/look";
import { adaptStep, parsePostQuality, type AdaptState } from "../../src/engine/post/post";
import { ENV_TEXTURE_FILES } from "../../src/engine/set/textures";
import { HDRI_URL } from "../../src/engine/stage";

describe("post-processing tiers", () => {
  it("parses the ?post= flag (numbers, names, junk → fallback)", () => {
    expect(parsePostQuality("")).toBe(3);
    expect(parsePostQuality("?post=0")).toBe(0);
    expect(parsePostQuality("?post=off")).toBe(0);
    expect(parsePostQuality("?post=false")).toBe(0);
    expect(parsePostQuality("?post=low")).toBe(1);
    expect(parsePostQuality("?post=2")).toBe(2);
    expect(parsePostQuality("?post=high")).toBe(3);
    expect(parsePostQuality("?post=9")).toBe(3);
    expect(parsePostQuality("?post=banana", 2)).toBe(2);
    expect(parsePostQuality("?x=1", 1)).toBe(1);
  });

  it("degrades AO first, then bloom, then resolution; never flip-flops back to a dropped tier", () => {
    let s: AdaptState = { quality: 3, ceiling: 3, scale: 1 };
    const step = (fps: number) => {
      const n = adaptStep(s, fps);
      if (n) s = n;
      return n;
    };
    step(20);
    expect(s).toEqual({ quality: 2, ceiling: 2, scale: 1 }); // AO off
    step(20);
    expect(s).toEqual({ quality: 1, ceiling: 1, scale: 1 }); // bloom off
    step(20);
    expect(s.quality).toBe(1); // grade + SMAA stay
    expect(s.scale).toBeCloseTo(0.75);
    step(20);
    step(20);
    expect(s.scale).toBe(0.5);
    expect(step(20)).toBeNull(); // floor reached
    step(60);
    step(60);
    step(60);
    step(60);
    expect(s.scale).toBe(1);
    expect(step(60)).toBeNull(); // dropped tiers stay dropped
    expect(s.quality).toBe(1);
    // in the comfortable band nothing changes
    expect(adaptStep({ quality: 3, ceiling: 3, scale: 1 }, 45)).toBeNull();
    // restored ceiling (e.g. setAdaptive(false) → true) lets quality climb back when fast
    expect(adaptStep({ quality: 1, ceiling: 3, scale: 1 }, 60)).toEqual({ quality: 2, ceiling: 3, scale: 1 });
  });
});

describe("environment", () => {
  it("tints the HDRI per time of day: night and sunset stronger than day, always within bounds", () => {
    const t = (k: keyof typeof TOD_PRESETS) => envTintAmount(TOD_PRESETS[k]);
    for (const k of Object.keys(TOD_PRESETS) as (keyof typeof TOD_PRESETS)[]) {
      expect(t(k)).toBeGreaterThanOrEqual(0.2);
      expect(t(k)).toBeLessThanOrEqual(0.8);
    }
    expect(t("sunset")).toBeGreaterThan(t("day"));
    expect(t("night")).toBeGreaterThan(t("day"));
  });

  it("ships the CC0 HDRI and every set texture in public/ within the size budget", () => {
    const files = [HDRI_URL, ...Object.values(ENV_TEXTURE_FILES).map((f) => `assets/textures/${f}`)];
    let total = 0;
    for (const f of files) {
      const p = resolve("public", f);
      expect(existsSync(p), f).toBe(true);
      total += statSync(p).size;
    }
    expect(total).toBeLessThan(8 * 1024 * 1024);
  });
});

describe("metric UVs", () => {
  it("logs: u wraps a whole number of tiles, v runs along the log in metres", () => {
    const tile = UV_TILE_M.wood!;
    const g = new THREE.CylinderGeometry(0.2, 0.2, 7, 9);
    metricUV(g, tile);
    const uv = g.attributes.uv;
    let maxU = 0, maxV = 0;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(g.attributes.normal.getY(i)) > 0.95) continue;
      maxU = Math.max(maxU, uv.getX(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    expect(Number.isInteger(Math.round(maxU * 1e6) / 1e6)).toBe(true);
    expect(maxU).toBeGreaterThanOrEqual(1);
    expect(maxV).toBeCloseTo(7 / tile, 5);
  });

  it("boards: the grain axis (v) follows the long side and honours the transform's scale", () => {
    const g = new THREE.BoxGeometry(4, 0.1, 0.3);
    metricUV(g, 1, new THREE.Matrix4().makeScale(2, 1, 1));
    const uv = g.attributes.uv;
    let spanV = 0, spanU = 0;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(g.attributes.normal.getY(i)) < 0.9) continue; // top/bottom faces
      spanV = Math.max(spanV, Math.abs(uv.getY(i)));
      spanU = Math.max(spanU, Math.abs(uv.getX(i)));
    }
    expect(spanV).toBeCloseTo(4, 5); // half of 8 m (scaled) — v along the board
    expect(spanU).toBeCloseTo(0.15, 5);
  });
});
