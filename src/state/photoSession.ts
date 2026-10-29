import { db, getOriginal } from '../db/db';
import { parseStoredHistory } from '../model/history';
import { displayName } from '../model/virtualCopy';
import { useAppStore } from './appStore';
import { useDevelopStore } from './developStore';
import { flushEdits } from './editPersistence';
import { useLibraryStore } from './libraryStore';

let loadToken = 0;

/**
 * Loads a catalog photo into Develop: decodes the stored original and
 * restores its saved history. If another photo is requested meanwhile, the
 * stale load is dropped.
 */
export async function openPhotoInDevelop(id: string): Promise<void> {
  if (useDevelopStore.getState().photo?.id === id) return;
  const token = ++loadToken;
  await flushEdits();
  const [record, original, edits] = await Promise.all([db.photos.get(id), getOriginal(id), db.edits.get(id)]);
  if (token !== loadToken) return;
  if (!record || !original) return;
  const bitmap = await createImageBitmap(original.blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
  if (token !== loadToken) {
    bitmap.close();
    return;
  }
  useDevelopStore
    .getState()
    .loadPhoto({ id, name: displayName(record), width: bitmap.width, height: bitmap.height, bitmap }, parseStoredHistory(edits?.history));
}

/**
 * Keeps Develop showing the selected photo. Decoding the full original only
 * happens while the Develop module is open.
 */
export function startPhotoSession(): () => void {
  const sync = () => {
    const { selectedId } = useLibraryStore.getState();
    if (useAppStore.getState().module === 'develop' && selectedId) void openPhotoInDevelop(selectedId);
  };
  sync();
  const unsubLibrary = useLibraryStore.subscribe((s, prev) => {
    if (s.selectedId !== prev.selectedId) sync();
  });
  const unsubApp = useAppStore.subscribe((s, prev) => {
    if (s.module !== prev.module) sync();
  });
  return () => {
    unsubLibrary();
    unsubApp();
  };
}
