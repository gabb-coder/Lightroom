import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from './editSettings';
import { applyPresetTo, createPreset, parsePreset, PresetParseError, SAMPLE_PRESETS, serializePreset } from './presets';

const byName = (name: string) => {
  const p = SAMPLE_PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`missing ${name}`);
  return p;
};

describe('sample presets', () => {
  it('has the six presets from the design in two groups', () => {
    expect(SAMPLE_PRESETS.map((p) => `${p.group}:${p.name}`)).toEqual([
      'user:Warm film',
      'user:Soft matte',
      'user:Crisp B&W',
      'builtin:Clean daylight',
      'builtin:High contrast',
      'builtin:Faded',
    ]);
  });

  it('maps the design values onto EditSettings', () => {
    const crisp = byName('Crisp B&W').settings;
    expect(crisp.basic).toMatchObject({ treatment: 'bw', contrast: 30, whites: 16, blacks: -20 });
    expect(crisp.detail.sharpAmount).toBe(60);
    const warm = byName('Warm film').settings;
    expect(warm.effects).toEqual({ vignette: -22, grain: 30, grainSize: 25 });
  });
});

describe('applying a preset', () => {
  it('replaces every adjustment with defaults plus the preset values', () => {
    const current = defaultEditSettings();
    current.basic.exposure = 2;
    current.basic.treatment = 'bw';
    current.effects.vignette = 50;
    const out = applyPresetTo(current, byName('Faded'));
    const expected = defaultEditSettings();
    Object.assign(expected.basic, { contrast: -30, blacks: 40, saturation: -25 });
    expect(out).toEqual(expected);
  });

  it('keeps the current crop and rotation', () => {
    const current = defaultEditSettings();
    current.geometry = { cropRect: { x: 0.1, y: 0, w: 0.5, h: 1 }, angle: 3, rotation: 2, flipH: true, flipV: false, aspect: 'custom' };
    expect(applyPresetTo(current, byName('High contrast')).geometry).toEqual(current.geometry);
  });

  it('never shares objects with the preset (later edits cannot change it)', () => {
    const preset = byName('Soft matte');
    const out = applyPresetTo(defaultEditSettings(), preset);
    out.basic.contrast = 99;
    out.curve.rgb.push({ x: 0.5, y: 0.5 });
    expect(preset.settings.basic.contrast).toBe(-24);
    expect(preset.settings.curve.rgb).toHaveLength(2);
  });
});

describe('preset JSON', () => {
  it('survives save -> JSON -> load unchanged, and applies identically', () => {
    const s = defaultEditSettings();
    Object.assign(s.basic, { treatment: 'bw', temp: 12, exposure: -0.65, contrast: 33, shadows: 41 });
    s.effects.grain = 12;
    s.curve.r = [
      { x: 0, y: 0.05 },
      { x: 0.5, y: 0.55 },
      { x: 1, y: 1 },
    ];
    s.hsl.orange = { hue: 5, sat: -10, lum: 15 };
    const saved = createPreset('p1', '  My look ', s);
    const loaded = parsePreset(serializePreset(saved));
    expect(loaded).toEqual(saved);
    expect(loaded.name).toBe('My look');
    expect(applyPresetTo(defaultEditSettings(), loaded)).toEqual(applyPresetTo(defaultEditSettings(), saved));
  });

  it('round-trips every sample preset', () => {
    for (const p of SAMPLE_PRESETS) expect(parsePreset(serializePreset(p))).toEqual(p);
  });

  it('rejects files that are not presets', () => {
    expect(() => parsePreset('{oops')).toThrow(PresetParseError);
    expect(() => parsePreset('{"format":"other"}')).toThrow('Not a preset');
    expect(() => parsePreset(JSON.stringify({ format: 'photo-editor-preset', version: 9, id: 'a', name: 'b' }))).toThrow('version 9');
    expect(() => parsePreset(JSON.stringify({ format: 'photo-editor-preset', version: 1, id: 'a', name: ' ' }))).toThrow('name');
  });

  it('clamps out-of-range values from a hand-edited file', () => {
    const json = JSON.stringify({ format: 'photo-editor-preset', version: 1, id: 'x', name: 'Hot', settings: { basic: { exposure: 50 } } });
    expect(parsePreset(json).settings.basic.exposure).toBe(5);
  });
});
