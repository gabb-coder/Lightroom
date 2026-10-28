import type { BasicSliderKey } from './editSettings';
import type { HistoryEntry } from './history';
import { BASIC_SLIDERS, formatSliderValue } from './sliders';

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
  if (!entry.key?.startsWith('basic.')) return '';
  const field = entry.key.slice('basic.'.length);
  if (field === 'treatment') return entry.settings.basic.treatment === 'bw' ? 'B&W' : 'Color';
  if (!isBasicSliderKey(field)) return '';
  return formatSliderValue(BASIC_SLIDERS[field], entry.settings.basic[field]);
}
