import { describe, expect, it } from 'vitest';
import { defaultEditSettings, type EditSettings } from './editSettings';
import {
  canRedo,
  canUndo,
  createHistory,
  currentSettings,
  goToHistory,
  parseStoredHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from './history';

function withBasic(base: EditSettings, patch: Partial<EditSettings['basic']>): EditSettings {
  return { ...base, basic: { ...base.basic, ...patch } };
}

/** Applies a slider edit the way the store does. */
function edit(h: History, key: keyof EditSettings['basic'], value: number | string): History {
  const settings = withBasic(currentSettings(h), { [key]: value });
  return pushHistory(h, { label: String(key), key: `basic.${String(key)}`, settings });
}

describe('history', () => {
  it('starts with a single Import step that cannot be undone', () => {
    const h = createHistory(defaultEditSettings());
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0]?.label).toBe('Import');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
  });

  it('undo and redo restore the exact settings objects', () => {
    let h = createHistory(defaultEditSettings());
    h = edit(h, 'exposure', 0.35);
    h = edit(h, 'contrast', 12);
    h = edit(h, 'highlights', -38);
    const snapshots = h.entries.map((e) => e.settings);
    const frozen = JSON.stringify(snapshots);

    h = undo(h);
    expect(currentSettings(h)).toBe(snapshots[2]);
    h = undo(h);
    h = undo(h);
    expect(currentSettings(h)).toBe(snapshots[0]);
    expect(currentSettings(h)).toEqual(defaultEditSettings());
    expect(undo(h)).toBe(h);

    h = redo(h);
    expect(currentSettings(h).basic.exposure).toBe(0.35);
    h = redo(h);
    h = redo(h);
    expect(currentSettings(h)).toBe(snapshots[3]);
    expect(currentSettings(h)).toEqual(withBasic(defaultEditSettings(), { exposure: 0.35, contrast: 12, highlights: -38 }));
    expect(redo(h)).toBe(h);
    // Undo/redo never mutate stored snapshots.
    expect(JSON.stringify(h.entries.map((e) => e.settings))).toBe(frozen);
  });

  it('merges consecutive edits of the same slider into one step', () => {
    let h = createHistory(defaultEditSettings());
    for (const v of [0.05, 0.2, 0.45, 0.6]) h = edit(h, 'exposure', v);
    expect(h.entries).toHaveLength(2);
    expect(currentSettings(h).basic.exposure).toBe(0.6);
    h = edit(h, 'contrast', 10);
    h = edit(h, 'exposure', 0.7);
    expect(h.entries.map((e) => e.key)).toEqual([null, 'basic.exposure', 'basic.contrast', 'basic.exposure']);
  });

  it('a new edit after undo discards the undone steps and does not merge into the past', () => {
    let h = createHistory(defaultEditSettings());
    h = edit(h, 'exposure', 0.5);
    h = edit(h, 'contrast', 20);
    h = edit(h, 'shadows', 30);
    h = undo(undo(h)); // back to the exposure step
    h = edit(h, 'exposure', 1); // same key as the cursor's step, but not at the tip
    expect(h.entries.map((e) => e.key)).toEqual([null, 'basic.exposure', 'basic.exposure']);
    expect(h.entries[1]?.settings.basic.exposure).toBe(0.5);
    expect(currentSettings(h).basic.exposure).toBe(1);
    expect(currentSettings(h).basic.contrast).toBe(0);
    expect(canRedo(h)).toBe(false);
  });

  it('one-shot steps (preset, reset) never merge', () => {
    let h = createHistory(defaultEditSettings());
    h = pushHistory(h, { label: 'Reset all', key: null, settings: defaultEditSettings() });
    h = pushHistory(h, { label: 'Reset all', key: null, settings: defaultEditSettings() });
    expect(h.entries).toHaveLength(3);
  });

  it('jumps to any step', () => {
    let h = createHistory(defaultEditSettings());
    h = edit(h, 'exposure', 0.5);
    h = edit(h, 'contrast', 20);
    h = goToHistory(h, 0);
    expect(currentSettings(h)).toEqual(defaultEditSettings());
    expect(goToHistory(h, 7)).toBe(h);
    h = goToHistory(h, 2);
    expect(currentSettings(h).basic.contrast).toBe(20);
  });
});

describe('parseStoredHistory', () => {
  it('round-trips a stored history exactly', () => {
    let h = createHistory(defaultEditSettings());
    h = edit(h, 'exposure', 0.35);
    h = edit(h, 'treatment', 'bw');
    h = undo(h);
    expect(parseStoredHistory(JSON.parse(JSON.stringify(h)))).toEqual(h);
  });

  it('drops bad entries, validates settings and clamps the cursor', () => {
    const parsed = parseStoredHistory({
      entries: [
        { label: 'Import', key: null, settings: {} },
        'junk',
        { label: 'Exposure', key: 'basic.exposure', settings: { basic: { exposure: 99 } } },
      ],
      cursor: 12,
    });
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.cursor).toBe(1);
    expect(currentSettings(parsed).basic.exposure).toBe(5);
  });

  it('falls back to a fresh history', () => {
    for (const raw of [null, 3, { entries: [] }, { entries: 'x' }]) {
      const h = parseStoredHistory(raw);
      expect(h.entries).toHaveLength(1);
      expect(currentSettings(h)).toEqual(defaultEditSettings());
    }
  });
});
