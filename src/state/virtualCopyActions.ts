import { db, type PhotoRecord } from '../db/db';
import { createHistory } from '../model/history';
import { copyImportIndex, masterIdOf, nextCopyNumber } from '../model/virtualCopy';
import { flushEdits } from './editPersistence';
import { useLibraryStore } from './libraryStore';
import { settingsOf } from './settingsSync';

/**
 * Makes a virtual copy of a photo: a new catalog entry with the same
 * original (not stored again), its current settings as a fresh history, and
 * the same rating, flag, label and keywords. Returns the copy's id.
 */
export async function createVirtualCopy(sourceId: string): Promise<string | null> {
  await flushEdits();
  const source = await db.photos.get(sourceId);
  if (!source) return null;
  const masterId = masterIdOf(source);
  const settings = structuredClone(await settingsOf(sourceId));
  const id = crypto.randomUUID();
  await db.transaction('rw', db.photos, db.thumbnails, db.edits, async () => {
    const master = (await db.photos.get(masterId)) ?? source;
    const siblings = await db.photos.filter((p) => p.masterId === masterId).toArray();
    const number = nextCopyNumber(siblings, masterId);
    const thumbs = await db.thumbnails.get(sourceId);
    const copy: PhotoRecord = {
      ...source,
      id,
      masterId,
      copyName: `Copy ${number}`,
      importIndex: copyImportIndex(master.importIndex, number),
      importedAt: Date.now(),
      thumbVersion: 0,
    };
    await db.photos.add(copy);
    if (thumbs) await db.thumbnails.add({ ...thumbs, photoId: id });
    await db.edits.put({ photoId: id, history: createHistory(settings, 'Virtual copy'), updatedAt: Date.now() });
  });
  return id;
}

/**
 * Removes a virtual copy and everything that is only its own (edits,
 * thumbnails, snapshots, collection membership). Masters are never removed
 * here, and the shared original is untouched.
 */
export async function removeVirtualCopy(id: string): Promise<void> {
  await flushEdits();
  const photo = await db.photos.get(id);
  if (!photo?.masterId) return;
  const wasFocused = useLibraryStore.getState().selectedId === id;
  await db.transaction('rw', [db.photos, db.edits, db.thumbnails, db.snapshots, db.collections], async () => {
    await db.photos.delete(id);
    await db.edits.delete(id);
    await db.thumbnails.delete(id);
    await db.snapshots.where('photoId').equals(id).delete();
    await db.collections.toCollection().modify((c) => {
      c.photoIds = c.photoIds.filter((p) => p !== id);
    });
  });
  // Show the master in its place.
  if (wasFocused) useLibraryStore.getState().select(photo.masterId);
}
