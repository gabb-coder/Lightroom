/**
 * EditSettings v1: everything needed to render a photo from its original.
 * Plain JSON so presets, history, copy/paste and persistence can store it.
 *
 * Extends SPEC.md's type with fields the design needs: basic.treatment
 * (Color / B&W), effects.grainSize, and geometry.rotation (Rotate 90°).
 */

export interface Point {
  x: number;
  y: number;
}

/** Normalized to the uncropped image: 0..1 on both axes. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Treatment = 'color' | 'bw';

export interface BasicSettings {
  treatment: Treatment;
  temp: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  saturation: number;
}

export type BasicSliderKey = Exclude<keyof BasicSettings, 'treatment'>;

export const HSL_COLORS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;
export type HslColor = (typeof HSL_COLORS)[number];

export interface HslAdjust {
  hue: number;
  sat: number;
  lum: number;
}

export interface EditSettings {
  version: 1;
  basic: BasicSettings;
  curve: { rgb: Point[]; r: Point[]; g: Point[]; b: Point[] };
  hsl: Record<HslColor, HslAdjust>;
  detail: { sharpAmount: number; sharpRadius: number };
  effects: { vignette: number; grain: number; grainSize: number };
  geometry: {
    cropRect: Rect;
    /** Straighten angle in degrees. */
    angle: number;
    /** Clockwise quarter turns, 0..3. */
    rotation: 0 | 1 | 2 | 3;
    flipH: boolean;
    flipV: boolean;
  };
}

function identityCurve(): Point[] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
}

/** Defaults from design/Develop.dc.html. */
export function defaultEditSettings(): EditSettings {
  const hsl = {} as Record<HslColor, HslAdjust>;
  for (const color of HSL_COLORS) hsl[color] = { hue: 0, sat: 0, lum: 0 };
  return {
    version: 1,
    basic: {
      treatment: 'color',
      temp: 0,
      tint: 0,
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      vibrance: 0,
      saturation: 0,
    },
    curve: { rgb: identityCurve(), r: identityCurve(), g: identityCurve(), b: identityCurve() },
    hsl,
    detail: { sharpAmount: 40, sharpRadius: 1 },
    effects: { vignette: 0, grain: 0, grainSize: 25 },
    geometry: { cropRect: { x: 0, y: 0, w: 1, h: 1 }, angle: 0, rotation: 0, flipH: false, flipV: false },
  };
}
