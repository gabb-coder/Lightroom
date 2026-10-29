import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from '../model/editSettings';
import { applyDetailRgba8, pipelineParams } from './pipeline';
import { SHARPEN_MAX_TAPS, sharpenKernel, sharpenParams } from './sharpen';

const W = 16;
const H = 6;

/** Vertical edge: columns < 8 are `dark`, the rest `bright` (gray). */
function edgeImage(dark: number, bright: number, color: [number, number, number] = [1, 1, 1]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = x < 8 ? dark : bright;
      data.set([v * color[0], v * color[1], v * color[2], 255], (y * W + x) * 4);
    }
  }
  return data;
}

function sharpened(data: Uint8ClampedArray, amount: number, radius: number, scale = 1) {
  const settings = defaultEditSettings();
  settings.detail = { sharpAmount: amount, sharpRadius: radius };
  return applyDetailRgba8(data, { width: W, height: H }, pipelineParams(settings), scale);
}

const row = (data: Uint8ClampedArray, y = 2, ch = 0) => Array.from({ length: W }, (_, x) => data[(y * W + x) * 4 + ch] ?? 0);

/** Independent 1-D reference: Gaussian blur of one row with clamped edges. */
function referenceRow(values: number[], amount: number, sigma: number): number[] {
  const taps = Math.ceil(3 * sigma);
  const w = Array.from({ length: 2 * taps + 1 }, (_, k) => Math.exp(-((k - taps) ** 2) / (2 * sigma * sigma)));
  const total = w.reduce((a, b) => a + b, 0);
  return values.map((v, x) => {
    let blur = 0;
    for (let k = -taps; k <= taps; k++) blur += ((w[k + taps] ?? 0) / total) * (values[Math.min(values.length - 1, Math.max(0, x + k))] ?? 0);
    return Math.round(Math.min(255, Math.max(0, v + amount * (v - blur))));
  });
}

describe('sharpening (unsharp mask on luminance)', () => {
  it('is off at Amount 0', () => {
    expect(sharpenParams({ sharpAmount: 0, sharpRadius: 1 })).toBeNull();
    const src = edgeImage(60, 180);
    expect(Array.from(sharpened(src, 0, 1))).toEqual(Array.from(src));
  });

  it('uses normalized Gaussian weights with a half-width of 3σ (max 9)', () => {
    for (const radius of [0.5, 1, 1.7, 3]) {
      const { taps, weights } = sharpenKernel(radius);
      expect(taps).toBe(Math.min(SHARPEN_MAX_TAPS, Math.ceil(3 * radius)));
      let sum = weights[0] ?? 0;
      for (let i = 1; i <= taps; i++) sum += 2 * (weights[i] ?? 0);
      expect(sum).toBeCloseTo(1, 6);
      for (let i = taps + 1; i < weights.length; i++) expect(weights[i]).toBe(0);
    }
  });

  it('matches an independent unsharp-mask reference across an edge', () => {
    const src = edgeImage(60, 180);
    for (const [amount, radius] of [[40, 1], [150, 3], [100, 0.5]] as const) {
      const expected = referenceRow(row(src), amount / 100, radius);
      const got = row(sharpened(src, amount, radius));
      got.forEach((v, x) => expect(Math.abs(v - (expected[x] ?? 0))).toBeLessThanOrEqual(1));
    }
  });

  it('overshoots on both sides of an edge, more with a higher amount, wider with a larger radius', () => {
    const src = edgeImage(60, 180);
    const mild = row(sharpened(src, 40, 1));
    const strong = row(sharpened(src, 150, 1));
    expect(mild[7]).toBeLessThan(60);
    expect(mild[8]).toBeGreaterThan(180);
    expect(strong[7]).toBeLessThan(mild[7] ?? 0);
    expect(strong[8]).toBeGreaterThan(mild[8] ?? 0);
    // Far from the edge nothing changes; a larger radius reaches further.
    expect(mild[0]).toBe(60);
    expect(mild[15]).toBe(180);
    expect(row(sharpened(src, 100, 1))[4]).toBe(60);
    expect(row(sharpened(src, 100, 3))[4]).toBeLessThan(60);
  });

  it('leaves flat areas unchanged', () => {
    const flat = edgeImage(120, 120);
    expect(Array.from(sharpened(flat, 150, 3))).toEqual(Array.from(flat));
  });

  it('sharpens luminance only: every channel moves by the same amount', () => {
    const src = edgeImage(100, 160, [1, 0.8, 0.6]); // no channel clips
    const out = sharpened(src, 100, 1);
    for (const x of [6, 7, 8, 9]) {
      const i = (2 * W + x) * 4;
      const deltas = [0, 1, 2].map((ch) => (out[i + ch] ?? 0) - (src[i + ch] ?? 0));
      expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThanOrEqual(1);
    }
  });

  it('scales the radius with the render size (a proxy is sharpened proportionally)', () => {
    expect(sharpenKernel(2, 0.5)).toEqual(sharpenKernel(1));
    // A tiny proxy: the kernel collapses and sharpening has no visible effect.
    const src = edgeImage(60, 180);
    expect(Array.from(sharpened(src, 150, 1, 0.05))).toEqual(Array.from(src));
  });

  it('passes alpha through', () => {
    const src = edgeImage(60, 180);
    for (let i = 3; i < src.length; i += 8) src[i] = 77;
    const out = sharpened(src, 150, 2);
    for (let i = 3; i < src.length; i += 4) expect(out[i]).toBe(src[i]);
  });
});
