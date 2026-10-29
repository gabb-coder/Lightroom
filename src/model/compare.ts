import { defaultEditSettings, type EditSettings } from './editSettings';

/** Structural equality for plain JSON values (settings, history entries). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const DEFAULTS = defaultEditSettings();

/** True when a photo has any adjustment (drives the "edited" badge). */
export function isEdited(settings: EditSettings): boolean {
  return !jsonEqual(settings, DEFAULTS);
}
