import { describe, expect, it } from 'vitest';
import { defaultEditSettings, defaultMaskAdjust, type LinearMask, type MaskAdjust, type RadialMask } from '../model/editSettings';
import { adjustForMask, applyMasks, maskParams, maskShape, maskWeight } from './masks';
import { pipelineParams, renderRgba8 } from './pipeline';

const adjust = (patch: Partial<MaskAdjust>): MaskAdjust => ({ ...defaultMaskAdjust(), ...patch });
const linear = (patch: Partial<LinearMask> = {}): LinearMask => ({ id: 'l', kind: 'linear', x0: 0.5, y0: 0.2, x1: 0.5, y1: 0.6, adjust: adjust({ exposure: 1 }), ...patch });
const radial = (patch: Partial<RadialMask> = {}): RadialMask => ({
  id: 'r',
  kind: 'radial',
  cx: 0.5,
  cy: 0.5,
  rx: 0.25,
  ry: 0.25,
  angle: 0,
  feather: 50,
  invert: false,
  adjust: adjust({ exposure: 1 }),
  ...patch,
});

describe('mask weights', () => {
  const W = 200;
  const H = 100;

  it('linear: full before the start, none after the end, half way between', () => {
    const s = maskShape(linear());
    expect(maskWeight(s, 100, 5, W, H)).toBe(1);
    expect(maskWeight(s, 100, 20, W, H)).toBe(1);
    expect(maskWeight(s, 100, 40, W, H)).toBeCloseTo(0.5, 9);
    expect(maskWeight(s, 100, 60, W, H)).toBe(0);
    expect(maskWeight(s, 30, 95, W, H)).toBe(0);
    // Only the distance along the direction matters.
    expect(maskWeight(s, 3, 40, W, H)).toBeCloseTo(maskWeight(s, 190, 40, W, H), 12);
  });

  it('linear: works in any direction, measured in pixels', () => {
    const s = maskShape(linear({ x0: 0, y0: 0, x1: 1, y1: 1 }));
    expect(maskWeight(s, 0, 0, W, H)).toBe(1);
    expect(maskWeight(s, 100, 50, W, H)).toBeCloseTo(0.5, 9);
    expect(maskWeight(s, 200, 100, W, H)).toBe(0);
  });

  it('radial: solid core, feathered rim, nothing outside; invert flips it', () => {
    const s = maskShape(radial());
    // rx = 50 px, ry = 25 px; feather 50% → solid inside half the radius.
    expect(maskWeight(s, 100, 50, W, H)).toBe(1);
    expect(maskWeight(s, 120, 50, W, H)).toBe(1);
    expect(maskWeight(s, 137.5, 50, W, H)).toBeCloseTo(0.5, 9);
    expect(maskWeight(s, 151, 50, W, H)).toBe(0);
    expect(maskWeight(s, 100, 76, W, H)).toBe(0);
    const inv = maskShape(radial({ invert: true }));
    expect(maskWeight(inv, 100, 50, W, H)).toBe(0);
    expect(maskWeight(inv, 5, 5, W, H)).toBe(1);
  });

  it('radial: zero feather is a hard edge; rotation turns the ellipse', () => {
    const hard = maskShape(radial({ feather: 0 }));
    expect(maskWeight(hard, 149, 50, W, H)).toBe(1);
    expect(maskWeight(hard, 151, 50, W, H)).toBe(0);
    // 60 px by 20 px; turned 90°, the long axis is vertical.
    const flat = maskShape(radial({ feather: 0, rx: 0.3, ry: 0.2 }));
    const turned = maskShape(radial({ feather: 0, rx: 0.3, ry: 0.2, angle: 90 }));
    expect(maskWeight(flat, 100 + 50, 50, W, H)).toBe(1);
    expect(maskWeight(flat, 100, 50 + 30, W, H)).toBe(0);
    expect(maskWeight(turned, 100, 50 + 45, W, H)).toBe(1);
    expect(maskWeight(turned, 100 + 30, 50, W, H)).toBe(0);
  });

  it('is independent of the render size (normalized coordinates)', () => {
    const s = maskShape(radial({ cx: 0.3, cy: 0.6 }));
    for (const [u, v] of [[0.31, 0.6], [0.4, 0.62], [0.2, 0.5]] as const) {
      expect(maskWeight(s, u * 200, v * 100, 200, 100)).toBeCloseTo(maskWeight(s, u * 50, v * 25, 50, 25), 12);
    }
  });
});

describe('local adjustments', () => {
  it('skips masks with neutral adjustments', () => {
    expect(maskParams([linear({ adjust: defaultMaskAdjust() })])).toEqual([]);
    expect(maskParams([linear(), radial()])).toHaveLength(2);
  });

  it('blends the adjusted color by the weight', () => {
    const [m] = maskParams([linear()]);
    if (!m) throw new Error('expected a mask');
    const c = [0.2, 0.3, 0.4] as const;
    expect(applyMasks(c, [m], [0])).toEqual(c);
    const full = adjustForMask(c, m);
    expect(full[0]).toBeCloseTo(0.4, 12); // +1 EV doubles linear light
    expect(applyMasks(c, [m], [1])).toEqual(full);
    expect(applyMasks(c, [m], [0.5])[0]).toBeCloseTo(0.3, 12);
  });

  it('a linear mask brightens only its side of the photo', () => {
    const W = 40;
    const H = 40;
    const src = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) src.set([100, 100, 100, 255], i * 4);
    const s = defaultEditSettings();
    s.masks = [linear({ x0: 0.5, y0: 0.3, x1: 0.5, y1: 0.5 })];
    const out = renderRgba8(src, { width: W, height: H }, pipelineParams(s)).data;
    const at = (x: number, y: number) => out[(y * W + x) * 4] ?? 0;
    expect(at(20, 2)).toBeGreaterThan(125); // top: +1 EV
    expect(at(20, 30)).toBe(100); // bottom: untouched
    expect(at(20, 16)).toBeGreaterThan(at(20, 17)); // fades
  });
});
