import { db } from '../db/db';
import { normalizeCollectionName, uniqueCollectionName, withoutPhotos, withPhotos } from '../model/collections';
import { collectionView, useLibraryStore } from './libraryStore';

/** Drag data type for photos dragged from the grid (a JSON array of ids). */
export const PHOTO_DRAG_TYPE = 'application/x-darkroom-photos';

/** Photo ids from a drag, or null if it isn't a photo drag. */
export function draggedPhotoIds(data: DataTransfer): string[] | null {
  if (!data.types.includes(PHOTO_DRAG_TYPE)) return null;
  try {
    const parsed: unknown = JSON.parse(data.getData(PHOTO_DRAG_TYPE));
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

/**
 * Collection changes (M12). Collections are catalog data, not edit history;
 * liveQuery refreshes every view. None of these touch photos.
 */

/** Creates a collection (optionally with photos) and shows it. Returns its id, or null for an empty name. */
export async function createCollection(rawName: string, photoIds: readonly string[] = []): Promise<string | null> {
  const name = normalizeCollectionName(rawName);
  if (!name) return null;
  const id = crypto.randomUUID();
  await db.transaction('rw', db.collections, async () => {
    const existing = await db.collections.toArray();
    await db.collections.add({ id, name: uniqueCollectionName(name, existing), photoIds: withPhotos([], photoIds), createdAt: Date.now() });
  });
  return id;
}

export async function renameCollection(id: string, rawName: string): Promise<void> {
  const name = normalizeCollectionName(rawName);
  if (!name) return;
  await db.transaction('rw', db.collections, async () => {
    const existing = await db.collections.toArray();
    await db.collections.update(id, { name: uniqueCollectionName(name, existing, id) });
  });
}

/** Deletes the collection only; its photos stay in the catalog. */
export async function deleteCollection(id: string): Promise<void> {
  await db.collections.delete(id);
}

export async function addToCollection(id: string, photoIds: readonly string[]): Promise<void> {
  if (!photoIds.length) return;
  await db.collections.where('id').equals(id).modify((c) => {
    c.photoIds = withPhotos(c.photoIds, photoIds);
  });
}

export async function removeFromCollection(id: string, photoIds: readonly string[]): Promise<void> {
  if (!photoIds.length) return;
  await db.collections.where('id').equals(id).modify((c) => {
    c.photoIds = withoutPhotos(c.photoIds, photoIds);
  });
}

/** Shows a collection in the grid. */
export function showCollection(id: string): void {
  useLibraryStore.getState().setView(collectionView(id));
}
