export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Ctrl+Z / Ctrl+Shift+Z on Windows and Linux, Cmd+Z / Cmd+Shift+Z on macOS.
 * The other modifier must not be held, so Ctrl+Z on a Mac does nothing.
 */
export function matchHistoryShortcut(e: KeyLike, mac: boolean): 'undo' | 'redo' | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod || e.altKey || e.key.toLowerCase() !== 'z') return null;
  return e.shiftKey ? 'redo' : 'undo';
}
