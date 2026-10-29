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
  /**
   * Words separated by spaces; each must appear (case-insensitive) in the
   * file name, camera, lens or a keyword.
   */
  search: string;
  /** Metadata filters (M11); null = any. Camera and lens match exactly. */
  camera: string | null;
  lens: string | null;
  isoMin: number | null;
  isoMax: number | null;
  /** Capture date range, local days "YYYY-MM-DD", both inclusive. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Exact keyword (case-insensitive). */
  keyword: string | null;
}

export const EMPTY_METADATA_FILTER = { camera: null, lens: null, isoMin: null, isoMax: null, dateFrom: null, dateTo: null, keyword: null } as const;

export const EMPTY_FILTER: LibraryFilter = { flag: 'all', minRating: 0, label: null, search: '', ...EMPTY_METADATA_FILTER };

/** How many metadata filters are set (shown on the "Metadata" button). */
export function metadataFilterCount(f: LibraryFilter): number {
  return (Object.keys(EMPTY_METADATA_FILTER) as (keyof typeof EMPTY_METADATA_FILTER)[]).filter((k) => f[k] !== null).length;
}

export function isFilterActive(f: LibraryFilter): boolean {
  return f.flag !== 'all' || f.minRating > 0 || f.label !== null || f.search.trim() !== '' || metadataFilterCount(f) > 0;
}

/** Local midnight of a "YYYY-MM-DD" day, or null if malformed. */
export function dayStart(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/** Local midnight of the following day. */
function dayEnd(day: string): number | null {
  const start = dayStart(day);
  if (start === null) return null;
  const d = new Date(start);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

function matchesSearch(p: PhotoRecord, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const haystack = [p.fileName, p.exif?.camera ?? '', p.exif?.lens ?? '', ...(p.keywords ?? [])].join('\n').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

function matchesMetadata(p: PhotoRecord, f: LibraryFilter, from: number | null, to: number | null): boolean {
  const iso = p.exif?.iso ?? null;
  if (f.camera !== null && p.exif?.camera !== f.camera) return false;
  if (f.lens !== null && p.exif?.lens !== f.lens) return false;
  // A photo without ISO never matches an ISO range.
  if ((f.isoMin !== null || f.isoMax !== null) && iso === null) return false;
  if (iso !== null && ((f.isoMin !== null && iso < f.isoMin) || (f.isoMax !== null && iso > f.isoMax))) return false;
  if (from !== null && p.captureDate < from) return false;
  if (to !== null && p.captureDate >= to) return false;
  if (f.keyword !== null) {
    const k = f.keyword.toLowerCase();
    if (!(p.keywords ?? []).some((w) => w.toLowerCase() === k)) return false;
  }
  return true;
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
  const words = f.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const from = f.dateFrom ? dayStart(f.dateFrom) : null;
  const to = f.dateTo ? dayEnd(f.dateTo) : null;
  return photos.filter(
    (p) =>
      matchesFlag(p.flag, f.flag) &&
      p.rating >= f.minRating &&
      (f.label === null || p.colorLabel === f.label) &&
      matchesSearch(p, words) &&
      matchesMetadata(p, f, from, to),
  );
}

/** Distinct non-empty values, sorted (the Camera / Lens filter menus). */
export function distinctValues(photos: readonly PhotoRecord[], pick: (p: PhotoRecord) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const p of photos) {
    const v = pick(p);
    if (v) set.add(v);
  }
  return [...set].sort(fileNameCollator.compare);
}

/** Every keyword in the catalog, case-insensitively distinct, sorted. */
export function allKeywords(photos: readonly PhotoRecord[]): string[] {
  const byLower = new Map<string, string>();
  for (const p of photos) for (const k of p.keywords ?? []) if (!byLower.has(k.toLowerCase())) byLower.set(k.toLowerCase(), k);
  return [...byLower.values()].sort(fileNameCollator.compare);
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
