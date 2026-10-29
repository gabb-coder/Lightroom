import { create } from 'zustand';
import type { PhotoRecord } from '../db/db';
import type { CollectionRecord } from '../model/collections';
import {
  EMPTY_FILTER,
  filmstripFilter,
  filterPhotos,
  sortPhotos,
  type FilmstripFilter,
  type LibraryFilter,
  type SortKey,
} from '../model/organize';
import { clickSelection, EMPTY_SELECTION, pruneSelection, selectOnly, type ClickModifiers, type Selection } from '../model/selection';

/** "All photographs", "Previous import", or a collection (`collection:<id>`). */
export type CatalogView = 'all' | 'previous' | `collection:${string}`;

export const collectionView = (id: string): CatalogView => `collection:${id}`;

/** The collection id a view shows, or null. */
export function viewCollectionId(view: CatalogView): string | null {
  return view.startsWith('collection:') ? view.slice('collection:'.length) : null;
}

export const THUMB_SIZE = { min: 140, max: 320, step: 10, default: 190 } as const;

interface LibraryState {
  /** All photos in import order, kept in sync with the database. */
  photos: readonly PhotoRecord[];
  /** All collections, kept in sync with the database. */
  collections: readonly CollectionRecord[];
  /** False until the catalog has been read once. */
  loaded: boolean;
  selection: Selection;
  /** The focused photo (= selection.focusId): details panel, open in Develop. */
  selectedId: string | null;
  view: CatalogView;
  filter: LibraryFilter;
  sort: SortKey;
  filmstripFilter: FilmstripFilter;
  /** Minimum grid cell width in px. */
  thumbSize: number;
  importing: { done: number; total: number } | null;
  /** Last import problem (skipped or unreadable files). */
  importMessage: string | null;
  setPhotos: (photos: readonly PhotoRecord[]) => void;
  setCollections: (collections: readonly CollectionRecord[]) => void;
  /** Selects exactly one photo (or none). */
  select: (id: string | null) => void;
  /** Grid click with Ctrl/Cmd (toggle) and Shift (range) in the order shown. */
  clickPhoto: (id: string, mods: ClickModifiers, order: readonly string[]) => void;
  setView: (view: CatalogView) => void;
  setFilter: (patch: Partial<LibraryFilter>) => void;
  clearFilter: () => void;
  setSort: (sort: SortKey) => void;
  setFilmstripFilter: (f: FilmstripFilter) => void;
  setThumbSize: (size: number) => void;
  setImporting: (importing: { done: number; total: number } | null) => void;
  setImportMessage: (message: string | null) => void;
}

/** Batch id of the most recent import, or null if the library is empty. */
export function latestBatchId(photos: readonly PhotoRecord[]): string | null {
  return photos.length ? (photos[photos.length - 1]?.batchId ?? null) : null;
}

/** Photos of the current catalog view ("All photographs", "Previous import" or a collection). */
export function visiblePhotos(photos: readonly PhotoRecord[], view: CatalogView, collections: readonly CollectionRecord[] = []): readonly PhotoRecord[] {
  if (view === 'all') return photos;
  const collectionId = viewCollectionId(view);
  if (collectionId !== null) {
    const members = new Set(collections.find((c) => c.id === collectionId)?.photoIds ?? []);
    return photos.filter((p) => members.has(p.id));
  }
  const batch = latestBatchId(photos);
  return photos.filter((p) => p.batchId === batch);
}

type ListInputs = Pick<LibraryState, 'photos' | 'view' | 'filter' | 'sort' | 'collections'>;

/** Caches the last result so selectors return a stable array until an input changes. */
function memoLast<S, R>(inputs: (s: S) => readonly unknown[], compute: (s: S) => R): (s: S) => R {
  let lastInputs: readonly unknown[] | null = null;
  let last: R;
  return (s) => {
    const next = inputs(s);
    if (!lastInputs || next.some((v, i) => v !== lastInputs?.[i])) {
      lastInputs = next;
      last = compute(s);
    }
    return last;
  };
}

/** The grid: catalog view, then filters, then sort. */
export const selectLibraryList = memoLast(
  (s: ListInputs) => [s.photos, s.view, s.filter, s.sort, s.collections],
  (s) => sortPhotos(filterPhotos(visiblePhotos(s.photos, s.view, s.collections), s.filter), s.sort),
);

/** The Develop filmstrip: the grid list narrowed by the filmstrip's quick filter. */
export const selectFilmstripList = memoLast(
  (s: ListInputs & Pick<LibraryState, 'filmstripFilter'>) => [selectLibraryList(s), s.filmstripFilter],
  (s) => filmstripFilter(selectLibraryList(s), s.filmstripFilter),
);

const withSelection = (selection: Selection) => ({ selection, selectedId: selection.focusId });

/** Keeps the selection to photos still shown after a filter/view change. */
function pruned(s: LibraryState, patch: Partial<LibraryState>) {
  const next = { ...s, ...patch };
  // A just-created collection reaches the store after its view is shown: keep the selection until it does.
  const collectionId = viewCollectionId(next.view);
  if (collectionId !== null && !next.collections.some((c) => c.id === collectionId)) return patch;
  return { ...patch, ...withSelection(pruneSelection(s.selection, selectLibraryList(next).map((p) => p.id))) };
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  photos: [],
  collections: [],
  loaded: false,
  selection: EMPTY_SELECTION,
  selectedId: null,
  view: 'all',
  filter: EMPTY_FILTER,
  sort: 'importOrder',
  filmstripFilter: 'all',
  thumbSize: THUMB_SIZE.default,
  importing: null,
  importMessage: null,
  setPhotos: (photos) =>
    set((s) => {
      // Drop selected photos that no longer exist (not ones merely filtered out).
      const selection = pruneSelection(s.selection, photos.map((p) => p.id));
      return { photos, loaded: true, ...withSelection(selection) };
    }),
  setCollections: (collections) =>
    set((s) => {
      // A deleted collection's view falls back to all photographs.
      const id = viewCollectionId(s.view);
      const view = id !== null && !collections.some((c) => c.id === id) ? 'all' : s.view;
      return pruned(s, { collections, view });
    }),
  select: (id) => set(withSelection(id ? selectOnly(id) : EMPTY_SELECTION)),
  clickPhoto: (id, mods, order) => set((s) => withSelection(clickSelection(s.selection, order, id, mods))),
  setView: (view) => set((s) => pruned(s, { view })),
  setFilter: (patch) => set((s) => pruned(s, { filter: { ...s.filter, ...patch } })),
  clearFilter: () => set((s) => pruned(s, { filter: EMPTY_FILTER })),
  setSort: (sort) => set({ sort }),
  setFilmstripFilter: (filmstripFilter) => set({ filmstripFilter }),
  setThumbSize: (thumbSize) => set({ thumbSize }),
  setImporting: (importing) => set({ importing }),
  setImportMessage: (importMessage) => set({ importMessage }),
}));

/** The photo `step` places before/after `id` in `list` (clamped), for arrow-key navigation. */
export function neighborId(list: readonly PhotoRecord[], id: string | null, step: -1 | 1): string | null {
  if (list.length === 0) return null;
  const index = id ? list.findIndex((p) => p.id === id) : -1;
  if (index < 0) return list[0]?.id ?? null;
  return list[Math.min(list.length - 1, Math.max(0, index + step))]?.id ?? null;
}
