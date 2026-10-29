/**
 * Catalog migrations for stored edit data (applied by db.ts upgrades).
 *
 * v3 (M9): before sharpening existed, the default Amount was 40 and every
 * stored snapshot carried it, although it had no effect. The default is now
 * 0, so stored "40 at radius 1" (the old untouched default) becomes 0 and
 * those photos keep rendering as they did.
 */

interface WithDetail {
  detail?: { sharpAmount?: unknown; sharpRadius?: unknown };
}

const OLD_DEFAULT_AMOUNT = 40;
const OLD_DEFAULT_RADIUS = 1;

/** Returns settings with the old untouched sharpening default reset to 0 (other values unchanged). */
export function migrateSharpenDefault<T>(settings: T): T {
  if (typeof settings !== 'object' || settings === null) return settings;
  const detail = (settings as WithDetail).detail;
  if (!detail || detail.sharpAmount !== OLD_DEFAULT_AMOUNT || detail.sharpRadius !== OLD_DEFAULT_RADIUS) return settings;
  return { ...settings, detail: { ...detail, sharpAmount: 0 } };
}

/** Applies migrateSharpenDefault to every snapshot of a stored history. */
export function migrateHistorySharpenDefault<T>(history: T): T {
  if (typeof history !== 'object' || history === null) return history;
  const entries = (history as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return history;
  return {
    ...history,
    entries: entries.map((e: unknown) =>
      typeof e === 'object' && e !== null ? { ...e, settings: migrateSharpenDefault((e as { settings?: unknown }).settings) } : e,
    ),
  };
}
