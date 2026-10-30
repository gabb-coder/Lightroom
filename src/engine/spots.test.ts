import { describe, expect, it } from 'vitest';
import type { Spot } from '../model/editSettings';
import { retouchRgba8, sampleClamped, spotAlpha, spotsPx } from './spots';

const W = 120;
const H = 80;
const SIZE = { width: W, height: H };

function image(f: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...f(x, y), 255], (y * W + x) * 4);
  return data;
}

const spot = (patch: Partial<Spot>): Spot => ({ id: 's', mode: 'clone', x: 0.25, y: 0.5, sx: 0.75, sy: 0.5, radius: 10 / W, feather: 0, opacity: 100, ...patch });

const px = (d: Uint8ClampedArray, x: number, y: number) => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 3));

/** A textured background (fine ripples) with a dark blemish at (30, 40), radius 4. */
const blemished = image((x, y) => {
  const base = 150 + 12 * Math.sin(x / 1.7) * Math.cos(y / 2.1);
  return Math.hypot(x + 0.5 - 30, y + 0.5 - 40) < 4 ? [40, 30, 30] : [base, base - 10, base - 25];
});

describe('spot removal', () => {
  it('does nothing without spots or with opacity 0', () => {
    expect(Array.from(retouchRgba8(blemished, SIZE, []))).toEqual(Array.from(blemished));
    expect(spotsPx([spot({ opacity: 0 })], SIZE)).toEqual([]);
  });

  it('places spots in pixels of the image it renders (a proxy scales them)', () => {
    const [s] = spotsPx([spot({ feather: 50 })], SIZE);
    expect(s).toMatchObject({ cx: 30, cy: 40, sx: 90, sy: 40, r: 10, inner: 5, heal: false });
    const [half] = spotsPx([spot({})], { width: 60, height: 40 });
    expect(half).toMatchObject({ cx: 15, r: 5 });
  });

  it('feathers from the core to the rim', () => {
    const s = { heal: false, cx: 0, cy: 0, sx: 0, sy: 0, r: 10, inner: 5, opacity: 1 };
    expect(spotAlpha(3, s)).toBe(1);
    expect(spotAlpha(7.5, s)).toBeCloseTo(0.5, 9);
    expect(spotAlpha(10, s)).toBe(0);
  });

  it('samples bilinearly and clamps at the edges', () => {
    const ramp = image((x) => [x * 2, 0, 0]);
    expect(sampleClamped(ramp, SIZE, 10.5, 3)[0]).toBeCloseTo(20 / 255, 9);
    expect(sampleClamped(ramp, SIZE, 11, 3)[0]).toBeCloseTo(21 / 255, 9);
    expect(sampleClamped(ramp, SIZE, -50, 3)[0]).toBe(0);
    expect(sampleClamped(ramp, SIZE, 500, 3)[0]).toBeCloseTo(238 / 255, 9);
  });

  it('clone copies the source patch exactly, and nothing outside the spot changes', () => {
    const out = retouchRgba8(blemished, SIZE, [spot({ x: 30.5 / W, y: 40.5 / H, sx: 80.5 / W, sy: 40.5 / H, radius: 6 / W })]);
    expect(px(out, 30, 40)).toEqual(px(blemished, 80, 40));
    expect(px(out, 33, 42)).toEqual(px(blemished, 83, 42));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - 30.5, y + 0.5 - 40.5) >= 6) expect(px(out, x, y)).toEqual(px(blemished, x, y));
    }
  });

  it('heal matches the surroundings when the source is a different color, keeping its texture', () => {
    // Left: warm; right: cool. Healing a left spot from the right takes on the left's color.
    const two = image((x, y) => {
      const ripple = 10 * Math.sin(x / 1.3 + y / 1.9);
      const blemish = Math.hypot(x + 0.5 - 30, y + 0.5 - 40) < 3 ? -90 : 0;
      return x < 60 ? [190 + ripple + blemish, 140 + ripple + blemish, 90 + ripple + blemish] : [90 + ripple, 130 + ripple, 200 + ripple];
    });
    const s = spot({ x: 30 / W, y: 40 / H, sx: 90 / W, sy: 40 / H, radius: 7 / W });
    const clone = retouchRgba8(two, SIZE, [s]);
    const heal = retouchRgba8(two, SIZE, [{ ...s, mode: 'heal' }]);
    const mean = (d: Uint8ClampedArray) => {
      const sum = [0, 0, 0];
      let n = 0;
      for (let y = 37; y < 43; y++) {
        for (let x = 27; x < 33; x++) {
          px(d, x, y).forEach((v, c) => (sum[c] = (sum[c] ?? 0) + v));
          n++;
        }
      }
      return sum.map((v) => v / n);
    };
    // Clone brings the cool color in; heal stays warm like the surroundings (the blemish is gone).
    expect(mean(clone)[2]).toBeGreaterThan(180);
    const healed = mean(heal);
    expect(Math.abs((healed[0] ?? 0) - 190)).toBeLessThan(12);
    expect(Math.abs((healed[2] ?? 0) - 90)).toBeLessThan(12);
    // Texture survives: the healed patch is not flat.
    const values = [28, 29, 30, 31, 32].map((x) => px(heal, x, 40)[0] ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(6);
  });

  it('opacity mixes the patch with what was there; later spots go on top', () => {
    const flat = image((x) => (x < 60 ? [200, 200, 200] : [0, 0, 0]));
    const half = retouchRgba8(flat, SIZE, [spot({ x: 30 / W, y: 40 / H, sx: 90 / W, sy: 40 / H, opacity: 50 })]);
    expect(px(half, 30, 40)).toEqual([100, 100, 100]);
    const both = retouchRgba8(flat, SIZE, [spot({ x: 30 / W, y: 40 / H, sx: 90 / W, sy: 40 / H }), spot({ id: 't', x: 30 / W, y: 40 / H, sx: 10 / W, sy: 10 / H })]);
    expect(px(both, 30, 40)).toEqual([200, 200, 200]);
  });
});
