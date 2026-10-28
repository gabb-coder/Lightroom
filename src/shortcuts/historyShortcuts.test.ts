import { describe, expect, it } from 'vitest';
import { matchHistoryShortcut, type KeyLike } from './historyShortcuts';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('matchHistoryShortcut', () => {
  it('uses Ctrl on Windows/Linux', () => {
    expect(matchHistoryShortcut(key('z', { ctrlKey: true }), false)).toBe('undo');
    expect(matchHistoryShortcut(key('Z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo');
    expect(matchHistoryShortcut(key('z', { metaKey: true }), false)).toBeNull();
  });

  it('uses Cmd on macOS', () => {
    expect(matchHistoryShortcut(key('z', { metaKey: true }), true)).toBe('undo');
    expect(matchHistoryShortcut(key('z', { metaKey: true, shiftKey: true }), true)).toBe('redo');
    expect(matchHistoryShortcut(key('z', { ctrlKey: true }), true)).toBeNull();
  });

  it('ignores other keys and Alt combinations', () => {
    expect(matchHistoryShortcut(key('z'), false)).toBeNull();
    expect(matchHistoryShortcut(key('y', { ctrlKey: true }), false)).toBeNull();
    expect(matchHistoryShortcut(key('z', { ctrlKey: true, altKey: true }), false)).toBeNull();
  });
});
