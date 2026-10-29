import { describe, expect, it } from 'vitest';
import { defaultEditSettings, type EditSettings } from './editSettings';
import { DEFAULT_COPY_PANELS, geometryForTarget, normalizePanels, pasteSettings, SETTINGS_PANELS } from './copySettings';
import { isCropInside } from './crop';

function edited(): EditSettings {
  const s = defaultEditSettings();
  s.basic.exposure = 1.2;
  s.basic.treatment = 'bw';
  s.curve.rgb = [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }];
  s.hsl.red = { hue: 10, sat: -20, lum: 5 };
  s.detail.sharpAmount = 70;
  s.effects = { vignette: -30, grain: 20, grainSize: 40 };
  s.geometry = { cropRect: { x: 0.1, y: 0.1, w: 0.5, h: 0.6 }, angle: 3, rotation: 1, flipH: true, flipV: false, aspect: 'custom' };
  return s;
}

const LANDSCAPE = { width: 600, height: 400 };

describe('copy / paste settings', () => {
  it('lists the Develop panels in panel order; the default leaves out crop and geometry', () => {
    expect(SETTINGS_PANELS.map((p) => p.label)).toEqual(['Basic', 'Tone curve', 'Color mixer', 'Color grading', 'Detail', 'Effects', 'Crop and geometry']);
    expect(DEFAULT_COPY_PANELS).not.toContain('geometry');
    expect(normalizePanels(['effects', 'basic', 'nope', 'basic'])).toEqual(['basic', 'effects']);
  });

  it('pastes exactly the chosen panels and keeps the rest of the target', () => {
    const target = defaultEditSettings();
    target.basic.contrast = 40;
    target.effects.vignette = 50;
    const out = pasteSettings(target, edited(), ['basic', 'detail'], LANDSCAPE);
    expect(out.basic).toEqual(edited().basic); // whole panel replaced, including contrast 0
    expect(out.detail.sharpAmount).toBe(70);
    expect(out.effects.vignette).toBe(50);
    expect(out.curve).toEqual(defaultEditSettings().curve);
    expect(out.geometry).toEqual(defaultEditSettings().geometry);
  });

  it('pasting every panel onto the same-sized photo reproduces the source', () => {
    const all = SETTINGS_PANELS.map((p) => p.id);
    expect(pasteSettings(defaultEditSettings(), edited(), all, LANDSCAPE)).toEqual(edited());
  });

  it('never shares objects with the source', () => {
    const source = edited();
    const out = pasteSettings(defaultEditSettings(), source, ['curve'], LANDSCAPE);
    out.curve.rgb.push({ x: 0.9, y: 0.9 });
    expect(source.curve.rgb).toHaveLength(3);
  });

  it('re-fits an aspect-preset crop to a photo of another shape', () => {
    const square = { ...defaultEditSettings().geometry, aspect: '1:1' as const, cropRect: { x: 1 / 6, y: 0, w: 2 / 3, h: 1 } };
    const g = geometryForTarget(square, { width: 300, height: 600 }); // portrait target
    expect(g.cropRect.w * 300).toBeCloseTo(g.cropRect.h * 600, 6); // still square in pixels
    expect(g.cropRect.w).toBeCloseTo(1, 6);
  });

  it('keeps a custom crop inside a straightened target', () => {
    const g = geometryForTarget({ ...defaultEditSettings().geometry, angle: 10, cropRect: { x: 0, y: 0, w: 1, h: 1 }, aspect: 'custom' }, LANDSCAPE);
    expect(isCropInside(g.cropRect, 10, LANDSCAPE)).toBe(true);
  });
});
