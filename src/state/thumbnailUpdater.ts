import { db } from '../db/db';
import { isEdited } from '../model/compare';
import type { EditSettings } from '../model/editSettings';
import { encodeThumbnail } from '../workers/thumbnailClient';
import { useDevelopStore } from './developStore';
import { usePreviewStore, type RenderedPreview } from './previewStore';

/** Wait this long after the last render before re-encoding the thumbnail. */
const THUMBNAIL_DELAY_MS = 500;

/** Settings each photo's stored thumbnail was last made from (this session). */
const thumbnailSettings = new Map<string, EditSettings>();

async function updateThumbnail(preview: RenderedPreview): Promise<void> {
  const { photoId, settings } = preview;
  if (thumbnailSettings.get(photoId) === settings) return;
  thumbnailSettings.set(photoId, settings);
  if (!isEdited(settings)) {
    const record = await db.thumbnails.get(photoId);
    if (!record?.edited) return;
    await db.thumbnails.update(photoId, { edited: null });
  } else {
    const blob = await encodeThumbnail(preview.image);
    await db.thumbnails.update(photoId, { edited: blob });
  }
  const photo = await db.photos.get(photoId);
  if (photo) await db.photos.update(photoId, { thumbVersion: photo.thumbVersion + 1 });
}

/**
 * Keeps the open photo's grid/filmstrip thumbnail in step with its edits,
 * using the renderer's latest full-quality preview (no extra GPU work).
 */
export function startThumbnailUpdater(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = usePreviewStore.subscribe((s) => {
    if (timer) clearTimeout(timer);
    const preview = s.preview;
    if (!preview) return;
    timer = setTimeout(() => {
      // Only if it still shows the current settings of the open photo.
      const { photo, settings } = useDevelopStore.getState();
      if (photo?.id === preview.photoId && settings === preview.settings) void updateThumbnail(preview).catch(() => undefined);
    }, THUMBNAIL_DELAY_MS);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
