import { useEffect, useRef } from 'react';
import type { PhotoRecord } from '../db/db';
import { FILMSTRIP_FILTERS, type FilmstripFilter } from '../model/organize';
import { selectFilmstripList, useLibraryStore } from '../state/libraryStore';
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
  const photos = useLibraryStore(selectFilmstripList);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const select = useLibraryStore((s) => s.select);
  const filter = useLibraryStore((s) => s.filmstripFilter);
  const setFilter = useLibraryStore((s) => s.setFilmstripFilter);

  return (
    <footer className={styles.filmstrip} aria-label="Filmstrip" data-testid="filmstrip">
      <div className={styles.header}>
        <span>Filmstrip</span>
        <span className="num">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
        <span className="num">{selectedId && photos.some((p) => p.id === selectedId) ? 1 : 0} selected</span>
        <div className={styles.spacer} />
        <label htmlFor="fs-filter">Filter</label>
        <select id="fs-filter" className={controls.select} value={filter} onChange={(e) => setFilter(e.target.value as FilmstripFilter)}>
          {FILMSTRIP_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.strip}>
        {photos.length === 0 && <span className={styles.empty}>{filter === 'all' ? 'No photos imported' : 'No photos match this filter'}</span>}
        {photos.map((photo) => (
          <FilmstripItem key={photo.id} photo={photo} selected={photo.id === selectedId} onPick={() => select(photo.id)} />
        ))}
      </div>
    </footer>
  );
}
