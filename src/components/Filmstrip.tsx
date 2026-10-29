import { useEffect, useRef, type MouseEvent } from 'react';
import type { PhotoRecord } from '../db/db';
import { FILMSTRIP_FILTERS, type FilmstripFilter } from '../model/organize';
import type { ClickModifiers } from '../model/selection';
import { isMacPlatform } from '../shortcuts/platform';
import { selectFilmstripList, useLibraryStore } from '../state/libraryStore';
import { EditedIcon } from './EditedBadge';
import { PhotoThumb } from './PhotoThumb';
import controls from './controls.module.css';
import styles from './Filmstrip.module.css';

const MAC = isMacPlatform();

interface ItemProps {
  photo: PhotoRecord;
  /** In the selection (Sync, Export). */
  selected: boolean;
  /** The photo open in Develop. */
  focused: boolean;
  onPick: (mods: ClickModifiers) => void;
}

function FilmstripItem({ photo, selected, focused, onPick }: ItemProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focused]);
  const onClick = (e: MouseEvent) => onPick({ toggle: MAC ? e.metaKey : e.ctrlKey, range: e.shiftKey });
  return (
    <button
      ref={ref}
      type="button"
      className={styles.item}
      aria-pressed={selected}
      aria-current={focused ? 'true' : undefined}
      aria-label={photo.fileName}
      onClick={onClick}
    >
      <PhotoThumb photo={photo} dimmed={photo.flag === 'reject'} />
      {photo.edited && (
        <span className={styles.editedBadge}>
          <EditedIcon size={8} color="#ffffff" />
        </span>
      )}
    </button>
  );
}

/**
 * Develop filmstrip: click a photo to edit it (design/Develop.dc.html);
 * Ctrl/Cmd- and Shift-click select several, as in the grid.
 */
export function Filmstrip() {
  const photos = useLibraryStore(selectFilmstripList);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const selection = useLibraryStore((s) => s.selection);
  const clickPhoto = useLibraryStore((s) => s.clickPhoto);
  const order = photos.map((p) => p.id);
  const selectedCount = photos.filter((p) => selection.ids.includes(p.id)).length;
  const filter = useLibraryStore((s) => s.filmstripFilter);
  const setFilter = useLibraryStore((s) => s.setFilmstripFilter);

  return (
    <footer className={styles.filmstrip} aria-label="Filmstrip" data-testid="filmstrip">
      <div className={styles.header}>
        <span>Filmstrip</span>
        <span className="num">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
        <span className="num">{selectedCount} selected</span>
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
          <FilmstripItem
            key={photo.id}
            photo={photo}
            selected={selection.ids.includes(photo.id)}
            focused={photo.id === selectedId}
            onPick={(mods) => clickPhoto(photo.id, mods, order)}
          />
        ))}
      </div>
    </footer>
  );
}
