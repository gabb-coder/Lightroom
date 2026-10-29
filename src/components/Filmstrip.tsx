import { useEffect, useRef } from 'react';
import type { PhotoRecord } from '../db/db';
import { useLibraryStore, visiblePhotos } from '../state/libraryStore';
import { EditedIcon } from './EditedBadge';
import { PhotoThumb } from './PhotoThumb';
import controls from './controls.module.css';
import styles from './Filmstrip.module.css';

function FilmstripItem({ photo, selected, onPick }: { photo: PhotoRecord; selected: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);
  return (
    <button ref={ref} type="button" className={styles.item} aria-pressed={selected} aria-label={photo.fileName} onClick={onPick}>
      <PhotoThumb photo={photo} dimmed={photo.flag === 'reject'} />
      {photo.edited && (
        <span className={styles.editedBadge}>
          <EditedIcon size={8} color="#ffffff" />
        </span>
      )}
    </button>
  );
}

/** Develop filmstrip: click a photo to edit it (design/Develop.dc.html). */
export function Filmstrip() {
  const all = useLibraryStore((s) => s.photos);
  const view = useLibraryStore((s) => s.view);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const select = useLibraryStore((s) => s.select);
  const photos = visiblePhotos(all, view);

  return (
    <footer className={styles.filmstrip} aria-label="Filmstrip" data-testid="filmstrip">
      <div className={styles.header}>
        <span>Filmstrip</span>
        <span className="num">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
        <span className="num">{selectedId ? 1 : 0} selected</span>
        <div className={styles.spacer} />
        <label htmlFor="fs-filter">Filter</label>
        <select id="fs-filter" className={controls.select} disabled>
          <option>All photos</option>
          <option>Picks</option>
          <option>3 stars and up</option>
          <option>Edited</option>
        </select>
      </div>
      <div className={styles.strip}>
        {photos.length === 0 && <span className={styles.empty}>No photos imported</span>}
        {photos.map((photo) => (
          <FilmstripItem key={photo.id} photo={photo} selected={photo.id === selectedId} onPick={() => select(photo.id)} />
        ))}
      </div>
    </footer>
  );
}
