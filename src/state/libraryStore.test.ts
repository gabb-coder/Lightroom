import { describe, expect, it } from 'vitest';
import type { PhotoRecord } from '../db/db';
import { latestBatchId, neighborId, visiblePhotos } from './libraryStore';

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
