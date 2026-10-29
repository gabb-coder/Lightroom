import { useEffect, useState, type RefObject } from 'react';
import { db, type PhotoRecord } from '../db/db';

/** Object URLs of loaded thumbnails, keyed by photo id; one version per photo. */
const cache = new Map<string, { version: number; url: string }>();
const loading = new Map<string, Promise<string | null>>();

async function loadUrl(photo: Pick<PhotoRecord, 'id' | 'thumbVersion'>): Promise<string | null> {
  const cached = cache.get(photo.id);
  if (cached?.version === photo.thumbVersion) return cached.url;
  const key = `${photo.id}:${photo.thumbVersion}`;
  let job = loading.get(key);
  if (!job) {
    job = db.thumbnails.get(photo.id).then((record) => {
      loading.delete(key);
      if (!record) return null;
      const url = URL.createObjectURL(record.edited ?? record.base);
      const old = cache.get(photo.id);
      if (old && old.version < photo.thumbVersion) URL.revokeObjectURL(old.url);
      if (!old || old.version <= photo.thumbVersion) cache.set(photo.id, { version: photo.thumbVersion, url });
      return url;
    });
    loading.set(key, job);
  }
  return job;
}

/** True once the element has come near the viewport (then stays true). */
function useNearViewport(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}

/** Thumbnail object URL for a photo, loaded from the catalog once its element is near the viewport. */
export function useThumbnailUrl(photo: Pick<PhotoRecord, 'id' | 'thumbVersion'>, ref: RefObject<Element | null>): string | null {
  const near = useNearViewport(ref);
  const cached = cache.get(photo.id);
  const [url, setUrl] = useState<string | null>(cached?.url ?? null);
  const { id, thumbVersion } = photo;

  useEffect(() => {
    if (!near) return;
    let cancelled = false; // a newer version or unmount supersedes this load
    void loadUrl({ id, thumbVersion }).then((u) => {
      if (!cancelled && u) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [near, id, thumbVersion]);

  return url;
}
