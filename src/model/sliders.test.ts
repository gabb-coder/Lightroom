import { describe, expect, it } from 'vitest';
import {
  BASIC_SLIDERS,
  formatSliderValue,
  isBasicEdited,
  isDefaultValue,
  parseSliderValue,
  scrubSliderValue,
  snapSliderValue,
} from './sliders';
import { defaultEditSettings, type BasicSliderKey } from './editSettings';

describe('slider definitions', () => {
  it('defaults sit inside every range and match EditSettings defaults', () => {
    const basic = defaultEditSettings().basic;
    for (const [key, def] of Object.entries(BASIC_SLIDERS)) {
      expect(def.defaultValue).toBeGreaterThanOrEqual(def.min);
      expect(def.defaultValue).toBeLessThanOrEqual(def.max);
      expect(basic[key as BasicSliderKey]).toBe(def.defaultValue);
    }
  });

  it('uses the design ranges for exposure', () => {
    expect(BASIC_SLIDERS.exposure).toMatchObject({ min: -5, max: 5, step: 0.05 });
  });
});

describe('formatSliderValue', () => {
  it('formats EV with two decimals and a true minus sign', () => {
    expect(formatSliderValue(BASIC_SLIDERS.exposure, 0)).toBe('0.00');
    expect(formatSliderValue(BASIC_SLIDERS.exposure, 0.35)).toBe('+0.35');
    expect(formatSliderValue(BASIC_SLIDERS.exposure, -1.5)).toBe('−1.50');
  });

  it('formats integers with a sign', () => {
    expect(formatSliderValue(BASIC_SLIDERS.contrast, 0)).toBe('0');
    expect(formatSliderValue(BASIC_SLIDERS.contrast, 12)).toBe('+12');
    expect(formatSliderValue(BASIC_SLIDERS.contrast, -38)).toBe('−38');
  });
});

describe('snapSliderValue', () => {
  it('snaps to the step without float noise and clamps to the range', () => {
    expect(snapSliderValue(BASIC_SLIDERS.exposure, 0.35000000000000003)).toBe(0.35);
    expect(snapSliderValue(BASIC_SLIDERS.exposure, 0.37)).toBe(0.35);
    expect(snapSliderValue(BASIC_SLIDERS.exposure, 9)).toBe(5);
    expect(snapSliderValue(BASIC_SLIDERS.contrast, -140)).toBe(-100);
  });

  it('detects default values', () => {
    expect(isDefaultValue(BASIC_SLIDERS.exposure, 0)).toBe(true);
    expect(isDefaultValue(BASIC_SLIDERS.exposure, 0.05)).toBe(false);
  });
});

describe('parseSliderValue', () => {
  it('accepts signed numbers, the true minus sign and clamps/snaps', () => {
    expect(parseSliderValue(BASIC_SLIDERS.exposure, '1.5')).toBe(1.5);
    expect(parseSliderValue(BASIC_SLIDERS.exposure, '+0.37')).toBe(0.35);
    expect(parseSliderValue(BASIC_SLIDERS.contrast, '\u221230')).toBe(-30);
    expect(parseSliderValue(BASIC_SLIDERS.contrast, ' -250 ')).toBe(-100);
    expect(parseSliderValue(BASIC_SLIDERS.exposure, '.5')).toBe(0.5);
  });

  it('rejects text that is not a number', () => {
    for (const text of ['', 'abc', '1.2.3', '--4', '5e3', '+']) {
      expect(parseSliderValue(BASIC_SLIDERS.contrast, text)).toBeNull();
    }
  });
});

describe('scrubSliderValue', () => {
  it('sweeps the full range over SCRUB_RANGE_PX pixels', () => {
    expect(scrubSliderValue(BASIC_SLIDERS.contrast, 0, 100)).toBe(100);
    expect(scrubSliderValue(BASIC_SLIDERS.contrast, 0, -50)).toBe(-50);
    expect(scrubSliderValue(BASIC_SLIDERS.exposure, 0, 10)).toBe(0.5);
    expect(scrubSliderValue(BASIC_SLIDERS.exposure, 4, 500)).toBe(5);
  });
});

describe('isBasicEdited', () => {
  it('is false at defaults and true after any slider or treatment change', () => {
    const settings = defaultEditSettings();
    expect(isBasicEdited(settings)).toBe(false);
    expect(isBasicEdited({ ...settings, basic: { ...settings.basic, blacks: 3 } })).toBe(true);
    expect(isBasicEdited({ ...settings, basic: { ...settings.basic, treatment: 'bw' } })).toBe(true);
  });
});
