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
import { HSL_COLORS, type HslColor } from './editSettings';
import { ANGLE_SLIDER, BASIC_SLIDERS, formatSliderValue, hslSliderDef, type HslProp } from './sliders';

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
  if (!entry.key?.startsWith('basic.')) return '';
  const field = entry.key.slice('basic.'.length);
  if (field === 'treatment') return entry.settings.basic.treatment === 'bw' ? 'B&W' : 'Color';
  if (!isBasicSliderKey(field)) return '';
  return formatSliderValue(BASIC_SLIDERS[field], entry.settings.basic[field]);
}
