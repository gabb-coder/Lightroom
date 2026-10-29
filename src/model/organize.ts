import type { ColorLabel, Flag, PhotoRecord } from '../db/db';

/** Color labels in design order, with their swatch colors (design/Kit.dc.html). */
export const COLOR_LABELS: readonly { id: ColorLabel; name: string; color: string }[] = [
  { id: 'red', name: 'Red', color: '#d9534f' },
  { id: 'yellow', name: 'Yellow', color: '#e3c84a' },
  { id: 'green', name: 'Green', color: '#5cb85c' },
  { id: 'blue', name: 'Blue', color: '#4a7fe0' },
  { id: 'purple', name: 'Purple', color: '#9b6be0' },
];

export const labelInfo = (id: ColorLabel) => COLOR_LABELS.find((l) => l.id === id);

export type FlagFilter = 'all' | 'picks' | 'unflagged' | 'rejected';
export type SortKey = 'captureDate' | 'importOrder' | 'fileName' | 'rating';

export interface LibraryFilter {
  flag: FlagFilter;
  /** 0 = any rating. */
  minRating: number;
  label: ColorLabel | null;
  /** Case-insensitive substring of the file name. */
  search: string;
}

export const EMPTY_FILTER: LibraryFilter = { flag: 'all', minRating: 0, label: null, search: '' };

export function isFilterActive(f: LibraryFilter): boolean {
  return f.flag !== 'all' || f.minRating > 0 || f.label !== null || f.search.trim() !== '';
}

function matchesFlag(flag: Flag | null, filter: FlagFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'picks':
      return flag === 'pick';
    case 'unflagged':
      return flag === null;
    case 'rejected':
      return flag === 'reject';
  }
}

/** Photos matching every active filter (they combine with AND). */
export function filterPhotos(photos: readonly PhotoRecord[], f: LibraryFilter): PhotoRecord[] {
  const search = f.search.trim().toLowerCase();
  return photos.filter(
    (p) =>
      matchesFlag(p.flag, f.flag) &&
      p.rating >= f.minRating &&
      (f.label === null || p.colorLabel === f.label) &&
      (search === '' || p.fileName.toLowerCase().includes(search)),
  );
}

const byImport = (a: PhotoRecord, b: PhotoRecord) => a.importIndex - b.importIndex;
const fileNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const COMPARATORS: Record<SortKey, (a: PhotoRecord, b: PhotoRecord) => number> = {
  captureDate: (a, b) => a.captureDate - b.captureDate || byImport(a, b),
  importOrder: byImport,
  fileName: (a, b) => fileNameCollator.compare(a.fileName, b.fileName) || byImport(a, b),
  // Highest rated first.
  rating: (a, b) => b.rating - a.rating || byImport(a, b),
};

/** Sorted copy; ties fall back to import order so the result is stable. */
export function sortPhotos(photos: readonly PhotoRecord[], key: SortKey): PhotoRecord[] {
  return [...photos].sort(COMPARATORS[key]);
}

/** Develop filmstrip quick filter (design/Develop.dc.html), applied on top of the library list. */
export type FilmstripFilter = 'all' | 'picks' | 'rated3' | 'edited';

export const FILMSTRIP_FILTERS: readonly { id: FilmstripFilter; label: string }[] = [
  { id: 'all', label: 'All photos' },
  { id: 'picks', label: 'Picks' },
  { id: 'rated3', label: '3 stars and up' },
  { id: 'edited', label: 'Edited' },
];

export function filmstripFilter(photos: readonly PhotoRecord[], f: FilmstripFilter): readonly PhotoRecord[] {
  switch (f) {
    case 'all':
      return photos;
    case 'picks':
      return photos.filter((p) => p.flag === 'pick');
    case 'rated3':
      return photos.filter((p) => p.rating >= 3);
    case 'edited':
      return photos.filter((p) => p.edited);
  }
}
