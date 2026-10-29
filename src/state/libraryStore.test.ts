import { describe, expect, it } from 'vitest';
import type { PhotoRecord } from '../db/db';
import { latestBatchId, neighborId, selectLibraryList, useLibraryStore, visiblePhotos } from './libraryStore';
import { beforeEach } from 'vitest';

const photo = (id: string, batchId: string, importIndex: number): PhotoRecord => ({
  id,
  fileName: `${id}.jpg`,
  fileType: 'image/jpeg',
  size: 1,
  width: 3,
  height: 2,
  captureDate: 0,
  captureDateFromExif: false,
  rating: 0,
  flag: null,
  colorLabel: null,
  importedAt: 0,
  importIndex,
  batchId,
  edited: false,
  thumbVersion: 0,
});

const photos = [photo('a', 'b1', 0), photo('b', 'b1', 1), photo('c', 'b2', 2), photo('d', 'b2', 3)];

describe('library selectors', () => {
  it('"Previous import" shows only the latest batch', () => {
    expect(latestBatchId(photos)).toBe('b2');
    expect(visiblePhotos(photos, 'previous').map((p) => p.id)).toEqual(['c', 'd']);
    expect(visiblePhotos(photos, 'all')).toBe(photos);
    expect(latestBatchId([])).toBeNull();
  });

  it('moves to the previous/next photo, clamped at the ends', () => {
    expect(neighborId(photos, 'b', 1)).toBe('c');
    expect(neighborId(photos, 'b', -1)).toBe('a');
    expect(neighborId(photos, 'a', -1)).toBe('a');
    expect(neighborId(photos, 'd', 1)).toBe('d');
    expect(neighborId(photos, null, 1)).toBe('a');
    expect(neighborId([], 'a', 1)).toBeNull();
  });
});

describe('library store', () => {
  const store = () => useLibraryStore.getState();
  beforeEach(() => {
    useLibraryStore.setState({ photos: [], loaded: false });
    store().setPhotos(photos);
    store().clearFilter();
    store().select(null);
    store().setView('all');
  });

  it('memoizes the filtered list until an input changes', () => {
    const first = selectLibraryList(store());
    expect(selectLibraryList(store())).toBe(first);
    store().setSort('rating');
    expect(selectLibraryList(store())).not.toBe(first);
  });

  it('prunes the selection when a filter hides selected photos', () => {
    store().select('a');
    store().clickPhoto('c', { toggle: true, range: false }, ['a', 'b', 'c', 'd']);
    expect(store().selection.ids).toEqual(['a', 'c']);
    store().setFilter({ search: 'c' });
    expect(store().selection.ids).toEqual(['c']);
    expect(store().selectedId).toBe('c');
  });

  it('keeps the selection when a photo changes but is still in the catalog', () => {
    store().select('b');
    store().setPhotos(photos.map((p) => (p.id === 'b' ? { ...p, rating: 3 } : p)));
    expect(store().selectedId).toBe('b');
    store().setPhotos(photos.filter((p) => p.id !== 'b'));
    expect(store().selectedId).toBeNull();
  });
});
