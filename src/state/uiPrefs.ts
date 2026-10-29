/**
 * Per-browser UI conveniences (open module, selected photo, thumbnail size).
 * Not user data: storage can be unavailable (private mode), so every access
 * is guarded and the app works without it.
 */
const KEY = 'photo-editor:ui';

export interface UiPrefs {
  module?: string;
  /** Last-used export settings (validated on read). */
  exportOptions?: Record<string, unknown>;
  selectedId?: string;
  thumbSize?: number;
  /** Panels last ticked in the Copy / Sync settings dialog. */
  copyPanels?: string[];
}

export function readUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as UiPrefs) : {};
  } catch {
    return {};
  }
}

export function writeUiPrefs(patch: UiPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readUiPrefs(), ...patch }));
  } catch {
    // Storage unavailable: preferences just won't survive a reload.
  }
}
