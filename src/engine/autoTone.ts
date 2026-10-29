import { clamp01, linearToSrgb, LUMA_WEIGHTS, srgbToLinear, type Rgb } from './color';
import { exposureGain } from './exposure';
import { applyTone, toneParams } from './tone';
import { whiteBalanceGains } from './whiteBalance';

/**
 * Auto tone (M20): picks Exposure, Contrast, Highlights, Shadows, Whites
 * and Blacks from a small sample of the photo. It runs the
 * same white balance → exposure → tone stages as the pipeline and searches
 * each slider so the result lands in a target range: median luma near
 * middle gray (unless that would blow the highlights), the brightest 0.5%
 * just below white and the darkest 0.5% just above black.
 */

export const AUTO_TARGETS = {
  /** Median of encoded luma (sRGB 0.46 ≈ 18% linear gray). */
  median: 0.46,
  /** 99.5th percentile of encoded luma. */
  white: 0.96,
  /** 0.5th percentile of encoded luma. */
  black: 0.03,
} as const;

/** Auto never pushes Whites/Blacks/Highlights/Shadows further than this (flat photos would go wild). */
const MAX_AMOUNT = 60;

export interface AutoTone {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

/** Samples as byte triples, plus the white balance gains to apply. */
interface Samples {
  rgba: Uint8Array | Uint8ClampedArray;
  count: number;
  gains: Rgb;
}

const BYTE_TO_LINEAR = Array.from({ length: 256 }, (_, v) => srgbToLinear(v / 255));

/**
 * Sorted encoded luma of the samples after white balance, exposure and tone.
 * Every stage here works per channel, so each channel is a 256-entry table.
 */
function lumas(s: Samples, t: AutoTone): Float64Array {
  const gain = exposureGain(t.exposure);
  const tone = toneParams(t);
  const tables = [0, 1, 2].map((ch) =>
    BYTE_TO_LINEAR.map((lin) => {
      const v = lin * (s.gains[ch] ?? 1) * gain;
      return (LUMA_WEIGHTS[ch] ?? 0) * linearToSrgb(clamp01(applyTone([v, v, v], tone)[0]));
    }),
  );
  const [tr, tg, tb] = tables as [number[], number[], number[]];
  const out = new Float64Array(s.count);
  for (let i = 0; i < s.count; i++) out[i] = (tr[s.rgba[i * 4] ?? 0] ?? 0) + (tg[s.rgba[i * 4 + 1] ?? 0] ?? 0) + (tb[s.rgba[i * 4 + 2] ?? 0] ?? 0);
  return out.sort();
}

function samplesOf(rgba: Uint8Array | Uint8ClampedArray, temp: number, tint: number): Samples {
  return { rgba, count: Math.floor(rgba.length / 4), gains: whiteBalanceGains(temp, tint) };
}

export function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] ?? 0;
}

/** Statistics Auto aims at, for checking a result. */
export function toneStats(rgba: Uint8Array | Uint8ClampedArray, basic: AutoTone & { temp: number; tint: number }) {
  const sorted = lumas(samplesOf(rgba, basic.temp, basic.tint), basic);
  return { median: percentile(sorted, 0.5), white: percentile(sorted, 0.995), black: percentile(sorted, 0.005) };
}

/** Value in [lo, hi] (on a grid of `step`) where increasing `f` comes closest to `target`. */
function solve(f: (v: number) => number, target: number, lo: number, hi: number, step: number): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 40 && b - a > step / 2; i++) {
    const mid = (a + b) / 2;
    if (f(mid) < target) a = mid;
    else b = mid;
  }
  const snap = (v: number) => Math.round(v / step) * step;
  const candidates = [snap(a), snap(b)].map((v) => Math.min(hi, Math.max(lo, v)));
  const best = candidates.reduce((x, y) => (Math.abs(f(y) - target) < Math.abs(f(x) - target) ? y : x));
  return Number(best.toFixed(2)) + 0;
}

/**
 * Auto tone for RGBA8 sRGB samples (a downscaled copy of the photo) under
 * the photo's current white balance.
 */
export function autoTone(rgba: Uint8Array | Uint8ClampedArray, wb: { temp: number; tint: number }): AutoTone {
  const samples = samplesOf(rgba, wb.temp, wb.tint);
  const t: AutoTone = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 };
  if (samples.count === 0) return t;
  const stat = (patch: Partial<AutoTone>, p: number) => percentile(lumas(samples, { ...t, ...patch }), p);
  const fraction = (pred: (v: number) => boolean) => lumas(samples, t).filter(pred).length / samples.count;

  // Middle gray for the median, but never more than half a stop past what keeps the brightest 0.5% below white.
  const exposureFor = (slack: number) => Math.min(medianExposure(), solve((v) => stat({ exposure: v }, 0.995), AUTO_TARGETS.white, -5, 5, 0.05) + slack);
  const medianExposure = () => solve((v) => stat({ exposure: v }, 0.5), AUTO_TARGETS.median, -5, 5, 0.05);
  t.exposure = exposureFor(0.5);
  // Recover bright and open dark areas in proportion to how much of the photo sits there.
  t.highlights = -Math.round(Math.min(MAX_AMOUNT, 300 * fraction((v) => v > 0.9)));
  t.shadows = Math.round(Math.min(MAX_AMOUNT, 300 * fraction((v) => v < 0.1)));
  // Contrast sets the overall spread; Whites and Blacks then place its ends.
  const spread = (v: number) => stat({ contrast: v }, 0.995) - stat({ contrast: v }, 0.005);
  t.contrast = solve(spread, AUTO_TARGETS.white - AUTO_TARGETS.black, -MAX_AMOUNT, MAX_AMOUNT, 1);
  for (let round = 0; round < 2; round++) {
    t.whites = solve((v) => stat({ whites: v }, 0.995), AUTO_TARGETS.white, -MAX_AMOUNT, MAX_AMOUNT, 1);
    t.blacks = solve((v) => stat({ blacks: v }, 0.005), AUTO_TARGETS.black, -MAX_AMOUNT, MAX_AMOUNT, 1);
    t.exposure = exposureFor(0);
  }
  return t;
}
