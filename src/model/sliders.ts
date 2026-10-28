import type { BasicSliderKey } from './editSettings';

export type SliderFormat = 'ev' | 'int' | 'uint' | 'dec' | 'deg';

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
}

const PLAIN_TRACK = '#3d3d3d';

function bipolar(id: string, label: string, min: number, max: number, step: number, format: SliderFormat, track = PLAIN_TRACK): SliderDef {
  return { id, label, min, max, step, defaultValue: 0, bipolar: true, format, track };
}

/** Basic panel slider definitions; ranges and steps from design/Develop.dc.html. */
export const BASIC_SLIDERS: Readonly<Record<BasicSliderKey, SliderDef>> = {
  temp: bipolar('temp', 'Temp', -100, 100, 1, 'int', 'linear-gradient(90deg, #4d78c9, #8a8a8a, #d4b44e)'),
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
