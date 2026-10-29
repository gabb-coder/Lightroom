import type { BasicSliderKey, CropAspect } from './editSettings';

/** Aspect preset names as shown in the Aspect menu (design/Develop.dc.html). */
export const CROP_ASPECT_LABELS: Readonly<Record<CropAspect, string>> = {
  original: 'Original',
  '1:1': '1 : 1',
  '4:5': '4 : 5',
  '3:2': '3 : 2',
  '16:9': '16 : 9',
  custom: 'Custom',
};
import type { HistoryEntry } from './history';
import { GRADE_REGIONS, HSL_COLORS, type GradeRegion, type HslColor } from './editSettings';
import { ANGLE_SLIDER, BASIC_SLIDERS, DETAIL_SLIDERS, EFFECTS_SLIDERS, formatSliderValue, gradeSliderDef, GRADING_SLIDERS, hslSliderDef, type HslProp, type SliderDef } from './sliders';

/** History key for a Basic panel control. */
export type BasicHistoryKey = `basic.${BasicSliderKey | 'treatment'}`;

export const basicHistoryKey = (key: BasicSliderKey | 'treatment'): BasicHistoryKey => `basic.${key}`;

export function basicHistoryLabel(key: BasicSliderKey | 'treatment'): string {
  if (key === 'treatment') return 'Treatment';
  const def = BASIC_SLIDERS[key];
  return def.historyLabel ?? def.label;
}

function isBasicSliderKey(key: string): key is BasicSliderKey {
  return key in BASIC_SLIDERS;
}

/** "210° 40" for a wheel drag, the slider's text otherwise. */
function gradeValue(entry: HistoryEntry, first: string, prop: string | undefined): string {
  const g = entry.settings.colorGrading;
  if (first === 'blending' || first === 'balance') return formatSliderValue(GRADING_SLIDERS[first], g[first]);
  if (!GRADE_REGIONS.includes(first as GradeRegion)) return '';
  const region = first as GradeRegion;
  const w = g[region];
  if (prop === 'wheel') return `${Math.round(w.hue)}° ${Math.round(w.sat)}`;
  if (prop === 'hue' || prop === 'sat' || prop === 'lum') return formatSliderValue(gradeSliderDef(region, prop), w[prop]);
  return '';
}

function groupSliderValue(defs: Readonly<Record<string, SliderDef>>, values: object, field: string): string {
  const def = defs[field];
  const value = (values as Record<string, unknown>)[field];
  return def && typeof value === 'number' ? formatSliderValue(def, value) : '';
}

/** The value column of a History row, e.g. "+0.35", "−38" or "B&W". Empty for one-shot steps. */
export function historyEntryValue(entry: HistoryEntry): string {
  if (entry.key === 'geometry.angle') return formatSliderValue(ANGLE_SLIDER, entry.settings.geometry.angle);
  if (entry.key === 'geometry.aspect') return CROP_ASPECT_LABELS[entry.settings.geometry.aspect];
  const hsl = /^hsl\.(\w+)\.(hue|sat|lum)$/.exec(entry.key ?? '');
  if (hsl && HSL_COLORS.includes(hsl[1] as HslColor)) {
    const color = hsl[1] as HslColor;
    const prop = hsl[2] as HslProp;
    return formatSliderValue(hslSliderDef(color, prop), entry.settings.hsl[color][prop]);
  }
  const grade = /^colorGrading\.(\w+)(?:\.(\w+))?$/.exec(entry.key ?? '');
  if (grade) return gradeValue(entry, grade[1] ?? '', grade[2]);
  const group = /^(detail|effects)\.(\w+)$/.exec(entry.key ?? '');
  if (group) return groupSliderValue(group[1] === 'detail' ? DETAIL_SLIDERS : EFFECTS_SLIDERS, group[1] === 'detail' ? entry.settings.detail : entry.settings.effects, group[2] ?? '');
  if (!entry.key?.startsWith('basic.')) return '';
  const field = entry.key.slice('basic.'.length);
  if (field === 'treatment') return entry.settings.basic.treatment === 'bw' ? 'B&W' : 'Color';
  if (!isBasicSliderKey(field)) return '';
  return formatSliderValue(BASIC_SLIDERS[field], entry.settings.basic[field]);
}
