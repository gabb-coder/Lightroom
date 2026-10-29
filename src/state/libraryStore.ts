import { create } from 'zustand';
import type { PhotoRecord } from '../db/db';

export type CatalogView = 'all' | 'previous';

export const THUMB_SIZE = { min: 140, max: 320, step: 10, default: 190 } as const;

interface LibraryState {
  /** All photos in import order, kept in sync with the database. */
  photos: readonly PhotoRecord[];
  /** False until the catalog has been read once. */
  loaded: boolean;
  /** The current photo: highlighted in the grid and filmstrip, open in Develop. */
  selectedId: string | null;
  view: CatalogView;
  /** Minimum grid cell width in px. */
  thumbSize: number;
  importing: { done: number; total: number } | null;
  /** Last import problem (skipped or unreadable files). */
  importMessage: string | null;
  setPhotos: (photos: readonly PhotoRecord[]) => void;
  select: (id: string | null) => void;
  setView: (view: CatalogView) => void;
  setThumbSize: (size: number) => void;
  setImporting: (importing: { done: number; total: number } | null) => void;
  setImportMessage: (message: string | null) => void;
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  photos: [],
  loaded: false,
  selectedId: null,
  view: 'all',
  thumbSize: THUMB_SIZE.default,
  importing: null,
  importMessage: null,
  setPhotos: (photos) =>
    set((s) => ({
      photos,
      loaded: true,
      // Drop a selection that no longer exists.
      selectedId: s.selectedId && photos.some((p) => p.id === s.selectedId) ? s.selectedId : null,
    })),
  select: (selectedId) => set({ selectedId }),
  setView: (view) => set({ view }),
  setThumbSize: (thumbSize) => set({ thumbSize }),
  setImporting: (importing) => set({ importing }),
  setImportMessage: (importMessage) => set({ importMessage }),
}));

/** Batch id of the most recent import, or null if the library is empty. */
export function latestBatchId(photos: readonly PhotoRecord[]): string | null {
  return photos.length ? (photos[photos.length - 1]?.batchId ?? null) : null;
}

/** Photos shown in the grid and filmstrip for the current catalog view. */
export function visiblePhotos(photos: readonly PhotoRecord[], view: CatalogView): readonly PhotoRecord[] {
  if (view === 'all') return photos;
  const batch = latestBatchId(photos);
  return photos.filter((p) => p.batchId === batch);
}

/** The photo `step` places before/after `id` in `list` (clamped), for arrow-key navigation. */
export function neighborId(list: readonly PhotoRecord[], id: string | null, step: -1 | 1): string | null {
  if (list.length === 0) return null;
  const index = id ? list.findIndex((p) => p.id === id) : -1;
  if (index < 0) return list[0]?.id ?? null;
  return list[Math.min(list.length - 1, Math.max(0, index + step))]?.id ?? null;
}
