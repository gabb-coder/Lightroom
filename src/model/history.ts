import { defaultEditSettings, type EditSettings } from './editSettings';
import { parseEditSettings } from './validate';

/**
 * Undo history: a list of settings snapshots plus a cursor. The canvas always
 * shows entries[cursor].settings.
 */
export interface HistoryEntry {
  /** Shown in the History panel, e.g. "Exposure" or "Preset: Faded". */
  label: string;
  /**
   * What changed, e.g. "basic.exposure". Consecutive edits with the same key
   * merge into one entry. Null for one-shot steps (import, preset, reset).
   */
  key: string | null;
  settings: EditSettings;
}

export interface History {
  entries: readonly HistoryEntry[];
  cursor: number;
}

export function createHistory(settings: EditSettings, label = 'Import'): History {
  return { entries: [{ label, key: null, settings }], cursor: 0 };
}

export function currentSettings(history: History): EditSettings {
  const entry = history.entries[history.cursor];
  if (!entry) throw new Error('History cursor out of range');
  return entry.settings;
}

/**
 * Records a new step. Steps after the cursor (undone ones) are discarded. If
 * the cursor is at the newest step and that step has the same key, the new
 * settings replace it instead (a drag, scrub or repeated edit of one slider is
 * one step). The very first entry is never replaced.
 */
export function pushHistory(history: History, entry: HistoryEntry): History {
  const atTip = history.cursor === history.entries.length - 1;
  const kept = history.entries.slice(0, history.cursor + 1);
  const last = kept[kept.length - 1];
  if (atTip && entry.key !== null && last?.key === entry.key && kept.length > 1) {
    kept[kept.length - 1] = entry;
  } else {
    kept.push(entry);
  }
  return { entries: kept, cursor: kept.length - 1 };
}

export function canUndo(history: History): boolean {
  return history.cursor > 0;
}

export function canRedo(history: History): boolean {
  return history.cursor < history.entries.length - 1;
}

export function undo(history: History): History {
  return canUndo(history) ? { ...history, cursor: history.cursor - 1 } : history;
}

export function redo(history: History): History {
  return canRedo(history) ? { ...history, cursor: history.cursor + 1 } : history;
}

/** Jumps to a step (clicking an entry in the History panel). */
export function goToHistory(history: History, index: number): History {
  if (index < 0 || index >= history.entries.length || index === history.cursor) return history;
  return { ...history, cursor: index };
}

/**
 * Rebuilds a history read back from storage: every snapshot is validated, bad
 * entries are dropped and the cursor is clamped. Falls back to a fresh history.
 */
export function parseStoredHistory(raw: unknown): History {
  if (typeof raw !== 'object' || raw === null) return createHistory(defaultEditSettings());
  const r = raw as { entries?: unknown; cursor?: unknown };
  const entries: HistoryEntry[] = [];
  if (Array.isArray(r.entries)) {
    for (const e of r.entries as unknown[]) {
      if (typeof e !== 'object' || e === null) continue;
      const entry = e as { label?: unknown; key?: unknown; settings?: unknown };
      if (typeof entry.label !== 'string') continue;
      entries.push({
        label: entry.label,
        key: typeof entry.key === 'string' ? entry.key : null,
        settings: parseEditSettings(entry.settings),
      });
    }
  }
  if (entries.length === 0) return createHistory(defaultEditSettings());
  const cursor = typeof r.cursor === 'number' && Number.isInteger(r.cursor) ? Math.min(Math.max(r.cursor, 0), entries.length - 1) : entries.length - 1;
  return { entries, cursor };
}
