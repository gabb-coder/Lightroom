import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from '../model/editSettings';
import { applyDetailRgba8, pipelineParams } from './pipeline';
import { buildLevel, CLARITY_LEVEL, dehazeChannel, levelLayout, presenceParams, sampleLevel, softDetail, TEXTURE_LEVEL } from './presence';

type Image = { width: number; height: number; data: Uint8ClampedArray };

/** An image from a function of normalized coordinates (0–1) returning RGB in 0–255. */
function makeImage(width: number, height: number, f: (u: number, v: number) => [number, number, number]): Image {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([...f((x + 0.5) / width, (y + 0.5) / height), 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

function withPresence(image: Image, basic: { texture?: number; clarity?: number; dehaze?: number }) {
  const s = defaultEditSettings();
  Object.assign(s.basic, basic);
  return applyDetailRgba8(image.data, image, pipelineParams(s));
}

const luma = (d: Uint8ClampedArray, i: number) => 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);

/** Standard deviation of luminance (0–255). */
function lumaSpread(d: Uint8ClampedArray): number {
  const n = d.length / 4;
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = luma(d, i);
    sum += y;
    sq += y * y;
  }
  const mean = sum / n;
  return Math.sqrt(sq / n - mean * mean);
}

/** Mean |Y − mean of its (2r+1)² neighbourhood|: local contrast (0–255). */
function localContrast(img: { width: number; height: number }, d: Uint8ClampedArray, r = 6): number {
  let total = 0;
  let n = 0;
  for (let y = r; y < img.height - r; y += 2) {
    for (let x = r; x < img.width - r; x += 2) {
      let sum = 0;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) sum += luma(d, ((y + j) * img.width + x + i) * 4);
      total += Math.abs(luma(d, (y * img.width + x) * 4) - sum / (2 * r + 1) ** 2);
      n++;
    }
  }
  return total / n;
}

/** Midtone fine detail: a gray ramp with a 6-pixel checker on top. */
const detailed = makeImage(240, 160, (u, v) => {
  const x = Math.floor(u * 240);
  const y = Math.floor(v * 160);
  const checker = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 14 : -14;
  const base = 100 + 40 * u + checker;
  return [base, base, base];
});

/** Large soft shapes: a bright disc on a darker midtone background. */
const shapes = (u: number, v: number): [number, number, number] => {
  const d = Math.hypot(u - 0.4, v - 0.5);
  const t = Math.min(1, Math.max(0, (d - 0.18) / 0.06));
  const y = 170 * (1 - t) + 90 * t;
  return [y, y * 0.95, y * 0.9];
};

describe('presence levels', () => {
  it('is off (null) when every slider is zero', () => {
    expect(presenceParams({ texture: 0, clarity: 0, dehaze: 0 })).toBeNull();
    expect(presenceParams({ texture: 50, clarity: -20, dehaze: 0 })).toEqual({ texture: 0.5, clarity: -0.2, dehaze: 0 });
  });

  it('sizes levels relative to the photo, so a proxy blurs over the same share of it', () => {
    expect(levelLayout({ width: 6000, height: 4000 }, TEXTURE_LEVEL)).toMatchObject({ factor: 6, width: 1000, height: 667 });
    expect(levelLayout({ width: 6000, height: 4000 }, CLARITY_LEVEL)).toMatchObject({ factor: 24, width: 250, height: 167 });
    expect(levelLayout({ width: 600, height: 360 }, CLARITY_LEVEL)).toMatchObject({ factor: 3, width: 200, height: 120 });
    // Small images are not upsampled.
    expect(levelLayout({ width: 64, height: 48 }, TEXTURE_LEVEL)).toMatchObject({ factor: 1, width: 64, height: 48 });
    // Sigma (taps) follows the level's size.
    const big = levelLayout({ width: 6000, height: 4000 }, CLARITY_LEVEL).kernel.taps;
    const proxy = levelLayout({ width: 1500, height: 1000 }, CLARITY_LEVEL).kernel.taps;
    expect(big).toBe(proxy);
  });

  it('keeps a flat image flat and samples back exactly at factor 1', () => {
    const flat = makeImage(50, 30, () => [128, 64, 32]);
    const level = buildLevel(flat.data, flat, CLARITY_LEVEL);
    for (const v of level.luma) expect(v).toBeCloseTo((0.2126 * 128 + 0.7152 * 64 + 0.0722 * 32) / 255, 4);
    for (const v of level.dark) expect(v).toBeCloseTo(32 / 255, 4);
    const ramp = makeImage(20, 10, (u) => [255 * u, 255 * u, 255 * u]);
    const one = buildLevel(ramp.data, ramp, { maxEdge: 1024, radius: 0 });
    expect(one.layout.factor).toBe(1);
    expect(sampleLevel(one.luma, one.layout, 7, 3)).toBe(one.luma[3 * 20 + 7]);
  });

  it('soft-limits large differences', () => {
    expect(softDetail(0)).toBe(0);
    expect(softDetail(0.02)).toBeCloseTo(0.02 / 1.08, 9);
    expect(softDetail(-0.5)).toBeCloseTo(-0.5 / 3, 9);
    expect(Math.abs(softDetail(10))).toBeLessThan(0.25);
  });
});

