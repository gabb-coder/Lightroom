import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from './editSettings';
import { migrateHistorySharpenDefault, migrateSharpenDefault } from './migrate';

const withSharpen = (sharpAmount: number, sharpRadius: number) => ({ ...defaultEditSettings(), detail: { sharpAmount, sharpRadius } });

describe('sharpening default migration (catalog v3)', () => {
  it('resets the old untouched default (40 at radius 1) to 0', () => {
    expect(migrateSharpenDefault(withSharpen(40, 1)).detail).toEqual({ sharpAmount: 0, sharpRadius: 1 });
  });

  it('keeps any other sharpening values', () => {
    expect(migrateSharpenDefault(withSharpen(60, 1)).detail.sharpAmount).toBe(60);
    expect(migrateSharpenDefault(withSharpen(40, 1.5)).detail.sharpAmount).toBe(40);
  });

  it('leaves malformed data for parseEditSettings to handle', () => {
    expect(migrateSharpenDefault(null)).toBeNull();
    expect(migrateSharpenDefault({ detail: 'x' })).toEqual({ detail: 'x' });
  });

  it('migrates every history snapshot and keeps labels, keys and cursor', () => {
    const history = {
      cursor: 1,
      entries: [
        { label: 'Import', key: null, settings: withSharpen(40, 1) },
        { label: 'Exposure', key: 'basic.exposure', settings: { ...withSharpen(40, 1), basic: { ...defaultEditSettings().basic, exposure: 1 } } },
      ],
    };
    const migrated = migrateHistorySharpenDefault(history);
    expect(migrated.cursor).toBe(1);
    expect(migrated.entries.map((e) => [e.label, e.key, e.settings.detail.sharpAmount])).toEqual([
      ['Import', null, 0],
      ['Exposure', 'basic.exposure', 0],
    ]);
    expect(migrated.entries[1]?.settings.basic.exposure).toBe(1);
  });
});
