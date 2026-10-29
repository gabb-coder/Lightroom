import { db, type ColorLabel, type Flag } from '../db/db';
import { useAppStore } from './appStore';
import { useDevelopStore } from './developStore';
import { useLibraryStore } from './libraryStore';

/**
 * Photos that rating/flag/label commands apply to: every selected photo in
 * the Library, the open photo in Develop.
 */
export function organizeTargets(): string[] {
  const library = useLibraryStore.getState();
  if (useAppStore.getState().module === 'develop') {
    const id = useDevelopStore.getState().photo?.id ?? library.selectedId;
    return id ? [id] : [];
  }
  return [...library.selection.ids];
}

/** Ratings, flags and labels are catalog data (not edit history); liveQuery refreshes every view. */
export async function setRating(ids: readonly string[], rating: number): Promise<void> {
  if (ids.length) await db.photos.where('id').anyOf([...ids]).modify({ rating: Math.max(0, Math.min(5, Math.round(rating))) });
}

export async function setFlag(ids: readonly string[], flag: Flag | null): Promise<void> {
  if (ids.length) await db.photos.where('id').anyOf([...ids]).modify({ flag });
}

export async function setColorLabel(ids: readonly string[], colorLabel: ColorLabel | null): Promise<void> {
  if (ids.length) await db.photos.where('id').anyOf([...ids]).modify({ colorLabel });
}
