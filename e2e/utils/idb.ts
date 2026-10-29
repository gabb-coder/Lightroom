import type { Page } from '@playwright/test';
import type { EditSettings } from '../../src/model/editSettings';

/** Reads every row of an object store in the app's catalog database. */
async function readAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('photo-editor');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const req = db.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows;
  }, store) as Promise<T[]>;
}

/** SHA-256 (hex) of the first stored original, computed in the page. */
export async function storedOriginalHash(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('photo-editor');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ blob: Blob }[]>((resolve, reject) => {
      const req = db.transaction('originals').objectStore('originals').getAll();
      req.onsuccess = () => resolve(req.result as { blob: Blob }[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const first = rows[0];
    if (!first) throw new Error('no original stored');
    const digest = await crypto.subtle.digest('SHA-256', await first.blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  });
}

/** Current (cursor) settings saved for the first photo with edits. */
export async function savedSettings(page: Page): Promise<EditSettings> {
  const rows = await readAll<{ history: { entries: { settings: EditSettings }[]; cursor: number } }>(page, 'edits');
  const h = rows[0]?.history;
  const s = h?.entries[h.cursor]?.settings;
  if (!s) throw new Error('no saved edits');
  return s;
}

export interface StoredPhotoEdits {
  labels: string[];
  cursor: number;
  settings: EditSettings | null;
  edited: boolean;
  hasEditedThumbnail: boolean;
}

/** Saved history, edited flag and thumbnail state per photo, keyed by file name. */
export async function storedEditsByName(page: Page): Promise<Record<string, StoredPhotoEdits>> {
  const [photos, edits, thumbs] = await Promise.all([
    readAll<{ id: string; fileName: string; edited: boolean }>(page, 'photos'),
    readAll<{ photoId: string; history: { entries: { label: string; settings: EditSettings }[]; cursor: number } }>(page, 'edits'),
    readAll<{ photoId: string; edited: Blob | null }>(page, 'thumbnails'),
  ]);
  const out: Record<string, StoredPhotoEdits> = {};
  for (const p of photos) {
    const h = edits.find((e) => e.photoId === p.id)?.history;
    out[p.fileName] = {
      labels: h?.entries.map((e) => e.label) ?? [],
      cursor: h?.cursor ?? -1,
      settings: h?.entries[h.cursor]?.settings ?? null,
      edited: p.edited,
      hasEditedThumbnail: Boolean(thumbs.find((t) => t.photoId === p.id)?.edited),
    };
  }
  return out;
}

/** Number of rows in one of the catalog's object stores. */
export async function storeCount(page: Page, store: string): Promise<number> {
  return (await readAll(page, store)).length;
}

/**
 * Everything in the catalog that a backup should reproduce, in a stable
 * order: rows (minus fields a restore legitimately resets) and a SHA-256 of
 * each stored original.
 */
export async function catalogDump(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('photo-editor');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all = (name: string) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result as Record<string, unknown>[]);
        req.onerror = () => reject(req.error);
      });
    const hex = async (blob: Blob) =>
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (b) => b.toString(16).padStart(2, '0')).join('');
    const byId = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.id ?? a.photoId).localeCompare(String(b.id ?? b.photoId));
    const photos = (await all('photos')).map(({ thumbVersion, ...rest }) => rest).sort(byId); // eslint-disable-line @typescript-eslint/no-unused-vars
    const edits = (await all('edits')).map(({ updatedAt, ...rest }) => rest).sort(byId); // eslint-disable-line @typescript-eslint/no-unused-vars
    const originals = await Promise.all((await all('originals')).sort(byId).map(async (o) => ({ photoId: o.photoId, sha: await hex(o.blob as Blob) })));
    const result = {
      photos,
      edits,
      originals,
      collections: (await all('collections')).sort(byId),
      snapshots: (await all('snapshots')).sort(byId),
      presets: (await all('presets')).sort(byId),
    };
    db.close();
    return result;
  });
}
