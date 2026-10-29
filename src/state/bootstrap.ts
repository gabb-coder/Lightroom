import { liveQuery } from 'dexie';
import { db } from '../db/db';
import { APP_MODULES, useAppStore, type AppModule } from './appStore';
import { startEditPersistence } from './editPersistence';
import { THUMB_SIZE, useLibraryStore } from './libraryStore';
import { startPhotoSession } from './photoSession';
import { loadExportPresets } from './exportStore';
import { loadSavedPresets } from './presetStore';
import { startThumbnailUpdater } from './thumbnailUpdater';
import { readUiPrefs, writeUiPrefs } from './uiPrefs';

function restoreUiPrefs(): void {
  const prefs = readUiPrefs();
  if (APP_MODULES.includes(prefs.module as AppModule)) useAppStore.getState().setModule(prefs.module as AppModule);
  if (typeof prefs.selectedId === 'string') useLibraryStore.getState().select(prefs.selectedId);
  if (typeof prefs.thumbSize === 'number') {
    useLibraryStore.getState().setThumbSize(Math.min(THUMB_SIZE.max, Math.max(THUMB_SIZE.min, prefs.thumbSize)));
  }
  useAppStore.subscribe((s) => writeUiPrefs({ module: s.module }));
  useLibraryStore.subscribe((s, prev) => {
    if (s.selectedId !== prev.selectedId && s.loaded) writeUiPrefs({ selectedId: s.selectedId ?? undefined });
    if (s.thumbSize !== prev.thumbSize) writeUiPrefs({ thumbSize: s.thumbSize });
  });
}

/** Connects the stores to the on-device catalog. Call once before rendering. */
export function startCatalog(): void {
  restoreUiPrefs();
  liveQuery(() => db.photos.orderBy('importIndex').toArray()).subscribe({
    next: (photos) => useLibraryStore.getState().setPhotos(photos),
    error: () => useLibraryStore.getState().setPhotos([]),
  });
  void loadSavedPresets().catch(() => undefined);
  void loadExportPresets().catch(() => undefined);
  startPhotoSession();
  startEditPersistence();
  startThumbnailUpdater();
}
