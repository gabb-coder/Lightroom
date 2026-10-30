/**
 * EditSettings v1: everything needed to render a photo from its original.
 * Plain JSON so presets, history, copy/paste and persistence can store it.
 *
 * Extends SPEC.md's type with fields the design needs: basic.treatment
 * (Color / B&W), effects.grainSize, geometry.rotation (Rotate 90°) and
 * geometry.aspect (the crop aspect preset, so a crop can be re-edited), and
 * colorGrading and masks (V2, M14/M15; older stored settings get defaults).
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
  /** Presence (M26): medium detail, large-scale contrast, haze. −100–100. */
  texture: number;
  clarity: number;
  dehaze: number;
  vibrance: number;
  saturation: number;
}

export type BasicSliderKey = Exclude<keyof BasicSettings, 'treatment'>;

// Type aliases (not interfaces) so they stay assignable to Record<string, number>.
export type DetailSettings = { sharpAmount: number; sharpRadius: number; nrLuma: number; nrColor: number };
export type EffectsSettings = { vignette: number; grain: number; grainSize: number };

/** One color grading wheel (M14): hue in degrees, saturation 0–100, luminance −100–100. */
export type GradeWheel = { hue: number; sat: number; lum: number };

export const GRADE_REGIONS = ['shadows', 'midtones', 'highlights', 'global'] as const;
export type GradeRegion = (typeof GRADE_REGIONS)[number];

/** Color grading (M14): four wheels plus how the tonal ranges overlap (blending) and where they split (balance). */
export type ColorGradingSettings = Record<GradeRegion, GradeWheel> & { blending: number; balance: number };

/** Local adjustments a mask applies (M15); ranges match the Basic sliders. */
export type MaskAdjust = { exposure: number; contrast: number; highlights: number; shadows: number; temp: number; tint: number; saturation: number };
export type MaskAdjustKey = keyof MaskAdjust;

/**
 * A gradient mask (M15). Coordinates are normalized to the uploaded photo
 * (0..1 of its width and height, before crop/rotate/flip), so a mask stays
 * on the same part of the picture when the crop changes.
 */
export type LinearMask = {
  id: string;
  kind: 'linear';
  /** Full effect at and before (x0, y0), none at and after (x1, y1). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  adjust: MaskAdjust;
};

export type RadialMask = {
  id: string;
  kind: 'radial';
  cx: number;
  cy: number;
  /** Radii as fractions of the photo's width and height. */
  rx: number;
  ry: number;
  /** Ellipse rotation in degrees (pixel space). */
  angle: number;
  /** 0–100: how much of the radius fades out. */
  feather: number;
  /** Adjust outside the ellipse instead of inside. */
  invert: boolean;
  adjust: MaskAdjust;
};

/** One brush stroke (M21): a path of dabs that paints the mask or erases it. */
export type BrushStroke = {
  erase: boolean;
  /** Brush radius as a fraction of the photo's long edge. */
  radius: number;
  /** 0–100: how much of the radius is a soft edge. */
  feather: number;
  /** Path normalized to the photo: x0, y0, x1, y1, … (at least one point). */
  points: number[];
};

/**
 * A painted mask (M21). Strokes are normalized to the uploaded photo like
 * the gradients; `aspect` (width / height of that photo) keeps round dabs
 * round and sets the shape of the weight map they are rasterized into.
 */
export type BrushMask = {
  id: string;
  kind: 'brush';
  aspect: number;
  strokes: BrushStroke[];
  adjust: MaskAdjust;
};

export type Mask = LinearMask | RadialMask | BrushMask;
export type MaskKind = Mask['kind'];

export const MAX_MASKS = 8;

/** Spot removal (M28): copy (clone) or blend in (heal) a patch from elsewhere. */
export type SpotMode = 'heal' | 'clone';

/**
 * One retouched spot. Positions are normalized to the uploaded photo
 * (0–1 of its width / height), so spots follow crop, rotation and flips;
 * the radius is a fraction of the photo's long edge.
 */
export interface Spot {
  id: string;
  mode: SpotMode;
  /** Center of the spot that is covered. */
  x: number;
  y: number;
  /** Center of the patch it is covered with. */
  sx: number;
  sy: number;
  radius: number;
  /** Soft edge, 0–100 % of the radius. */
  feather: number;
  /** 0–100. */
  opacity: number;
}

export const MAX_SPOTS = 32;
/** Spot radius limits, as a fraction of the photo's long edge. */
export const MIN_SPOT_RADIUS = 0.002;
export const MAX_SPOT_RADIUS = 0.25;
/** Limits that keep a stored brush mask a sensible size. */
export const MAX_BRUSH_STROKES = 500;
export const MAX_STROKE_POINTS = 4000;

export function defaultMaskAdjust(): MaskAdjust {
  return { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, saturation: 0 };
}

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
  /** Linear and radial gradient masks (M15) and brush masks (M21), applied in order. */
  masks: Mask[];
  /** Spot removal (M28), applied to the original pixels before everything else. */
  spots: Spot[];
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
      texture: 0,
      clarity: 0,
      dehaze: 0,
      vibrance: 0,
      saturation: 0,
    },
    curve: { rgb: identityCurve(), r: identityCurve(), g: identityCurve(), b: identityCurve() },
    hsl,
    colorGrading: defaultColorGrading(),
    masks: [],
    spots: [],
    detail: { sharpAmount: 0, sharpRadius: 1, nrLuma: 0, nrColor: 0 },
    effects: { vignette: 0, grain: 0, grainSize: 25 },
    geometry: { cropRect: { x: 0, y: 0, w: 1, h: 1 }, angle: 0, rotation: 0, flipH: false, flipV: false, aspect: 'original' },
  };
}
