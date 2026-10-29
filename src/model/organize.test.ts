import { describe, expect, it } from 'vitest';
import type { PhotoRecord } from '../db/db';
import { allKeywords, distinctValues, EMPTY_FILTER, filmstripFilter, filterPhotos, isFilterActive, metadataFilterCount, sortPhotos, type LibraryFilter } from './organize';

let seq = 0;
function photo(p: Partial<PhotoRecord> & { id: string }): PhotoRecord {
  return {
    fileName: `${p.id}.jpg`,
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
    importIndex: seq++,
    batchId: 'b',
    edited: false,
    thumbVersion: 0,
    ...p,
  };
}

/** A small catalog covering every combination the filter bar can express. */
const catalog = [
  photo({ id: 'a', fileName: 'IMG_0418.JPG', rating: 5, flag: 'pick', colorLabel: 'red', captureDate: 300 }),
  photo({ id: 'b', fileName: 'IMG_0419.JPG', rating: 3, flag: 'pick', colorLabel: 'green', captureDate: 100 }),
  photo({ id: 'c', fileName: 'beach-2.png', rating: 3, flag: null, colorLabel: 'red', captureDate: 200 }),
  photo({ id: 'd', fileName: 'beach-10.png', rating: 1, flag: 'reject', colorLabel: null, captureDate: 200 }),
  photo({ id: 'e', fileName: 'IMG_0420.JPG', rating: 0, flag: null, colorLabel: null, captureDate: 50, edited: true }),
  photo({ id: 'f', fileName: 'Sunset.jpg', rating: 4, flag: 'reject', colorLabel: 'red', captureDate: 400 }),
];

const ids = (list: readonly PhotoRecord[]) => list.map((p) => p.id);
const run = (f: Partial<LibraryFilter>) => ids(filterPhotos(catalog, { ...EMPTY_FILTER, ...f }));

describe('filterPhotos', () => {
  it('shows everything with no filter', () => {
    expect(run({})).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
  });

  it('filters by flag', () => {
    expect(run({ flag: 'picks' })).toEqual(['a', 'b']);
    expect(run({ flag: 'unflagged' })).toEqual(['c', 'e']);
    expect(run({ flag: 'rejected' })).toEqual(['d', 'f']);
  });

  it('filters by minimum rating, label and file name (case-insensitive)', () => {
    expect(run({ minRating: 3 })).toEqual(['a', 'b', 'c', 'f']);
    expect(run({ minRating: 5 })).toEqual(['a']);
    expect(run({ label: 'red' })).toEqual(['a', 'c', 'f']);
    expect(run({ search: 'img_04' })).toEqual(['a', 'b', 'e']);
    expect(run({ search: '  BEACH ' })).toEqual(['c', 'd']);
  });

  it('combines filters with AND', () => {
    expect(run({ flag: 'picks', minRating: 4 })).toEqual(['a']);
    expect(run({ label: 'red', minRating: 3, flag: 'unflagged' })).toEqual(['c']);
    expect(run({ label: 'red', flag: 'rejected' })).toEqual(['f']);
    expect(run({ label: 'red', flag: 'rejected', search: 'img' })).toEqual([]);
    expect(run({ minRating: 1, flag: 'rejected', search: 'beach' })).toEqual(['d']);
    expect(run({ label: 'green', minRating: 3, flag: 'picks', search: '0419' })).toEqual(['b']);
  });
});

