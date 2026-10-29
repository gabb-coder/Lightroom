import { describe, expect, it } from 'vitest';
import { defaultEditSettings, type Geometry } from '../model/editSettings';
import { applyGeometryRgba8 } from './geometry';
import { pipelineParams, renderRgba8 } from './pipeline';
import { applyVignette, VIGNETTE_MAX, vignetteAmount, vignetteMask } from './vignette';

const W = 40;
const H = 30;

function grayImage(v: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([v, v, v, 255], i * 4);
  return data;
}

function render(vignette: number, geometry: Partial<Geometry> = {}, v = 128) {
  const settings = defaultEditSettings();
  settings.effects.vignette = vignette;
  settings.geometry = { ...settings.geometry, ...geometry };
  return renderRgba8(grayImage(v), { width: W, height: H }, pipelineParams(settings));
}

const at = (img: { width: number; data: Uint8ClampedArray }, x: number, y: number) => img.data[(y * img.width + x) * 4] ?? 0;

describe('vignette', () => {
  it('maps the slider to a signed strength (±0.75 at ±100, like the design)', () => {
    expect(vignetteAmount(0)).toBe(0);
    expect(vignetteAmount(-100)).toBe(-VIGNETTE_MAX);
    expect(vignetteAmount(100)).toBe(VIGNETTE_MAX);
  });

  it('mask is clear in the middle and full at the corners, rising monotonically', () => {
    expect(vignetteMask(0.5, 0.5)).toBe(0);
    expect(vignetteMask(0.5 + 0.2, 0.5)).toBe(0); // inside the clear 45%
    expect(vignetteMask(0, 0)).toBe(1);
    expect(vignetteMask(1, 1)).toBe(1);
    let last = 0;
    for (let t = 0.5; t >= 0; t -= 0.01) {
      const m = vignetteMask(t, t);
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
  });

  it('darkens toward black when negative and lightens toward white when positive', () => {
    expect(applyVignette(0.8, -0.75, 1)).toBeCloseTo(0.2, 12);
    expect(applyVignette(0.2, 0.75, 1)).toBeCloseTo(0.8, 12);
    expect(applyVignette(0.5, -0.75, 0)).toBe(0.5);
  });

  it('is off at 0', () => {
    expect(Array.from(render(0).data)).toEqual(Array.from(grayImage(128)));
  });

  it('negative darkens the corners and keeps the center', () => {
    const img = render(-100);
    expect(at(img, 20, 15)).toBe(128);
    expect(at(img, 0, 0)).toBeLessThan(50);
    expect(at(img, W - 1, H - 1)).toBeLessThan(50);
    // Edges midway are darkened less than the corners.
    expect(at(img, 0, 15)).toBeGreaterThan(at(img, 0, 0));
    expect(at(img, 0, 15)).toBeLessThan(128);
  });

  it('positive lightens the corners', () => {
    const img = render(100);
    expect(at(img, 20, 15)).toBe(128);
    expect(at(img, 0, 0)).toBeGreaterThan(200);
  });

  it('follows the crop: the cropped frame gets its own vignette', () => {
    const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const img = render(-100, { cropRect: crop });
    expect(img.width).toBe(20);
    expect(img.height).toBe(15);
    expect(at(img, 0, 0)).toBeLessThan(50);
    expect(at(img, 10, 7)).toBe(128);
  });

  it('leaves transparent (outside the image) pixels alone', () => {
    const out = applyGeometryRgba8(grayImage(128), { width: W, height: H }, { ...defaultEditSettings().geometry, angle: 30 }, -0.75);
    expect(Array.from(out.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
  });
});
