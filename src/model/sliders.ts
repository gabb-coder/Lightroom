import { HSL_COLORS, type BasicSliderKey, type EditSettings, type HslColor } from './editSettings';

export type SliderFormat = 'ev' | 'int' | 'uint' | 'dec' | 'deg' | 'hue';

export interface SliderDef {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** Bipolar sliders have a center tick and a signed value. */
  bipolar: boolean;
  format: SliderFormat;
  /** CSS background for the track. */
  track: string;
  /** Name in the History panel, when it differs from the label (design: "Temperature"). */
  historyLabel?: string;
  /** Accessible name when the short label repeats another panel's ("Shadows saturation" vs "Saturation"). */
  ariaLabel?: string;
}

const PLAIN_TRACK = '#3d3d3d';

function bipolar(id: string, label: string, min: number, max: number, step: number, format: SliderFormat, track = PLAIN_TRACK): SliderDef {
  return { id, label, min, max, step, defaultValue: 0, bipolar: true, format, track };
}

/** Basic panel slider definitions; ranges and steps from design/Develop.dc.html. */
export const BASIC_SLIDERS: Readonly<Record<BasicSliderKey, SliderDef>> = {
  temp: { ...bipolar('temp', 'Temp', -100, 100, 1, 'int', 'linear-gradient(90deg, #4d78c9, #8a8a8a, #d4b44e)'), historyLabel: 'Temperature' },
  tint: bipolar('tint', 'Tint', -100, 100, 1, 'int', 'linear-gradient(90deg, #4fa865, #8a8a8a, #b956b0)'),
  exposure: bipolar('exposure', 'Exposure', -5, 5, 0.05, 'ev'),
  contrast: bipolar('contrast', 'Contrast', -100, 100, 1, 'int'),
  highlights: bipolar('highlights', 'Highlights', -100, 100, 1, 'int'),
  shadows: bipolar('shadows', 'Shadows', -100, 100, 1, 'int'),
  whites: bipolar('whites', 'Whites', -100, 100, 1, 'int'),
  blacks: bipolar('blacks', 'Blacks', -100, 100, 1, 'int'),
  vibrance: bipolar('vibrance', 'Vibrance', -100, 100, 1, 'int'),
  saturation: bipolar('saturation', 'Saturation', -100, 100, 1, 'int'),
};

function unipolar(id: string, label: string, min: number, max: number, step: number, defaultValue: number, format: SliderFormat, historyLabel: string): SliderDef {
  return { id, label, min, max, step, defaultValue, bipolar: false, format, track: PLAIN_TRACK, historyLabel };
}

/** Detail, Effects and Geometry sliders; ranges also validate presets and stored settings. */
export const DETAIL_SLIDERS = {
  sharpAmount: unipolar('sharpAmount', 'Amount', 0, 150, 1, 0, 'uint', 'Sharpening'),
  sharpRadius: unipolar('sharpRadius', 'Radius', 0.5, 3, 0.1, 1, 'dec', 'Sharpen radius'),
} as const satisfies Record<string, SliderDef>;

export const EFFECTS_SLIDERS = {
  vignette: { ...bipolar('vignette', 'Amount', -100, 100, 1, 'int'), historyLabel: 'Vignette' },
  grain: unipolar('grain', 'Amount', 0, 100, 1, 0, 'uint', 'Grain'),
  grainSize: unipolar('grainSize', 'Size', 0, 100, 1, 25, 'uint', 'Grain size'),
} as const satisfies Record<string, SliderDef>;

/** Color grading (M14). The hue track is the color wheel unrolled. */
export const HUE_TRACK = 'linear-gradient(90deg, #e0524d, #e3c84a, #5bb35b, #48b8b0, #4a7fe0, #b956b0, #e0524d)';

export const GRADE_REGION_LABELS = { shadows: 'Shadows', midtones: 'Midtones', highlights: 'Highlights', global: 'Global' } as const;

export function gradeSliderDef(region: keyof typeof GRADE_REGION_LABELS, prop: 'hue' | 'sat' | 'lum'): SliderDef {
  const name = GRADE_REGION_LABELS[region];
  if (prop === 'hue') return { ...unipolar(`grade-${region}-hue`, 'Hue', 0, 359, 1, 0, 'hue', `${name} hue`), track: HUE_TRACK, ariaLabel: `${name} hue` };
  if (prop === 'sat') return { ...unipolar(`grade-${region}-sat`, 'Saturation', 0, 100, 1, 0, 'uint', `${name} saturation`), ariaLabel: `${name} saturation` };
  const lum = bipolar(`grade-${region}-lum`, 'Luminance', -100, 100, 1, 'int', 'linear-gradient(90deg, #202020, #eeeeee)');
  return { ...lum, historyLabel: `${name} luminance`, ariaLabel: `${name} luminance` };
}

export const GRADING_SLIDERS = {
  blending: unipolar('grade-blending', 'Blending', 0, 100, 1, 50, 'uint', 'Grading blending'),
  balance: { ...bipolar('grade-balance', 'Balance', -100, 100, 1, 'int'), historyLabel: 'Grading balance' },
} as const satisfies Record<string, SliderDef>;


/** Mask adjustment sliders (M15): Basic ranges, mask-specific accessible names. */
const MASK_LABELS: Readonly<Record<string, string>> = {
  exposure: 'Exposure',
  contrast: 'Contrast',
  highlights: 'Highlights',
  shadows: 'Shadows',
  temp: 'Temp',
  tint: 'Tint',
  saturation: 'Saturation',
};

