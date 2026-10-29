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
