import { describe, expect, it } from 'vitest';
import { BackupFormatError, extensionForType, parseBackupPhoto, parseManifest, restoredImportIndex } from './backup';
import { defaultEditSettings } from './editSettings';

const photo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  fileName: `${id}.jpg`,
  fileType: 'image/jpeg',
  size: 10,
  width: 30,
  height: 20,
  captureDate: 5,
  rating: 9,
  flag: 'pick',
  colorLabel: 'teal',
  importIndex: 3,
  batchId: 'b',
  thumbVersion: 7,
  keywords: [' Beach ', 4, ''],
  ...extra,
});

describe('backup manifest', () => {
  it('rejects files that are not backups, or from a newer version', () => {
    expect(() => parseManifest({ format: 'something' })).toThrow(BackupFormatError);
    expect(() => parseManifest({ format: 'darkroom-backup', version: 99 })).toThrow('newer version');
  });

  it('validates photo rows like the database does', () => {
    const p = parseBackupPhoto(photo('a'));
    expect(p).toMatchObject({ id: 'a', rating: 5, flag: 'pick', colorLabel: null, keywords: ['Beach'], thumbVersion: 0 });
    expect(parseBackupPhoto({ id: 'x', fileName: 'x.jpg', width: 0, height: 10 })).toBeNull();
    expect(parseBackupPhoto(photo('c', { masterId: 'a' }))).toMatchObject({ masterId: 'a', copyName: 'Copy' });
  });

  it('keeps photos with an original (or virtual copies), with validated histories', () => {
    const m = parseManifest({
      format: 'darkroom-backup',
      version: 1,
      photos: [
        { photo: photo('a'), original: 'originals/a.jpg', history: { entries: [{ label: 'Import', settings: { basic: { exposure: 99 } } }], cursor: 0 } },
        { photo: photo('b'), original: null },
        { photo: photo('c', { masterId: 'a', copyName: 'Copy 1' }), original: 'ignored' },
        'junk',
      ],
      collections: [{ id: 'k', name: '  Trip  ', photoIds: ['a', 'a', 7, 'c'] }, { id: '', name: 'x' }],
      snapshots: [
        { id: 's', photoId: 'a', name: 'Moody', settings: defaultEditSettings() },
        { id: 't', photoId: 'nope', name: 'Lost', settings: {} },
      ],
      presets: [{ id: 'p', name: 'Mine', settings: { basic: { contrast: 20 } } }],
      exportPresets: [{ id: 'e', name: 'Web', options: { quality: 500 } }],
    });
    expect(m.photos.map((p) => [p.photo.id, p.original])).toEqual([
      ['a', 'originals/a.jpg'],
      ['c', null],
    ]);
    expect(m.photos[0]?.history?.entries[0]?.settings.basic.exposure).toBe(5); // clamped
    expect(m.collections).toEqual([{ id: 'k', name: 'Trip', photoIds: ['a', 'c'], createdAt: 0 }]);
    expect(m.snapshots.map((s) => s.id)).toEqual(['s']);
    expect(m.presets[0]?.settings.basic.contrast).toBe(20);
    expect(m.exportPresets[0]?.options.quality).toBe(100);
  });

  it('appends restored photos after the catalog, keeping their order (and copies’ fractions)', () => {
    expect(restoredImportIndex(4, 2, 0)).toBe(4); // empty catalog: unchanged
    expect(restoredImportIndex(2, 2, 10)).toBe(10);
    expect(restoredImportIndex(4.001, 2, 10)).toBeCloseTo(12.001, 9);
  });

  it('picks file extensions from the type', () => {
    expect(extensionForType('image/png')).toBe('png');
    expect(extensionForType('image/jpeg')).toBe('jpg');
  });
});
