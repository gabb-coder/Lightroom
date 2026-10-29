import { db, type PhotoRecord } from '../db/db';
import { photoExif } from './exif';
import { decodePhoto } from '../workers/thumbnailClient';
import { isAcceptedFile } from './loadPhoto';

export interface ImportResult {
  /** Ids of the new photos, in the order given. */
  imported: string[];
  /** Files skipped because they are not JPEG/PNG. */
  rejected: string[];
  /** Files that looked right but could not be decoded. */
  failed: string[];
}

export interface ImportProgress {
  done: number;
  total: number;
}

let persistRequested = false;

/** Asks the browser not to evict the catalog under storage pressure (best effort). */
function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

async function nextImportIndex(): Promise<number> {
  const last = await db.photos.orderBy('importIndex').last();
  return last ? last.importIndex + 1 : 0;
}

/**
 * Imports JPEG/PNG files into the catalog: the original is stored once as-is,
 * plus a catalog row and a thumbnail, written together in one transaction.
 */
export async function importFiles(files: readonly File[], onProgress?: (p: ImportProgress) => void): Promise<ImportResult> {
  const accepted = files.filter(isAcceptedFile);
  const result: ImportResult = { imported: [], rejected: files.filter((f) => !isAcceptedFile(f)).map((f) => f.name), failed: [] };
  if (accepted.length === 0) return result;
  requestPersistentStorage();

  const batchId = crypto.randomUUID();
  const importedAt = Date.now();
  let importIndex = await nextImportIndex();
  onProgress?.({ done: 0, total: accepted.length });

  for (const [i, file] of accepted.entries()) {
    try {
      const decoded = await decodePhoto(file);
      const id = crypto.randomUUID();
      const photo: PhotoRecord = {
        id,
        fileName: file.name,
        fileType: file.type,
        size: file.size,
        width: decoded.width,
        height: decoded.height,
        captureDate: decoded.exif.captureDate ?? file.lastModified,
        captureDateFromExif: decoded.exif.captureDate !== null,
        exif: photoExif(decoded.exif),
        rating: 0,
        flag: null,
        colorLabel: null,
        importedAt,
        importIndex: importIndex++,
        batchId,
        edited: false,
        thumbVersion: 0,
      };
      await db.transaction('rw', db.photos, db.originals, db.thumbnails, async () => {
        await db.originals.add({ photoId: id, blob: file });
        await db.thumbnails.add({ photoId: id, base: decoded.thumbnail, edited: null });
        await db.photos.add(photo);
      });
      result.imported.push(id);
    } catch {
      result.failed.push(file.name);
    }
    onProgress?.({ done: i + 1, total: accepted.length });
  }
  return result;
}

/** User-facing summary of skipped or failed files, or null if all went well. */
export function importProblemMessage(r: Pick<ImportResult, 'rejected' | 'failed'>): string | null {
  const parts: string[] = [];
  if (r.rejected.length === 1) parts.push(`${r.rejected[0]} is not a JPEG or PNG file.`);
  else if (r.rejected.length > 1) parts.push(`${r.rejected.length} files were skipped: not JPEG or PNG.`);
  if (r.failed.length === 1) parts.push(`${r.failed[0]} could not be read.`);
  else if (r.failed.length > 1) parts.push(`${r.failed.length} files could not be read.`);
  return parts.length ? parts.join(' ') : null;
}
