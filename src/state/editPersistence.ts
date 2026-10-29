import { db } from '../db/db';
import { isEdited } from '../model/compare';
import { currentSettings, type History } from '../model/history';
import { useDevelopStore } from './developStore';

/** Edits are written this long after the last change (and on photo switch / page hide). */
export const SAVE_DELAY_MS = 300;

let pending: { photoId: string; history: History } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> = Promise.resolve();

function setSaveState(state: 'pending' | 'saved'): void {
  // Exposed for tests and future UI ("Saved") — not used for logic.
  document.documentElement.dataset.saveState = state;
}

async function write(photoId: string, history: History): Promise<void> {
  await db.transaction('rw', db.edits, db.photos, async () => {
    await db.edits.put({ photoId, history, updatedAt: Date.now() });
    await db.photos.update(photoId, { edited: isEdited(currentSettings(history)) });
  });
}

/** Writes any pending edit now. Resolves when it is stored. */
export function flushEdits(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const job = pending;
  pending = null;
  if (job) inFlight = inFlight.then(() => write(job.photoId, job.history)).catch(() => undefined);
  return inFlight.then(() => {
    if (!pending) setSaveState('saved');
  });
}

/** Saves the open photo's history whenever it changes (debounced). */
export function startEditPersistence(): () => void {
  setSaveState('saved');
  const unsubscribe = useDevelopStore.subscribe((s, prev) => {
    // Loading a photo changes history too, but there is nothing new to save.
    if (!s.photo || s.photo !== prev.photo || s.history === prev.history) return;
    pending = { photoId: s.photo.id, history: s.history };
    setSaveState('pending');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushEdits(), SAVE_DELAY_MS);
  });
  const onHide = () => void flushEdits();
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onHide);
  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onHide);
  };
}
