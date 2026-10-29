/**
 * EditSettings v1: everything needed to render a photo from its original.
 * Plain JSON so presets, history, copy/paste and persistence can store it.
 *
 * Extends SPEC.md's type with fields the design needs: basic.treatment
 * (Color / B&W), effects.grainSize, geometry.rotation (Rotate 90°) and
 * geometry.aspect (the crop aspect preset, so a crop can be re-edited), and
 * colorGrading (V2, M14; older stored settings get its defaults).
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

export const CROP_ASPECTS = ['original', '1:1', '4:5', '3:2', '16:9', 'custom'] as const;
export type CropAspect = (typeof CROP_ASPECTS)[number];

export interface Geometry {
  /** Crop, normalized to the rotated/flipped (oriented) image: 0..1 on both axes. */
  cropRect: Rect;
  /** Straighten angle in degrees; positive turns the image clockwise. */
  angle: number;
  /** Clockwise quarter turns, 0..3. */
  rotation: 0 | 1 | 2 | 3;
  flipH: boolean;
  flipV: boolean;
  /** Crop aspect preset; ratios follow the crop's current orientation. */
  aspect: CropAspect;
}

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

// Type aliases (not interfaces) so they stay assignable to Record<string, number>.
export type DetailSettings = { sharpAmount: number; sharpRadius: number };
export type EffectsSettings = { vignette: number; grain: number; grainSize: number };

/** One color grading wheel (M14): hue in degrees, saturation 0–100, luminance −100–100. */
export type GradeWheel = { hue: number; sat: number; lum: number };

export const GRADE_REGIONS = ['shadows', 'midtones', 'highlights', 'global'] as const;
export type GradeRegion = (typeof GRADE_REGIONS)[number];

/** Color grading (M14): four wheels plus how the tonal ranges overlap (blending) and where they split (balance). */
export type ColorGradingSettings = Record<GradeRegion, GradeWheel> & { blending: number; balance: number };

export type DetailKey = keyof DetailSettings;
export type EffectsKey = keyof EffectsSettings;

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
  colorGrading: ColorGradingSettings;
  detail: DetailSettings;
  effects: EffectsSettings;
  geometry: Geometry;
}

export function defaultColorGrading(): ColorGradingSettings {
  const wheel = (): GradeWheel => ({ hue: 0, sat: 0, lum: 0 });
  return { shadows: wheel(), midtones: wheel(), highlights: wheel(), global: wheel(), blending: 50, balance: 0 };
}

function identityCurve(): Point[] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
}

/**
 * Defaults from design/Develop.dc.html, except sharpening: the design shows
 * Amount 40 (Lightroom's raw default); we default to 0 like Lightroom does
 * for JPEGs, so an untouched photo renders exactly as its original.
 */
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
    colorGrading: defaultColorGrading(),
    detail: { sharpAmount: 0, sharpRadius: 1 },
    effects: { vignette: 0, grain: 0, grainSize: 25 },
    geometry: { cropRect: { x: 0, y: 0, w: 1, h: 1 }, angle: 0, rotation: 0, flipH: false, flipV: false, aspect: 'original' },
  };
}
