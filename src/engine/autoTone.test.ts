import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from '../model/editSettings';
import { autoTone, percentile, toneStats, type AutoTone } from './autoTone';
import { linearToSrgb, LUMA_WEIGHTS } from './color';
import { pipelineParams, processPixel } from './pipeline';

/** 64×64 RGBA8 photo whose encoded values follow `level(t)` for t in [0, 1), with some color. */
function photo(level: (t: number) => number): Uint8Array {
  const n = 64 * 64;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = level(i / n) * 255;
    const hue = (i * 7) % 3;
    out.set([Math.min(255, Math.round(v * (hue === 0 ? 1.1 : 0.95))), Math.round(v * (hue === 1 ? 1 : 0.92)), Math.min(255, Math.round(v * (hue === 2 ? 1.08 : 0.9))), 255], i * 4);
  }
  return out;
}

/** A typical scene: about 5 stops spread evenly around 18% gray (up to white), times `gain` (clipped). */
const scene = (gain: number) => photo((t) => linearToSrgb(Math.min(1, gain * 0.18 * Math.pow(5.5, 2 * t - 1))));

const NORMAL_CASES = {
  'two stops under': scene(0.25),
  'already good': scene(1),
};

function inSliderRange(t: AutoTone) {
  for (const k of ['contrast', 'highlights', 'shadows', 'whites', 'blacks'] as const) expect(Math.abs(t[k]), k).toBeLessThanOrEqual(60);
  expect(Math.abs(t.exposure)).toBeLessThanOrEqual(5);
  expect(Math.round(t.exposure / 0.05) * 0.05).toBeCloseTo(t.exposure, 9); // on the slider's step
}

describe('auto tone', () => {
  for (const [name, rgba] of Object.entries(NORMAL_CASES)) {
    it(`lands in range: ${name}`, () => {
      const t = autoTone(rgba, { temp: 0, tint: 0 });
      const s = toneStats(rgba, { ...t, temp: 0, tint: 0 });
      expect(s.median, 'median').toBeGreaterThan(0.4);
      expect(s.median, 'median').toBeLessThan(0.52);
      expect(s.white, 'white').toBeGreaterThan(0.85);
      expect(s.white, 'white').toBeLessThanOrEqual(0.995);
      expect(s.black, 'black').toBeLessThan(0.1);
      inSliderRange(t);
    });
  }

  it('pulls an overexposed photo with blown highlights back toward middle gray', () => {
    const blown = scene(2.8); // about 30% of pixels clipped
    const zero = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temp: 0, tint: 0 };
    const t = autoTone(blown, { temp: 0, tint: 0 });
    const s = toneStats(blown, { ...t, temp: 0, tint: 0 });
    expect(t.exposure).toBeLessThan(-0.5);
    expect(s.median).toBeLessThan(toneStats(blown, zero).median);
    expect(s.median).toBeLessThan(0.56);
    // The clipped area has no detail to recover, so it ends up light gray rather than white.
    expect(s.white).toBeGreaterThan(0.7);
    inSliderRange(t);
  });

  it('never blows highlights, even on a low-contrast or very contrasty photo', () => {
    for (const rgba of [photo((t) => 0.3 + 0.3 * t), photo((t) => (t < 0.5 ? 0.05 * t : 0.85 + 0.15 * t)), photo((t) => 0.02 + 0.3 * t * t)]) {
      const t = autoTone(rgba, { temp: 0, tint: 0 });
      expect(toneStats(rgba, { ...t, temp: 0, tint: 0 }).white).toBeLessThanOrEqual(0.995);
      inSliderRange(t);
    }
  });

  it('brightens dark photos and darkens bright ones', () => {
    expect(autoTone(NORMAL_CASES['two stops under'], { temp: 0, tint: 0 }).exposure).toBeGreaterThan(1);
    expect(Math.abs(autoTone(NORMAL_CASES['already good'], { temp: 0, tint: 0 }).exposure)).toBeLessThan(0.5);
    expect(autoTone(scene(2), { temp: 0, tint: 0 }).exposure).toBeLessThan(0);
  });

  it('stretches a flat photo toward white and black', () => {
    const flat = photo((t) => 0.3 + 0.3 * t);
    const t = autoTone(flat, { temp: 0, tint: 0 });
    const before = toneStats(flat, { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temp: 0, tint: 0 });
    const after = toneStats(flat, { ...t, temp: 0, tint: 0 });
    expect(after.white - after.black).toBeGreaterThan(before.white - before.black);
  });

  it('measures with exactly the pipeline\'s white balance, exposure and tone', () => {
    const rgba = scene(0.7);
    const basic = { exposure: 0.85, contrast: 25, highlights: -30, shadows: 20, whites: 10, blacks: -15, temp: 18, tint: -9 };
    const settings = defaultEditSettings();
    settings.basic = { ...settings.basic, ...basic };
    const params = pipelineParams(settings);
    const lumas: number[] = [];
    for (let i = 0; i < rgba.length; i += 4) {
      const out = processPixel([(rgba[i] ?? 0) / 255, (rgba[i + 1] ?? 0) / 255, (rgba[i + 2] ?? 0) / 255], params);
      lumas.push(LUMA_WEIGHTS[0] * out[0] + LUMA_WEIGHTS[1] * out[1] + LUMA_WEIGHTS[2] * out[2]);
    }
    lumas.sort((a, b) => a - b);
    const s = toneStats(rgba, basic);
    expect(s.median).toBeCloseTo(percentile(Float64Array.from(lumas), 0.5), 9);
    expect(s.white).toBeCloseTo(percentile(Float64Array.from(lumas), 0.995), 9);
  });

  it('copes with a single flat color and an empty sample', () => {
    const gray = autoTone(photo(() => 0.3), { temp: 0, tint: 0 });
    expect(Object.values(gray).every(Number.isFinite)).toBe(true);
    expect(autoTone(new Uint8Array(0), { temp: 0, tint: 0 }).exposure).toBe(0);
  });
});
