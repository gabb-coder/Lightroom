import { describe, expect, it } from 'vitest';
import { defaultEditSettings, MAX_MASKS } from './editSettings';
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
    s.geometry = { cropRect: { x: 0.1, y: 0.1, w: 0.8, h: 0.7 }, angle: 2.5, rotation: 1, flipH: true, flipV: false, aspect: '3:2' };
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

describe('masks (M15)', () => {
  it('keeps valid masks, drops unknown kinds, caps the count and clamps values', () => {
    const raw = {
      masks: [
        { id: 'a', kind: 'linear', x0: 0.1, y0: 0.1, x1: 0.1, y1: 0.1, adjust: { exposure: 9, saturation: -40, bogus: 1 } },
        { id: 'a', kind: 'radial', cx: 0.5, cy: 0.5, rx: 0, ry: 5, feather: 300, invert: 'yes', adjust: {} },
        { kind: 'lasso' },
        'nope',
        ...Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, kind: 'radial' })),
      ],
    };
    const masks = parseEditSettings(raw).masks;
    expect(masks).toHaveLength(MAX_MASKS - 2); // first 8 raw entries, two of them invalid
    const [lin, rad] = masks;
    expect(lin).toMatchObject({ kind: 'linear', y1: 0.2 }); // start ≠ end
    expect(lin?.adjust).toEqual({ exposure: 5, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, saturation: -40 });
    expect(rad).toMatchObject({ kind: 'radial', rx: 0.005, ry: 2, feather: 100, invert: false });
    expect(rad?.id).not.toBe('a'); // ids stay unique
  });

  it('defaults to no masks for older settings', () => {
    expect(parseEditSettings({}).masks).toEqual([]);
  });
});

describe('brush masks (M21)', () => {
  it('keeps valid strokes, clamps values and drops broken ones', () => {
    const s = parseEditSettings({
      masks: [
        {
          id: 'b',
          kind: 'brush',
          aspect: 1.5,
          strokes: [
            { erase: true, radius: 0.04, feather: 30, points: [0.1, 0.2, 0.3] }, // odd count: last value dropped
            { radius: 9, feather: -5, points: [5, -5] },
            { radius: 0.04, points: [] },
            'junk',
          ],
          adjust: { exposure: 1 },
        },
      ],
    });
    expect(s.masks).toEqual([
      {
        id: 'b',
        kind: 'brush',
        aspect: 1.5,
        strokes: [
          { erase: true, radius: 0.04, feather: 30, points: [0.1, 0.2] },
          { erase: false, radius: 0.5, feather: 0, points: [2, -1] },
        ],
        adjust: { exposure: 1, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, saturation: 0 },
      },
    ]);
    expect(parseEditSettings({ masks: [{ kind: 'brush', aspect: 'wide', strokes: 'none' }] }).masks[0]).toMatchObject({ kind: 'brush', aspect: 1.5, strokes: [] });
  });
});
