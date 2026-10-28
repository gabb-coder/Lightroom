import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from './editSettings';
import { parseEditSettings } from './validate';

describe('parseEditSettings', () => {
  it('returns defaults for garbage', () => {
    for (const raw of [null, 42, 'x', [], {}]) expect(parseEditSettings(raw)).toEqual(defaultEditSettings());
  });

  it('round-trips valid settings unchanged', () => {
    const s = defaultEditSettings();
    s.basic = { ...s.basic, treatment: 'bw', exposure: 1.35, contrast: -20 };
    s.effects.vignette = -18;
    s.detail.sharpRadius = 1.4;
    s.curve.rgb = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0.25 },
      { x: 1, y: 1 },
    ];
    s.hsl.blue = { hue: -10, sat: 20, lum: 5 };
    s.geometry = { cropRect: { x: 0.1, y: 0.1, w: 0.8, h: 0.7 }, angle: 2.5, rotation: 1, flipH: true, flipV: false };
    expect(parseEditSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('clamps and snaps out-of-range numbers and drops unknown fields', () => {
    const parsed = parseEditSettings({
      basic: { exposure: 9, contrast: -400, saturation: 12.6, treatment: 'sepia', bogus: 1 },
      effects: { grain: -5 },
      detail: { sharpRadius: 0.123 },
      geometry: { rotation: 7, angle: 90 },
      extra: true,
    });
    expect(parsed.basic.exposure).toBe(5);
    expect(parsed.basic.contrast).toBe(-100);
    expect(parsed.basic.saturation).toBe(13);
    expect(parsed.basic.treatment).toBe('color');
    expect(parsed.effects.grain).toBe(0);
    expect(parsed.detail.sharpRadius).toBe(0.5);
    expect(parsed.geometry.rotation).toBe(0);
    expect(parsed.geometry.angle).toBe(45);
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.basic).not.toHaveProperty('bogus');
  });
});