describe('Texture and Clarity', () => {
  it('Texture raises fine detail, negative Texture smooths it', () => {
    const base = lumaSpread(detailed.data);
    expect(lumaSpread(withPresence(detailed, { texture: 100 }))).toBeGreaterThan(base + 1.5);
    expect(lumaSpread(withPresence(detailed, { texture: -100 }))).toBeLessThan(base - 1.5);
  });

  it('Clarity raises large-scale contrast in the midtones and leaves black and white alone', () => {
    const image = makeImage(300, 200, shapes);
    const base = localContrast(image, image.data);
    expect(localContrast(image, withPresence(image, { clarity: 100 }))).toBeGreaterThan(base * 1.15);
    expect(localContrast(image, withPresence(image, { clarity: -100 }))).toBeLessThan(base * 0.85);
    // Pure black and white have no midtone weight.
    const bw = makeImage(80, 40, (u) => (u < 0.5 ? [0, 0, 0] : [255, 255, 255]));
    expect(Array.from(withPresence(bw, { clarity: 100 }))).toEqual(Array.from(bw.data));
  });

  it('looks the same on a half-size proxy (within 2/255 on average)', () => {
    const full = makeImage(800, 520, shapes);
    const half = makeImage(400, 260, shapes);
    const a = withPresence(full, { clarity: 80, dehaze: 40 });
    const b = withPresence(half, { clarity: 80, dehaze: 40 });
    let total = 0;
    for (let y = 0; y < 260; y++) {
      for (let x = 0; x < 400; x++) {
        const i = (y * 400 + x) * 4;
        // The proxy pixel covers 2 × 2 full pixels.
        const j = (2 * y * 800 + 2 * x) * 4;
        total += Math.abs(luma(b, i) - (luma(a, j) + luma(a, j + 4) + luma(a, j + 3200) + luma(a, j + 3204)) / 4);
      }
    }
    expect(total / (400 * 260)).toBeLessThan(2);
  });
});

describe('Dehaze', () => {
  /** A detailed scene (colored checker over a ramp) seen through a light, slightly blue veil. */
  const hazy = makeImage(240, 160, (u, v) => {
    const x = Math.floor(u * 240);
    const y = Math.floor(v * 160);
    const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 1;
    const [r, g, b] = on ? [200 * u + 30, 90, 40] : [30, 70 + 100 * v, 160];
    return [r * 0.5 + 0.5 * 225, g * 0.5 + 0.5 * 230, b * 0.5 + 0.5 * 240];
  });
  const minChannel = (d: Uint8ClampedArray) => {
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += Math.min(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0);
    return sum / (d.length / 4);
  };

  it('positive removes the veil: darker dark channel, more contrast; negative adds one', () => {
    const base = { spread: lumaSpread(hazy.data), dark: minChannel(hazy.data) };
    const clear = withPresence(hazy, { dehaze: 70 });
    expect(minChannel(clear)).toBeLessThan(base.dark - 40);
    expect(lumaSpread(clear)).toBeGreaterThan(base.spread * 1.3);
    const foggy = withPresence(hazy, { dehaze: -70 });
    expect(lumaSpread(foggy)).toBeLessThan(base.spread * 0.7);
    expect(minChannel(foggy)).toBeGreaterThan(base.dark + 10);
  });

  it('keeps white white and black black; the model is monotonic', () => {
    expect(dehazeChannel(1, 0.9, 1)).toBe(1);
    expect(dehazeChannel(0, 0.1, 1)).toBeLessThanOrEqual(0);
    expect(dehazeChannel(0.4, 0.5, 0)).toBe(0.4);
    let last = -Infinity;
    for (let c = 0; c <= 1; c += 0.05) {
      const v = dehazeChannel(c, 0.6, 0.8);
      expect(v).toBeGreaterThan(last);
      last = v;
    }
    expect(dehazeChannel(0, 0.5, -1)).toBeCloseTo(0.9 * 0.6, 9);
  });
});
