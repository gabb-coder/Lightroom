import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from '../model/editSettings';
import { GRAIN_STRENGTH, grainOffset, grainParams, latticeValue, valueNoise } from './grain';
import { applyDetailRgba8, pipelineParams } from './pipeline';

const W = 64;
const H = 48;

function grayImage(v: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([v, v, v, 255], i * 4);
  return data;
}

function grained(data: Uint8ClampedArray, grain: number, grainSize = 25, scale = 1) {
  const settings = defaultEditSettings();
  settings.effects = { ...settings.effects, grain, grainSize };
  return applyDetailRgba8(data, { width: W, height: H }, pipelineParams(settings), scale);
}

const channel = (data: Uint8ClampedArray, ch = 0) => Array.from({ length: W * H }, (_, i) => data[i * 4 + ch] ?? 0);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Correlation of each pixel with its right-hand neighbour. */
function neighbourCorrelation(v: number[]): number {
  const m = mean(v);
  let num = 0;
  let den = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      const a = (v[y * W + x] ?? 0) - m;
      num += a * ((v[y * W + x + 1] ?? 0) - m);
      den += a * a;
    }
  }
  return num / den;
}

describe('grain', () => {
  it('is off at Amount 0', () => {
    expect(grainParams({ grain: 0, grainSize: 25 })).toBeNull();
    const src = grayImage(128);
    expect(Array.from(grained(src, 0))).toEqual(Array.from(src));
  });

  it('is identical on every render (seeded, a pure function of position)', () => {
    const src = grayImage(128);
    expect(Array.from(grained(src, 60))).toEqual(Array.from(grained(src, 60)));
    const p = grainParams({ grain: 50, grainSize: 40 });
    if (!p) throw new Error('expected grain');
    expect(grainOffset(17, 33, p)).toBe(grainOffset(17, 33, p));
  });

  it('lattice values are spread over [−1, 1] with a mean near 0', () => {
    const values = Array.from({ length: 4000 }, (_, i) => latticeValue(i % 63, Math.floor(i / 63)));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(Math.min(...values)).toBeLessThan(-0.95);
    expect(Math.max(...values)).toBeGreaterThan(0.95);
    expect(Math.abs(mean(values))).toBeLessThan(0.05);
  });

  it('value noise passes through the lattice values', () => {
    expect(valueNoise(5, 9)).toBe(latticeValue(5, 9));
  });

  it('is monochrome, zero-mean and bounded by the amount', () => {
    const out = grained(grayImage(128), 100);
    const r = channel(out, 0);
    expect(channel(out, 1)).toEqual(r);
    expect(channel(out, 2)).toEqual(r);
    expect(Math.abs(mean(r) - 128)).toBeLessThan(3);
    const peak = GRAIN_STRENGTH * 255;
    for (const v of r) expect(Math.abs(v - 128)).toBeLessThanOrEqual(peak + 0.5);
    // Visible: a decent spread of values.
    expect(Math.max(...r) - Math.min(...r)).toBeGreaterThan(40);
  });

  it('gets stronger with Amount', () => {
    const spread = (amount: number) => {
      const r = channel(grained(grayImage(128), amount));
      const m = mean(r);
      return mean(r.map((v) => (v - m) ** 2));
    };
    expect(spread(80)).toBeGreaterThan(spread(20) * 4);
  });

  it('gets coarser with Size (neighbouring pixels more alike)', () => {
    const fine = neighbourCorrelation(channel(grained(grayImage(128), 80, 0)));
    const coarse = neighbourCorrelation(channel(grained(grayImage(128), 80, 100)));
    expect(coarse).toBeGreaterThan(fine + 0.2);
  });

  it('samples the full-resolution grain field on a proxy', () => {
    const p = grainParams({ grain: 50, grainSize: 25 });
    if (!p) throw new Error('expected grain');
    // Proxy pixel (x, y) at scale 0.5 is centered on full-res position 2x + 1.
    expect(grainOffset(3, 4, p, 0.5)).toBeCloseTo(p.amount * valueNoise(7 / p.cell, 9 / p.cell), 12);
    expect(grainOffset(3, 4, p, 0.5)).toBeCloseTo(grainOffset(6.5, 8.5, p, 1), 12);
  });
});
