import { addKeywords, removeKeyword } from '../model/keywords';
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

/** Adds keywords to every given photo (existing spellings win). */
export async function addKeywordsTo(ids: readonly string[], keywords: readonly string[]): Promise<void> {
  if (!ids.length || !keywords.length) return;
  await db.photos.where('id').anyOf([...ids]).modify((p) => {
    p.keywords = addKeywords(p.keywords, keywords);
  });
}

/** Removes a keyword (case-insensitively) from every given photo. */
export async function removeKeywordFrom(ids: readonly string[], keyword: string): Promise<void> {
  if (!ids.length) return;
  await db.photos.where('id').anyOf([...ids]).modify((p) => {
    p.keywords = removeKeyword(p.keywords, keyword);
  });
}
