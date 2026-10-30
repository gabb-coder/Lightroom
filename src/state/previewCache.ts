import { useEffect, useState } from 'react';
import type { PhotoRecord } from '../db/db';
import { useDevelopStore } from './developStore';
import { renderEditedPreview } from './settingsSync';

/**
 * Edited renders for the viewers (M31): the photo with its current edits at
 * a given long edge, as an object URL. A few are kept (least recently used
 * first out) so going back and forth is instant.
 */
const MAX_ENTRIES = 8;
const cache = new Map<string, Promise<string | null>>();

/** Long edge for showing a photo on this screen: about the screen in device pixels. */
export function screenLongEdge(): number {
  return Math.min(2048, Math.ceil(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1)));
}

/** The photo's own size, for 1:1. */
export function fullLongEdge(photo: Pick<PhotoRecord, 'width' | 'height'>): number {
  return Math.max(photo.width, photo.height);
}

/** Changes to the photo open in Develop show up before they are saved. */
function editKey(photo: PhotoRecord): string {
  const develop = useDevelopStore.getState();
  if (develop.photo?.id !== photo.id) return `${photo.thumbVersion}`;
  return `${photo.thumbVersion}.${develop.history.entries.length}.${develop.history.cursor}`;
}

export function previewUrl(photo: PhotoRecord, longEdge: number): Promise<string | null> {
  const key = `${photo.id}:${editKey(photo)}:${longEdge}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const job = renderEditedPreview(photo.id, longEdge)
    .then((blob) => (blob ? URL.createObjectURL(blob) : null))
    .catch(() => null);
  cache.set(key, job);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    void cache.get(oldest)?.then((u) => u && URL.revokeObjectURL(u));
    cache.delete(oldest);
  }
  return job;
}

/** Object URL of the photo's edited render at `longEdge`, or null while it renders. */
export function usePreviewUrl(photo: PhotoRecord | null, longEdge: number): string | null {
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const key = photo ? `${photo.id}:${photo.thumbVersion}:${longEdge}` : '';
  useEffect(() => {
    if (!photo) return;
    let current = true;
    void previewUrl(photo, longEdge).then((url) => current && url && setLoaded({ key, url }));
    return () => {
      current = false;
    };
  }, [photo, longEdge, key]);
  return loaded?.key === key ? loaded.url : null;
}
