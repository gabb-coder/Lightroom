import { useRef } from 'react';
import type { PhotoRecord } from '../db/db';
import { useThumbnailUrl } from './useThumbnailUrl';
import styles from './PhotoThumb.module.css';

/** A photo's thumbnail, letterboxed on black, loaded lazily. */
export function PhotoThumb({ photo, dimmed = false }: { photo: PhotoRecord; dimmed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const url = useThumbnailUrl(photo, ref);
  return (
    <div ref={ref} className={styles.thumb} data-dimmed={dimmed}>
      {url && <img className={styles.img} src={url} alt="" draggable={false} decoding="async" />}
    </div>
  );
}
