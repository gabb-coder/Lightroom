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
  defaultMaskAdjust,
  MAX_MASKS,
  MAX_SPOT_RADIUS,
  MAX_SPOTS,
  MIN_SPOT_RADIUS,
  type Spot,
  type BrushStroke,
  type Mask,
  type MaskAdjust,
  MAX_BRUSH_STROKES,
  MAX_STROKE_POINTS,
} from './editSettings';
import {
  ANGLE_SLIDER,
  BASIC_SLIDERS,
  DETAIL_SLIDERS,
  EFFECTS_SLIDERS,
  gradeSliderDef,
  GRADING_SLIDERS,
  HSL_RANGE,
  MASK_FEATHER_SLIDER,
  maskSliderDef,
  snapSliderValue,
  type SliderDef,
} from './sliders';

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

function maskAdjust(raw: unknown): MaskAdjust {
  const src = isObject(raw) ? raw : {};
  const d = defaultMaskAdjust();
  const out = { ...d };
  for (const key of Object.keys(d) as (keyof MaskAdjust)[]) out[key] = sliderValue(maskSliderDef(key), src[key], d[key]);
  return out;
}

/** Masks with valid geometry; ids are kept when they are non-empty strings and unique. */
function masks(raw: unknown): Mask[] {
  if (!Array.isArray(raw)) return [];
  const out: Mask[] = [];
  const ids = new Set<string>();
  for (const m of raw.slice(0, MAX_MASKS)) {
    if (!isObject(m)) continue;
    const id = typeof m.id === 'string' && m.id && !ids.has(m.id) ? m.id : `mask-${out.length + 1}-${ids.size}`;
    ids.add(id);
    const coord = (v: unknown, fallback: number) => clampNumber(v, -1, 2, fallback);
    if (m.kind === 'linear') {
      const mask: Mask = { id, kind: 'linear', x0: coord(m.x0, 0.5), y0: coord(m.y0, 0.2), x1: coord(m.x1, 0.5), y1: coord(m.y1, 0.6), adjust: maskAdjust(m.adjust) };
      // Start and end must differ, or the gradient has no direction.
      if (mask.x0 === mask.x1 && mask.y0 === mask.y1) mask.y1 = mask.y0 + 0.1;
      out.push(mask);
    } else if (m.kind === 'radial') {
      out.push({
        id,
        kind: 'radial',
        cx: coord(m.cx, 0.5),
        cy: coord(m.cy, 0.5),
        rx: clampNumber(m.rx, 0.005, 2, 0.25),
        ry: clampNumber(m.ry, 0.005, 2, 0.25),
        angle: clampNumber(m.angle, -180, 180, 0),
        feather: sliderValue(MASK_FEATHER_SLIDER, m.feather, MASK_FEATHER_SLIDER.defaultValue),
        invert: m.invert === true,
        adjust: maskAdjust(m.adjust),
      });
    } else if (m.kind === 'brush') {
      out.push({ id, kind: 'brush', aspect: clampNumber(m.aspect, 0.01, 100, 1.5), strokes: brushStrokes(m.strokes), adjust: maskAdjust(m.adjust) });
    }
  }
  return out;
}

/** Spots (M28) with in-range values; ids kept when non-empty and unique. */
function spots(raw: unknown): Spot[] {
  if (!Array.isArray(raw)) return [];
  const out: Spot[] = [];
  const ids = new Set<string>();
  for (const sp of raw.slice(0, MAX_SPOTS)) {
    if (!isObject(sp)) continue;
    const id = typeof sp.id === 'string' && sp.id && !ids.has(sp.id) ? sp.id : `spot-${out.length + 1}-${ids.size}`;
    ids.add(id);
    const coord = (v: unknown) => clampNumber(v, 0, 1, 0.5);
    out.push({
      id,
      mode: sp.mode === 'clone' ? 'clone' : 'heal',
      x: coord(sp.x),
      y: coord(sp.y),
      sx: coord(sp.sx),
      sy: coord(sp.sy),
      radius: clampNumber(sp.radius, MIN_SPOT_RADIUS, MAX_SPOT_RADIUS, 0.02),
      feather: clampNumber(sp.feather, 0, 100, 50),
      opacity: clampNumber(sp.opacity, 0, 100, 100),
    });
  }
  return out;
}

/** Brush strokes with finite, in-range values; strokes without points are dropped. */
function brushStrokes(raw: unknown): BrushStroke[] {
  if (!Array.isArray(raw)) return [];
  const out: BrushStroke[] = [];
  for (const s of raw.slice(0, MAX_BRUSH_STROKES)) {
    if (!isObject(s) || !Array.isArray(s.points)) continue;
    const points = s.points.slice(0, MAX_STROKE_POINTS * 2).map((v) => clampNumber(v, -1, 2, 0));
    if (points.length % 2 === 1) points.pop();
    if (points.length === 0) continue;
    out.push({ erase: s.erase === true, radius: clampNumber(s.radius, 0.001, 0.5, 0.05), feather: clampNumber(s.feather, 0, 100, 50), points });
  }
  return out;
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
    masks: masks(src.masks),
    spots: spots(src.spots),
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
