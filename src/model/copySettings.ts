import { orientedSize } from '../engine/geometry';
import { cropForAspect, fitCropToAngle, type Size } from './crop';
import type { EditSettings, Geometry } from './editSettings';

/**
 * Copy / paste / sync settings (M10). Settings are grouped by Develop panel;
 * the Copy and Sync dialogs choose which panels to take, and pasting replaces
 * exactly those panels on the target photo.
 */

export type SettingsPanel = 'basic' | 'curve' | 'hsl' | 'colorGrading' | 'detail' | 'effects' | 'masks' | 'geometry';

/** Panels in design order, with their Develop panel titles. */
export const SETTINGS_PANELS: readonly { id: SettingsPanel; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'curve', label: 'Tone curve' },
  { id: 'hsl', label: 'Color mixer' },
  { id: 'colorGrading', label: 'Color grading' },
  { id: 'detail', label: 'Detail' },
  { id: 'effects', label: 'Effects' },
  { id: 'masks', label: 'Masks' },
  { id: 'geometry', label: 'Crop and geometry' },
];

/** Everything except masks and crop, like Lightroom: those are placed for one picture. */
export const DEFAULT_COPY_PANELS: readonly SettingsPanel[] = ['basic', 'curve', 'hsl', 'colorGrading', 'detail', 'effects'];

/** Settings taken from one photo, to paste onto others. */
export interface SettingsClipboard {
  settings: EditSettings;
  panels: readonly SettingsPanel[];
  /** File name of the photo they came from. */
  from: string;
}

/** Keeps panels in design order and drops unknown or repeated ids. */
export function normalizePanels(panels: readonly string[]): SettingsPanel[] {
  return SETTINGS_PANELS.map((p) => p.id).filter((id) => panels.includes(id));
}

/**
 * The source's crop and geometry, adapted to a target photo of another size:
 * an aspect preset is re-fitted to the target (largest crop of that ratio,
 * centered where the source's was); any other crop keeps its normalized
 * position and is pulled inside the straightened image.
 */
export function geometryForTarget(source: Geometry, target: Size): Geometry {
  const o = orientedSize(target, source.rotation);
  if (source.aspect !== 'original' && source.aspect !== 'custom') {
    return { ...source, cropRect: cropForAspect(source, source.aspect, o) };
  }
  return { ...source, cropRect: fitCropToAngle(source.cropRect, source.angle, o) };
}

/** Target settings with the chosen panels replaced by the source's. */
export function pasteSettings(target: EditSettings, source: EditSettings, panels: readonly SettingsPanel[], targetSize: Size): EditSettings {
  const out: EditSettings = structuredClone(target);
  for (const panel of panels) {
    if (panel === 'geometry') out.geometry = geometryForTarget(structuredClone(source.geometry), targetSize);
    else Object.assign(out, { [panel]: structuredClone(source[panel]) });
  }
  return out;
}