describe('sortPhotos', () => {
  it('sorts by capture time, falling back to import order on ties', () => {
    expect(ids(sortPhotos(catalog, 'captureDate'))).toEqual(['e', 'b', 'c', 'd', 'a', 'f']);
  });

  it('sorts file names naturally (2 before 10) and case-insensitively', () => {
    expect(ids(sortPhotos(catalog, 'fileName'))).toEqual(['c', 'd', 'a', 'b', 'e', 'f']);
  });

  it('sorts by rating, highest first, and by import order', () => {
    expect(ids(sortPhotos(catalog, 'rating'))).toEqual(['a', 'f', 'b', 'c', 'd', 'e']);
    expect(ids(sortPhotos([...catalog].reverse(), 'importOrder'))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('does not mutate its input', () => {
    const before = ids(catalog);
    sortPhotos(catalog, 'rating');
    expect(ids(catalog)).toEqual(before);
  });
});

describe('filmstrip quick filter', () => {
  it('narrows the list', () => {
    expect(ids(filmstripFilter(catalog, 'picks'))).toEqual(['a', 'b']);
    expect(ids(filmstripFilter(catalog, 'rated3'))).toEqual(['a', 'b', 'c', 'f']);
    expect(ids(filmstripFilter(catalog, 'edited'))).toEqual(['e']);
    expect(filmstripFilter(catalog, 'all')).toBe(catalog);
  });
});

describe('metadata filters and search (M11)', () => {
  const exif = (camera: string | null, lens: string | null, iso: number | null) => ({ camera, lens, iso, exposureTime: null, fNumber: null, focalLength: null });
  const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
  const shots = [
    photo({ id: 'r5', fileName: 'A.jpg', exif: exif('Canon EOS R5', 'RF24-105mm F4 L IS USM', 100), captureDate: day(2023, 6, 14), keywords: ['Beach', 'Family'] }),
    photo({ id: 'r5b', fileName: 'B.jpg', exif: exif('Canon EOS R5', 'RF50mm F1.8 STM', 3200), captureDate: day(2023, 6, 15, 23), keywords: ['night'] }),
    photo({ id: 'z6', fileName: 'C.jpg', exif: exif('NIKON Z 6', null, 800), captureDate: day(2023, 6, 16, 0) }),
    photo({ id: 'png', fileName: 'beach.png', captureDate: day(2024, 1, 1) }),
  ];
  const run2 = (f: Partial<LibraryFilter>) => ids(filterPhotos(shots, { ...EMPTY_FILTER, ...f }));

  it('camera and lens match exactly', () => {
    expect(run2({ camera: 'Canon EOS R5' })).toEqual(['r5', 'r5b']);
    expect(run2({ lens: 'RF50mm F1.8 STM' })).toEqual(['r5b']);
  });

  it('ISO range is inclusive and excludes photos without ISO', () => {
    expect(run2({ isoMin: 800 })).toEqual(['r5b', 'z6']);
    expect(run2({ isoMax: 800 })).toEqual(['r5', 'z6']);
    expect(run2({ isoMin: 100, isoMax: 100 })).toEqual(['r5']);
  });

  it('capture date range covers whole local days', () => {
    expect(run2({ dateFrom: '2023-06-15', dateTo: '2023-06-15' })).toEqual(['r5b']);
    expect(run2({ dateFrom: '2023-06-15' })).toEqual(['r5b', 'z6', 'png']);
    expect(run2({ dateTo: '2023-06-15' })).toEqual(['r5', 'r5b']);
  });

  it('keyword filter is exact and case-insensitive', () => {
    expect(run2({ keyword: 'beach' })).toEqual(['r5']);
    expect(run2({ keyword: 'bea' })).toEqual([]);
  });

  it('search matches file name, camera, lens and keywords; every word must match', () => {
    expect(run2({ search: 'beach' })).toEqual(['r5', 'png']); // keyword, file name
    expect(run2({ search: 'nikon' })).toEqual(['z6']);
    expect(run2({ search: 'rf50' })).toEqual(['r5b']);
    expect(run2({ search: 'canon night' })).toEqual(['r5b']);
    expect(run2({ search: '  CANON   family ' })).toEqual(['r5']);
  });

  it('combines with the other filters (AND) and counts as active', () => {
    expect(run2({ camera: 'Canon EOS R5', isoMin: 1000, search: 'night' })).toEqual(['r5b']);
    expect(metadataFilterCount({ ...EMPTY_FILTER, camera: 'x', isoMax: 5 })).toBe(2);
    expect(isFilterActive({ ...EMPTY_FILTER, keyword: 'x' })).toBe(true);
  });

  it('lists distinct cameras and keywords for the menus', () => {
    expect(distinctValues(shots, (p) => p.exif?.camera)).toEqual(['Canon EOS R5', 'NIKON Z 6']);
    expect(allKeywords([...shots, photo({ id: 'x', keywords: ['beach'] })])).toEqual(['Beach', 'Family', 'night']);
  });
});
