import { db, getOriginal } from '../db/db';
import { EXIF_SCAN_BYTES, photoExif, readExif } from '../io/exif';

/**
 * Photos imported before camera fields were read have no `exif` yet: read
 * it once from their stored originals (only the first EXIF_SCAN_BYTES), in
 * the background. Originals are only read.
 */
export async function backfillExif(): Promise<void> {
  const missing = await db.photos.filter((p) => p.exif === undefined).primaryKeys();
  for (const id of missing) {
    const original = await getOriginal(id);
    if (!original) continue;
    const exif = photoExif(readExif(await original.blob.slice(0, EXIF_SCAN_BYTES).arrayBuffer()));
    await db.photos.update(id, { exif });
  }
}
