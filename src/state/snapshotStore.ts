import { liveQuery, type Subscription } from 'dexie';
import { create } from 'zustand';
import { db, type SnapshotRecord } from '../db/db';
import { parseEditSettings } from '../model/validate';
import { normalizeSnapshotName } from '../model/snapshots';
import { useDevelopStore } from './developStore';

/**
 * Snapshots (M13): named, saved settings of the photo open in Develop.
 * Applying one is a single history step, so it can be undone.
 */
interface SnapshotState {
  /** Snapshots of the open photo, oldest first. */
  snapshots: readonly SnapshotRecord[];
  setSnapshots: (snapshots: readonly SnapshotRecord[]) => void;
}

export const useSnapshotStore = create<SnapshotState>()((set) => ({
  snapshots: [],
  setSnapshots: (snapshots) => set({ snapshots }),
}));

/** Saves the open photo's current settings as a snapshot. */
export async function createSnapshot(rawName: string): Promise<void> {
  const { photo, settings } = useDevelopStore.getState();
  const name = normalizeSnapshotName(rawName);
  if (!photo || !name) return;
  await db.snapshots.add({ id: crypto.randomUUID(), photoId: photo.id, name, settings: structuredClone(settings), createdAt: Date.now() });
}

/** Applies a snapshot to the open photo as one history step ("Snapshot: name"). */
export function applySnapshot(snapshot: SnapshotRecord): void {
  const develop = useDevelopStore.getState();
  if (develop.photo?.id !== snapshot.photoId) return;
  develop.applySettings(`Snapshot: ${snapshot.name}`, parseEditSettings(snapshot.settings));
}

export async function deleteSnapshot(id: string): Promise<void> {
  await db.snapshots.delete(id);
}

/** Keeps the store's list in step with the open photo. */
export function startSnapshotSync(): () => void {
  let subscription: Subscription | null = null;
  let photoId: string | null = null;
  const follow = (id: string | null) => {
    if (id === photoId) return;
    photoId = id;
    subscription?.unsubscribe();
    subscription = null;
    useSnapshotStore.getState().setSnapshots([]);
    if (!id) return;
    subscription = liveQuery(() => db.snapshots.where('photoId').equals(id).sortBy('createdAt')).subscribe({
      next: (rows) => useSnapshotStore.getState().setSnapshots(rows),
      error: () => useSnapshotStore.getState().setSnapshots([]),
    });
  };
  follow(useDevelopStore.getState().photo?.id ?? null);
  const unsubscribe = useDevelopStore.subscribe((s) => follow(s.photo?.id ?? null));
  return () => {
    unsubscribe();
    subscription?.unsubscribe();
  };
}
