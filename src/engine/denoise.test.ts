import { describe, expect, it } from 'vitest';
import { denoiseKernels, denoiseParams, denoiseRgba8 } from './denoise';

const W = 120;
const H = 80;

/** Seeded standard-normal noise (Box–Muller). */
function gaussian(seed: number) {
  let s = seed;
  const uniform = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return ((s >>> 8) + 1) / 16777218;
  };
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

/** An image from a per-pixel function returning RGB 0–255. */
function image(f: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...f(x, y), 255], (y * W + x) * 4);
  return data;
}

const SIZE = { width: W, height: H };
const nr = (data: Uint8ClampedArray, nrLuma: number, nrColor: number) => denoiseRgba8(data, SIZE, denoiseParams({ nrLuma, nrColor }));

const lumaAt = (d: Uint8ClampedArray, i: number) => 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);

/** Variance of luminance and of the R − B difference over a column range. */
function stats(d: Uint8ClampedArray, x0 = 0, x1 = W) {
  const ys: number[] = [];
  const cs: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      ys.push(lumaAt(d, i));
      cs.push((d[i] ?? 0) - (d[i + 2] ?? 0));
    }
  }
  const variance = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return { mean: m, variance: v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length };
  };
  return { luma: variance(ys), chroma: variance(cs) };
}

describe('noise reduction', () => {
  it('is off at zero and returns the pixels unchanged', () => {
    expect(denoiseParams({ nrLuma: 0, nrColor: 0 })).toBeNull();
    const data = image((x, y) => [x * 2, y * 3, 100]);
    expect(Array.from(denoiseRgba8(data, SIZE, null))).toEqual(Array.from(data));
    // Color only: luminance passes through exactly where there is no color noise.
    expect(Array.from(nr(image(() => [90, 140, 60]), 0, 100))).toEqual(Array.from(image(() => [90, 140, 60])));
  });

  it('Luminance smooths grain on a flat area', () => {
    const noise = gaussian(1);
    const noisy = image(() => {
      const v = 128 + 8 * noise();
      return [v, v, v];
    });
    const before = stats(noisy).luma;
    const after = stats(nr(noisy, 100, 0)).luma;
    expect(after.variance).toBeLessThan(before.variance * 0.25);
    expect(Math.abs(after.mean - before.mean)).toBeLessThan(0.5);
    // A little is a little.
    expect(stats(nr(noisy, 20, 0)).luma.variance).toBeGreaterThan(after.variance);
  });

  it('keeps edges sharp', () => {
    const noise = gaussian(2);
    const edge = image((x) => {
      const v = (x < W / 2 ? 50 : 200) + 6 * noise();
      return [v, v, v];
    });
    const out = nr(edge, 100, 0);
    // Two pixels either side of the edge keep their level.
    const near = (x: number) => stats(out, x, x + 1).luma.mean;
    expect(near(W / 2 - 2)).toBeLessThan(56);
    expect(near(W / 2 + 1)).toBeGreaterThan(194);
  });

  it('Color removes color blotches without moving luminance or bleeding across color edges', () => {
    const noise = gaussian(3);
    // Opposite red/blue noise at constant luminance, on two different colors.
    const noisy = image((x) => {
      const n = 14 * noise();
      const base: [number, number, number] = x < W / 2 ? [170, 90, 80] : [70, 100, 170];
      return [base[0] + n, base[1] - (n * (0.2126 - 0.0722)) / 0.7152, base[2] - n];
    });
    const out = nr(noisy, 0, 100);
    const left = { before: stats(noisy, 0, W / 2 - 6), after: stats(out, 0, W / 2 - 6) };
    expect(left.after.chroma.variance).toBeLessThan(left.before.chroma.variance * 0.2);
    expect(Math.abs(left.after.luma.mean - left.before.luma.mean)).toBeLessThan(0.6);
    // Right next to the edge, each side keeps its own color.
    expect(stats(out, W / 2 - 2, W / 2 - 1).chroma.mean).toBeGreaterThan(80);
    expect(stats(out, W / 2 + 1, W / 2 + 2).chroma.mean).toBeLessThan(-90);
  });

  it('filters a proxy over proportionally fewer pixels', () => {
    expect(denoiseKernels(1).chroma.taps).toBe(12);
    expect(denoiseKernels(0.25).chroma.taps).toBe(3);
    expect(denoiseKernels(1).luma.taps).toBe(5);
  });
});
