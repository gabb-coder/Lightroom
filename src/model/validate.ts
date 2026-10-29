import {
  CROP_ASPECTS,
  defaultEditSettings,
  type CropAspect,
  HSL_COLORS,
  type EditSettings,
  type HslAdjust,
  type Point,
  type Rect,
  type Treatment,
  GRADE_REGIONS,
  type ColorGradingSettings,
  type GradeRegion,
  type GradeWheel,
} from './editSettings';
import { ANGLE_SLIDER, BASIC_SLIDERS, DETAIL_SLIDERS, EFFECTS_SLIDERS, gradeSliderDef, GRADING_SLIDERS, HSL_RANGE, snapSliderValue, type SliderDef } from './sliders';

/**
 * Turns untrusted JSON (a preset file, a database row) into valid
 * EditSettings v1: unknown fields are dropped, missing or invalid ones fall
 * back to defaults, and numbers are clamped to their slider ranges.
 */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function sliderValue(def: SliderDef, v: unknown, fallback: number): number {
  return finite(v) ? snapSliderValue(def, v) : fallback;
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  return finite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function sliderGroup<T extends Record<string, number>>(defs: Record<keyof T, SliderDef>, raw: unknown, fallback: T): T {
  const src = isObject(raw) ? raw : {};
  const out = { ...fallback };
  for (const key of Object.keys(fallback) as (keyof T & string)[]) {
    const fallbackValue = fallback[key] ?? 0;
    out[key] = sliderValue(defs[key], src[key], fallbackValue) as T[typeof key];
  }
  return out;
}

function points(raw: unknown, fallback: Point[]): Point[] {
  if (!Array.isArray(raw)) return fallback;
  const pts = raw
    .filter((p): p is Json => isObject(p) && finite(p.x) && finite(p.y))
    .map((p) => ({ x: clampNumber(p.x, 0, 1, 0), y: clampNumber(p.y, 0, 1, 0) }))
    .sort((a, b) => a.x - b.x);
  return pts.length >= 2 ? pts : fallback;
}

function rect(raw: unknown, fallback: Rect): Rect {
  if (!isObject(raw)) return fallback;
  const x = clampNumber(raw.x, 0, 1, fallback.x);
  const y = clampNumber(raw.y, 0, 1, fallback.y);
  const w = clampNumber(raw.w, 0, 1 - x, fallback.w);
  const h = clampNumber(raw.h, 0, 1 - y, fallback.h);
  return w > 0 && h > 0 ? { x, y, w, h } : fallback;
}

function hslAdjust(raw: unknown): HslAdjust {
  const src = isObject(raw) ? raw : {};
  const v = (x: unknown) => Math.round(clampNumber(x, HSL_RANGE.min, HSL_RANGE.max, 0));
  return { hue: v(src.hue), sat: v(src.sat), lum: v(src.lum) };
}

function gradeWheel(region: GradeRegion, raw: unknown): GradeWheel {
  const src = isObject(raw) ? raw : {};
  // Hue wraps (360 → 0) rather than clamping.
  const hue = finite(src.hue) ? ((Math.round(src.hue) % 360) + 360) % 360 : 0;
  return { hue, sat: sliderValue(gradeSliderDef(region, 'sat'), src.sat, 0), lum: sliderValue(gradeSliderDef(region, 'lum'), src.lum, 0) };
}

function colorGrading(raw: unknown, fallback: ColorGradingSettings): ColorGradingSettings {
  const src = isObject(raw) ? raw : {};
  const wheels = Object.fromEntries(GRADE_REGIONS.map((r) => [r, gradeWheel(r, src[r])])) as Record<GradeRegion, GradeWheel>;
  return { ...wheels, ...sliderGroup(GRADING_SLIDERS, src, { blending: fallback.blending, balance: fallback.balance }) };
}

export function parseEditSettings(raw: unknown): EditSettings {
  const d = defaultEditSettings();
  const src = isObject(raw) ? raw : {};
  const basicSrc = isObject(src.basic) ? src.basic : {};
  const { treatment: defaultTreatment, ...basicDefaults } = d.basic;
  const treatment: Treatment = basicSrc.treatment === 'bw' ? 'bw' : defaultTreatment;
  const curve = isObject(src.curve) ? src.curve : {};
  const hsl = isObject(src.hsl) ? src.hsl : {};
  const geometry = isObject(src.geometry) ? src.geometry : {};
  const rotation = geometry.rotation;

  return {
    version: 1,
    basic: { treatment, ...sliderGroup(BASIC_SLIDERS, basicSrc, basicDefaults) },
    curve: {
      rgb: points(curve.rgb, d.curve.rgb),
      r: points(curve.r, d.curve.r),
      g: points(curve.g, d.curve.g),
      b: points(curve.b, d.curve.b),
    },
    hsl: Object.fromEntries(HSL_COLORS.map((c) => [c, hslAdjust(hsl[c])])) as EditSettings['hsl'],
    colorGrading: colorGrading(src.colorGrading, d.colorGrading),
    detail: sliderGroup(DETAIL_SLIDERS, src.detail, d.detail),
    effects: sliderGroup(EFFECTS_SLIDERS, src.effects, d.effects),
    geometry: {
      cropRect: rect(geometry.cropRect, d.geometry.cropRect),
      angle: sliderValue(ANGLE_SLIDER, geometry.angle, d.geometry.angle),
      rotation: rotation === 1 || rotation === 2 || rotation === 3 ? rotation : 0,
      flipH: geometry.flipH === true,
      flipV: geometry.flipV === true,
      aspect: CROP_ASPECTS.includes(geometry.aspect as CropAspect) ? (geometry.aspect as CropAspect) : d.geometry.aspect,
    },
  };
}