export function maskSliderDef(key: keyof typeof MASK_LABELS): SliderDef {
  const base = BASIC_SLIDERS[key as BasicSliderKey];
  const label = MASK_LABELS[key] ?? key;
  return { ...base, id: `mask-${key}`, label, historyLabel: `Mask ${label.toLowerCase()}`, ariaLabel: `Mask ${label.toLowerCase()}` };
}

export const MASK_FEATHER_SLIDER: SliderDef = { ...unipolar('mask-feather', 'Feather', 0, 100, 1, 50, 'uint', 'Mask feather'), ariaLabel: 'Mask feather' };

export const ANGLE_SLIDER: SliderDef = bipolar('angle', 'Straighten', -45, 45, 0.1, 'deg');

/** Color mixer hue / saturation / luminance offsets. */
export const HSL_RANGE = { min: -100, max: 100 } as const;

const MINUS = '−';

function signed(v: number, text: string, epsilon: number): string {
  if (v > epsilon) return `+${text}`;
  if (v < -epsilon) return `${MINUS}${text}`;
  return text;
}

/** Display text for a slider value, matching the design (true minus sign). */
export function formatSliderValue(def: SliderDef, v: number): string {
  switch (def.format) {
    case 'ev':
      return signed(v, Math.abs(v).toFixed(2), 0.001);
    case 'int': {
      const r = Math.round(v);
      return signed(r, String(Math.abs(r)), 0);
    }
    case 'deg':
      return `${signed(v, Math.abs(v).toFixed(1), 0.04)}°`;
    case 'dec':
      return v.toFixed(1);
    case 'uint':
      return String(Math.round(v));
    case 'hue':
      return `${Math.round(v)}°`;
  }
}

function stepDecimals(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Clamps to the range and snaps to the step, without float noise. */
export function snapSliderValue(def: SliderDef, v: number): number {
  const clamped = Math.min(def.max, Math.max(def.min, v));
  const steps = Math.round((clamped - def.min) / def.step);
  return Number((def.min + steps * def.step).toFixed(stepDecimals(def.step)));
}

export function isDefaultValue(def: SliderDef, v: number): boolean {
  return Math.abs(v - def.defaultValue) < 1e-6;
}

/**
 * Parses typed text into a slider value: accepts "+1.5", "-30", "−30" (true
 * minus) and a trailing "°". Returns null for anything that isn't a number.
 */
export function parseSliderValue(def: SliderDef, text: string): number | null {
  const cleaned = text.trim().replace(/\u2212/g, '-').replace(/°$/, '').trim();
  if (cleaned === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  return snapSliderValue(def, Number(cleaned));
}

/** Pixels of label drag that sweep a slider's full range. */
export const SCRUB_RANGE_PX = 200;

/** Value after scrubbing a label `dx` pixels from where the drag started. */
export function scrubSliderValue(def: SliderDef, startValue: number, dx: number): number {
  return snapSliderValue(def, startValue + (dx * (def.max - def.min)) / SCRUB_RANGE_PX);
}

/** True if any Basic panel setting differs from its default (drives the "edited" dot). */
export function isBasicEdited(settings: EditSettings): boolean {
  const { treatment, ...sliders } = settings.basic;
  if (treatment !== 'color') return true;
  return (Object.keys(sliders) as BasicSliderKey[]).some((key) => !isDefaultValue(BASIC_SLIDERS[key], sliders[key]));
}

/** True when any slider of a group (Detail, Effects) differs from its default. */
export function isGroupEdited(defs: Readonly<Record<string, SliderDef>>, values: object): boolean {
  return Object.entries(defs).some(([key, def]) => {
    const value = (values as Record<string, unknown>)[key];
    return typeof value === 'number' && !isDefaultValue(def, value);
  });
}

/** Color mixer sliders per tab, with the design's gradient tracks. */
export type HslProp = 'hue' | 'sat' | 'lum';

export const HSL_SWATCHES: Readonly<Record<HslColor, { label: string; color: string }>> = {
  red: { label: 'Red', color: '#e0524d' },
  orange: { label: 'Orange', color: '#e88a3c' },
  yellow: { label: 'Yellow', color: '#e3c84a' },
  green: { label: 'Green', color: '#5bb35b' },
  aqua: { label: 'Aqua', color: '#48b8b0' },
  blue: { label: 'Blue', color: '#4a7fe0' },
  purple: { label: 'Purple', color: '#8a5ce0' },
  magenta: { label: 'Magenta', color: '#d050b0' },
};

const HSL_PROP_NAMES: Readonly<Record<HslProp, string>> = { hue: 'hue', sat: 'saturation', lum: 'luminance' };

export function hslSliderDef(color: HslColor, prop: HslProp): SliderDef {
  const i = HSL_COLORS.indexOf(color);
  const n = HSL_COLORS.length;
  const sw = HSL_SWATCHES[color];
  const prev = HSL_SWATCHES[HSL_COLORS[(i + n - 1) % n] ?? color].color;
  const next = HSL_SWATCHES[HSL_COLORS[(i + 1) % n] ?? color].color;
  const track =
    prop === 'hue'
      ? `linear-gradient(90deg, ${prev}, ${sw.color}, ${next})`
      : prop === 'sat'
        ? `linear-gradient(90deg, #7a7a7a, ${sw.color})`
        : `linear-gradient(90deg, #202020, ${sw.color}, #eeeeee)`;
  return {
    ...bipolar(`${prop}-${color}`, sw.label, HSL_RANGE.min, HSL_RANGE.max, 1, 'int', track),
    historyLabel: `${sw.label} ${HSL_PROP_NAMES[prop]}`,
  };
}
