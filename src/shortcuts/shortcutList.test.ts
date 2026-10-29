import { describe, expect, it } from 'vitest';
import globalSource from './useGlobalShortcuts.ts?raw';
import organizeSource from './organizeShortcuts.ts?raw';
import historySource from './historyShortcuts.ts?raw';
import { keyLabel, MOD, SHORTCUT_GROUPS } from './shortcutList';

const listed = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts);
const listedKeys = new Set(listed.flatMap((s) => [s.keys, ...(s.alternatives ?? [])].flat()));
const mentioned = (word: string) => listed.some((s) => s.action.includes(word));

/** How a key value from the handlers is written in the list. */
const LABELS: Readonly<Record<string, string>> = { Escape: 'Esc', ArrowLeft: '←', ArrowRight: '→' };

/** Keys compared in the handler sources: `key === 'x'`, `key.toLowerCase() === 'x'`, `case 'x':`. */
function handledKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const m of source.matchAll(/key(?:\.toLowerCase\(\))? === (?:'([^']+)'|"([^"]+)")/g)) keys.add(m[1] ?? m[2] ?? '');
  for (const m of source.matchAll(/case '([^']+)':/g)) keys.add(m[1] ?? '');
  return [...keys];
}

describe('keyboard shortcuts list', () => {
  it('lists every key the shortcut handlers react to', () => {
    const keys = [...handledKeys(globalSource), ...handledKeys(organizeSource), ...handledKeys(historySource)];
    expect(keys.length).toBeGreaterThan(15); // the parsing found the handlers
    for (const key of keys) {
      const label = LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
      // Enter only confirms the crop, which its row says.
      const ok = listedKeys.has(label) || (key === 'Enter' && mentioned('Enter'));
      expect(ok, `"${key}" is handled but not listed`).toBe(true);
    }
    // The module keys, the before/after key and the rating digits.
    for (const k of ['G', 'D', '\\', '1–5', '0']) expect(listedKeys.has(k), k).toBe(true);
  });

  it('shows Ctrl or ⌘ for the command key', () => {
    expect(keyLabel(MOD, false)).toBe('Ctrl');
    expect(keyLabel(MOD, true)).toBe('⌘');
    expect(keyLabel('Z', true)).toBe('Z');
  });

  it('has no duplicate actions', () => {
    const actions = listed.map((s) => s.action);
    expect(new Set(actions).size).toBe(actions.length);
  });
});
