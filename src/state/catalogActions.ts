import { db, type PhotoRecord } from '../db/db';
import { downloadBlob } from '../io/download';
import { createZip, readEntryBytes, readZip, type ZipEntry, type ZipEntryInput } from '../io/zip';
import { BACKUP_FORMAT, BACKUP_VERSION, extensionForType, MANIFEST_NAME, parseManifest, restoredImportIndex, type BackupManifest } from '../model/backup';
import { withPhotos } from '../model/collections';
import { deletionSet } from '../model/virtualCopy';
import { useDevelopStore } from './developStore';
import { flushEdits } from './editPersistence';
import { loadExportPresets } from './exportStore';
import { loadSavedPresets } from './presetStore';

/**
 * Catalog safety (M17): back up everything to one ZIP, restore from it, and
 * delete photos. Everything lives only in this browser, so the backup is the
 * user's copy of their work.
 */

export type Progress = (done: number, total: number) => void;

const pad = (n: number) => String(n).padStart(2, '0');

export function backupFileName(now = new Date()): string {
  return `darkroom-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
}

/** Builds the backup archive: manifest, originals (masters only) and thumbnails. */
export async function createBackup(onProgress: Progress = () => undefined): Promise<Blob> {
  await flushEdits();
  const [photos, edits, thumbnails, collections, snapshots, presets, exportPresets] = await Promise.all([
    db.photos.orderBy('importIndex').toArray(),
    db.edits.toArray(),
    db.thumbnails.toArray(),
    db.collections.toArray(),
    db.snapshots.toArray(),
    db.presets.toArray(),
    db.exportPresets.toArray(),
  ]);
  const editsById = new Map(edits.map((e) => [e.photoId, e.history]));
  const thumbsById = new Map(thumbnails.map((t) => [t.photoId, t]));
  const files: ZipEntryInput[] = [];
  const entries: unknown[] = [];
  for (const [i, photo] of photos.entries()) {
    onProgress(i, photos.length);
    let original: string | null = null;
    if (!photo.masterId) {
      const stored = await db.originals.get(photo.id);
      if (!stored) continue; // nothing to restore it from
      original = `originals/${photo.id}.${extensionForType(photo.fileType)}`;
      files.push({ name: original, data: stored.blob, date: photo.importedAt });
    }
    const thumbs = thumbsById.get(photo.id);
    const thumbnail = thumbs ? `thumbnails/${photo.id}.jpg` : null;
    const editedThumbnail = thumbs?.edited ? `thumbnails/${photo.id}-edited.jpg` : null;
    if (thumbs && thumbnail) files.push({ name: thumbnail, data: thumbs.base });
    if (thumbs?.edited && editedThumbnail) files.push({ name: editedThumbnail, data: thumbs.edited });
    entries.push({ photo, history: editsById.get(photo.id) ?? null, original, thumbnail, editedThumbnail });
  }
  const manifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: Date.now(), photos: entries, collections, snapshots, presets, exportPresets };
  onProgress(photos.length, photos.length);
  return createZip([{ name: MANIFEST_NAME, data: JSON.stringify(manifest) }, ...files]);
}

export async function downloadBackup(onProgress?: Progress): Promise<void> {
  downloadBlob(await createBackup(onProgress), backupFileName());
}

export interface RestoreResult {
  added: number;
  /** Already in the catalog (same id), left as they are. */
  skipped: number;
  /** Couldn't be restored (missing or damaged file, master not available). */
  failed: number;
  collections: number;
  presets: number;
}

async function readManifest(entries: readonly ZipEntry[]): Promise<BackupManifest> {
  const entry = entries.find((e) => e.name === MANIFEST_NAME);
  if (!entry) return parseManifest(null);
  return parseManifest(JSON.parse(new TextDecoder().decode(await readEntryBytes(entry))) as unknown);
}

/**
 * Restores a backup into the catalog. Never overwrites: photos, collections
 * and presets already here (same id) are kept; collections gain any
 * restored members. Restoring into an empty catalog reproduces it exactly.
 */
export async function restoreBackup(file: Blob, onProgress: Progress = () => undefined): Promise<RestoreResult> {
  await flushEdits();
  const zipEntries = await readZip(file);
  const byName = new Map(zipEntries.map((e) => [e.name, e]));
  const manifest = await readManifest(zipEntries);
  const existing = new Set(await db.photos.toCollection().primaryKeys());
  const last = await db.photos.orderBy('importIndex').last();
  const catalogNext = last ? Math.floor(last.importIndex) + 1 : 0;
  const restoredMin = Math.min(...manifest.photos.map((p) => p.photo.importIndex), 0);
  const result: RestoreResult = { added: 0, skipped: 0, failed: 0, collections: 0, presets: 0 };
  // Masters first, so their copies find them.
  const ordered = [...manifest.photos].sort((a, b) => Number(Boolean(a.photo.masterId)) - Number(Boolean(b.photo.masterId)));
  const restored = new Set<string>();
  for (const [i, item] of ordered.entries()) {
    onProgress(i, ordered.length);
    const { photo } = item;
    if (existing.has(photo.id)) {
      result.skipped++;
      continue;
    }
    try {
      if (photo.masterId && !existing.has(photo.masterId) && !restored.has(photo.masterId)) throw new Error('master missing');
      const original = item.original ? byName.get(item.original) : undefined;
      if (!photo.masterId && !original) throw new Error('original missing');
      const originalBlob = original ? new Blob([(await readEntryBytes(original)).slice().buffer as ArrayBuffer], { type: photo.fileType }) : null;
      const thumbEntry = item.thumbnail ? byName.get(item.thumbnail) : undefined;
      const editedEntry = item.editedThumbnail ? byName.get(item.editedThumbnail) : undefined;
      const base = thumbEntry ? new Blob([(await readEntryBytes(thumbEntry)).slice().buffer as ArrayBuffer], { type: 'image/jpeg' }) : originalBlob;
      const edited = editedEntry ? new Blob([(await readEntryBytes(editedEntry)).slice().buffer as ArrayBuffer], { type: 'image/jpeg' }) : null;
      const record: PhotoRecord = { ...photo, importIndex: restoredImportIndex(photo.importIndex, restoredMin, catalogNext) };
      await db.transaction('rw', [db.photos, db.originals, db.thumbnails, db.edits], async () => {
        if (originalBlob) await db.originals.put({ photoId: photo.id, blob: originalBlob });
        if (base) await db.thumbnails.put({ photoId: photo.id, base, edited });
        if (item.history) await db.edits.put({ photoId: photo.id, history: item.history, updatedAt: Date.now() });
        await db.photos.put(record);
      });
      restored.add(photo.id);
      result.added++;
    } catch {
      result.failed++;
    }
  }
  await restoreExtras(manifest, restored, existing, result);
  onProgress(ordered.length, ordered.length);
  return result;
}

/** Collections, snapshots and presets that come with the restored photos. */
async function restoreExtras(manifest: BackupManifest, restored: Set<string>, existing: Set<string>, result: RestoreResult): Promise<void> {
  const known = (id: string) => restored.has(id) || existing.has(id);
  await db.transaction('rw', [db.collections, db.snapshots, db.presets, db.exportPresets], async () => {
    for (const c of manifest.collections) {
      const members = c.photoIds.filter(known);
      const current = await db.collections.get(c.id);
      if (current) await db.collections.update(c.id, { photoIds: withPhotos(current.photoIds, members) });
      else {
        await db.collections.add({ ...c, photoIds: members });
        result.collections++;
      }
    }
    for (const s of manifest.snapshots) if (restored.has(s.photoId) && !(await db.snapshots.get(s.id))) await db.snapshots.add(s);
    for (const p of manifest.presets) {
      if (await db.presets.get(p.id)) continue;
      await db.presets.add(p);
      result.presets++;
    }
    for (const p of manifest.exportPresets) if (!(await db.exportPresets.get(p.id))) await db.exportPresets.add(p);
  });
  await Promise.all([loadSavedPresets(), loadExportPresets()]);
}

/**
 * Removes photos from the catalog for good: rows, originals, thumbnails,
 * edits, snapshots and collection membership. Virtual copies go with their
 * master. Files on the user's computer are not involved.
 */
export async function deletePhotos(ids: readonly string[]): Promise<number> {
  await flushEdits();
  const all = await db.photos.toArray();
  const doomed = deletionSet(all, ids);
  if (doomed.length === 0) return 0;
  const develop = useDevelopStore.getState();
  if (develop.photo && doomed.includes(develop.photo.id)) develop.closePhoto();
  await db.transaction('rw', [db.photos, db.originals, db.thumbnails, db.edits, db.snapshots, db.collections], async () => {
    await db.photos.bulkDelete(doomed);
    await db.originals.bulkDelete(doomed);
    await db.thumbnails.bulkDelete(doomed);
    await db.edits.bulkDelete(doomed);
    await db.snapshots.where('photoId').anyOf(doomed).delete();
    const gone = new Set(doomed);
    await db.collections.toCollection().modify((c) => {
      c.photoIds = c.photoIds.filter((id) => !gone.has(id));
    });
  });
  return doomed.length;
}

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  /** The browser promised not to clear this site's data on its own. */
  persisted: boolean | null;
}

export async function storageInfo(): Promise<StorageInfo> {
  const storage = navigator.storage as StorageManager | undefined;
  const [estimate, persisted] = await Promise.all([
    storage?.estimate?.().catch(() => null) ?? null,
    storage?.persisted?.().catch(() => null) ?? null,
  ]);
  return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted };
}

/** Asks the browser to keep this site's data (it may decide on its own). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
