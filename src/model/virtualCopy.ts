import type { PhotoRecord } from '../db/db';

/**
 * Virtual copies (M13): extra catalog entries that share their master's
 * stored original but have their own edits, history, ratings and snapshots.
 */

/** The photo whose original is used: the master of a copy, else the photo itself. */
export const masterIdOf = (p: Pick<PhotoRecord, 'id' | 'masterId'>): string => p.masterId ?? p.id;

/** "IMG_0418.jpg", or "IMG_0418.jpg (Copy 1)" for a virtual copy. */
export function displayName(p: Pick<PhotoRecord, 'fileName' | 'copyName'>): string {
  return p.copyName ? `${p.fileName} (${p.copyName})` : p.fileName;
}

/** Next free copy number for a master: one past the highest existing "Copy N". */
export function nextCopyNumber(photos: readonly Pick<PhotoRecord, 'masterId' | 'copyName'>[], masterId: string): number {
  let max = 0;
  for (const p of photos) {
    if (p.masterId !== masterId) continue;
    const n = Number(/^Copy (\d+)$/.exec(p.copyName ?? '')?.[1] ?? 0);
    max = Math.max(max, n);
  }
  return max + 1;
}

/**
 * Sort position right after the master and its earlier copies: import order
 * is a float, so copies slot in between the master and the next photo.
 */
export function copyImportIndex(masterIndex: number, copyNumber: number): number {
  return masterIndex + Math.min(copyNumber, 999) / 1000;
}
