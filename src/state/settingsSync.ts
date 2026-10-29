import { db, getOriginal, type PhotoRecord } from '../db/db';
import { isEdited, jsonEqual } from '../model/compare';
import { DEFAULT_COPY_PANELS, pasteSettings, type SettingsClipboard, type SettingsPanel } from '../model/copySettings';
import type { EditSettings } from '../model/editSettings';
import type { ExportOptions } from '../model/exportOptions';
import { currentSettings, parseStoredHistory, pushHistory } from '../model/history';
import { createExportClient } from '../workers/exportClient';
import { THUMBNAIL_LONG_EDGE, THUMBNAIL_QUALITY } from '../workers/thumbnailProtocol';
import { useAppStore } from './appStore';
import { displayName } from '../model/virtualCopy';
import { useDevelopStore } from './developStore';
import { flushEdits } from './editPersistence';
import { useLibraryStore } from './libraryStore';

/**
 * Copy, paste, sync and "Previous" (M10). Every change to a photo is exactly
 * one history step on that photo, whether or not it is open in Develop, so
 * it can be undone there like any other edit.
 */

/** The photo settings are copied or synced from: the open photo in Develop, else the focused one. */
export function settingsSourceId(): string | null {
  const library = useLibraryStore.getState();
  if (useAppStore.getState().module === 'develop') return useDevelopStore.getState().photo?.id ?? library.selectedId;
  return library.selectedId;
}

/** The open photo's live settings, or the saved ones. */
export async function settingsOf(photoId: string): Promise<EditSettings> {
  const develop = useDevelopStore.getState();
  if (develop.photo?.id === photoId) return develop.settings;
  return currentSettings(parseStoredHistory((await db.edits.get(photoId))?.history));
}

/** Adds one history step to a photo that is not open; false if nothing would change. */
async function commitStored(record: PhotoRecord, label: string, make: (current: EditSettings) => EditSettings): Promise<boolean> {
  return db.transaction('rw', db.edits, db.photos, async () => {
    const history = parseStoredHistory((await db.edits.get(record.id))?.history);
    const current = currentSettings(history);
    const next = make(current);
    if (jsonEqual(next, current)) return false;
    await db.edits.put({ photoId: record.id, history: pushHistory(history, { label, key: null, settings: next }), updatedAt: Date.now() });
    await db.photos.update(record.id, { edited: isEdited(next) });
    return true;
  });
}

/**
 * Applies new settings to each photo as one history step labelled `label`.
 * Returns how many photos changed.
 */
export async function applyToPhotos(ids: readonly string[], label: string, make: (current: EditSettings, record: PhotoRecord) => EditSettings): Promise<number> {
  await flushEdits();
  let changed = 0;
  const background: string[] = [];
  for (const id of ids) {
    const record = await db.photos.get(id);
    if (!record) continue;
    const develop = useDevelopStore.getState();
    if (develop.photo?.id === id) {
      // The open photo: through its store, so the screen, history and thumbnail follow.
      develop.applySettings(label, make(develop.settings, record));
      if (useDevelopStore.getState().history !== develop.history) changed++;
    } else if (await commitStored(record, label, (current) => make(current, record))) {
      changed++;
      background.push(id);
    }
  }
  queueThumbnails(background);
  return changed;
}

/** Copies the chosen panels of the source photo's current settings. */
export async function copySettings(panels: readonly SettingsPanel[]): Promise<SettingsClipboard | null> {
  const id = settingsSourceId();
  const record = id ? await db.photos.get(id) : undefined;
  if (!id || !record) return null;
  return { settings: structuredClone(await settingsOf(id)), panels: [...panels], from: displayName(record) };
}

/** Paste targets: the open photo in Develop, every selected photo in the Library. */
export function pasteTargets(): string[] {
  const library = useLibraryStore.getState();
  if (useAppStore.getState().module === 'develop') {
    const id = useDevelopStore.getState().photo?.id;
    return id ? [id] : [];
  }
  return [...library.selection.ids];
}

export function pasteClipboard(clipboard: SettingsClipboard, targets: readonly string[] = pasteTargets()): Promise<number> {
  return applyToPhotos(targets, 'Paste settings', (current, record) => pasteSettings(current, clipboard.settings, clipboard.panels, record));
}

/** Sync targets: every selected photo except the source. */
export function syncTargets(): string[] {
  const source = settingsSourceId();
  return useLibraryStore.getState().selection.ids.filter((id) => id !== source);
}

/** Copies the chosen panels from the source photo to every other selected photo. */
export async function syncSettings(panels: readonly SettingsPanel[]): Promise<number> {
  const source = await copySettings(panels);
  if (!source) return 0;
  return applyToPhotos(syncTargets(), 'Sync settings', (current, record) => pasteSettings(current, source.settings, panels, record));
}

/** Develop's "Previous": the previously shown photo's settings (all but crop and geometry) onto the open one. */
export async function pastePrevious(): Promise<number> {
  const { photo, previousPhotoId } = useDevelopStore.getState();
  if (!photo || !previousPhotoId) return 0;
  await flushEdits();
  const previous = await settingsOf(previousPhotoId);
  return applyToPhotos([photo.id], 'Paste from previous', (current, record) => pasteSettings(current, previous, DEFAULT_COPY_PANELS, record));
}

// --- Edited thumbnails of photos changed while not open -------------------

const thumbnailClient = createExportClient();

const THUMBNAIL_OPTIONS: ExportOptions = {
  format: 'jpeg',
  quality: Math.round(THUMBNAIL_QUALITY * 100),
  resize: true,
  longEdge: THUMBNAIL_LONG_EDGE,
  naming: 'original',
  customName: '',
  metadata: 'none',
};

let thumbnailQueue: Promise<void> = Promise.resolve();

/** Renders a photo's edited thumbnail from its saved settings (full pipeline, then scaled down). */
async function renderThumbnail(id: string): Promise<void> {
  const settings = currentSettings(parseStoredHistory((await db.edits.get(id))?.history));
  const original = await getOriginal(id);
  if (!original) return;
  const edited = isEdited(settings) ? (await thumbnailClient.run(original.blob, settings, THUMBNAIL_OPTIONS)).blob : null;
  // Skip if the photo was edited again meanwhile (its own update wins).
  const latest = currentSettings(parseStoredHistory((await db.edits.get(id))?.history));
  if (!jsonEqual(latest, settings)) return;
  await db.thumbnails.update(id, { edited });
  const photo = await db.photos.get(id);
  if (photo) await db.photos.update(id, { thumbVersion: photo.thumbVersion + 1 });
}

function queueThumbnails(ids: readonly string[]): void {
  for (const id of ids) thumbnailQueue = thumbnailQueue.then(() => renderThumbnail(id)).catch(() => undefined);
}

/** Resolves when every queued thumbnail has been rendered (tests, export). */
export function thumbnailsSettled(): Promise<void> {
  return thumbnailQueue;
}
