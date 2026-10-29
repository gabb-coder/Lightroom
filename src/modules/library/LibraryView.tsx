import { ImportIcon, PhotosIcon, RecentIcon } from '../../components/icons';
import { PhotoThumb } from '../../components/PhotoThumb';
import controls from '../../components/controls.module.css';
import { useFileDrop } from '../../components/useFileDrop';
import { formatBytes, formatDateTime } from '../../model/format';
import { useAppStore } from '../../state/appStore';
import { openImportPicker } from '../../state/importActions';
import { latestBatchId, THUMB_SIZE, useLibraryStore, visiblePhotos, type CatalogView } from '../../state/libraryStore';
import layout from '../layout.module.css';
import { LibraryGrid } from './LibraryGrid';
import styles from './LibraryView.module.css';

function CatalogPanel() {
  const photos = useLibraryStore((s) => s.photos);
  const view = useLibraryStore((s) => s.view);
  const setView = useLibraryStore((s) => s.setView);
  const batch = latestBatchId(photos);
  const items: { id: CatalogView; label: string; Icon: () => React.JSX.Element; count: number }[] = [
    { id: 'all', label: 'All photographs', Icon: PhotosIcon, count: photos.length },
    { id: 'previous', label: 'Previous import', Icon: RecentIcon, count: photos.filter((p) => p.batchId === batch).length },
  ];
  return (
    <aside className={`${layout.side} ${layout.left} ${styles.catalog}`} aria-label="Catalog" data-testid="left-panel">
      <div className={`group-label ${styles.navGroup}`}>Catalog</div>
      {items.map(({ id, label, Icon, count }) => (
        <button
          key={id}
          type="button"
          className={styles.navItem}
          aria-current={view === id ? 'page' : undefined}
          onClick={() => setView(id)}
        >
          <Icon />
          <span className={styles.navLabel}>{label}</span>
          <span className={`num ${styles.navCount}`}>{count}</span>
        </button>
      ))}
    </aside>
  );
}

/** Empty-library drop zone (design/Kit.dc.html "Empty library"). */
function DropZone() {
  return (
    <div className={styles.dropZone} data-testid="drop-zone">
      <span className={styles.dropIcon}>
        <ImportIcon size={28} />
      </span>
      <span className={styles.dropTitle}>Drop photos here to import</span>
      <span className={styles.dropHint}>JPEG and PNG. Originals stay untouched.</span>
      <button type="button" className={`${controls.primary} ${styles.dropButton}`} onClick={openImportPicker}>
        Choose files
      </button>
    </div>
  );
}

function StatusBar({ shown, total }: { shown: number; total: number }) {
  const selected = useLibraryStore((s) => (s.selectedId ? 1 : 0));
  const importing = useLibraryStore((s) => s.importing);
  const message = useLibraryStore((s) => s.importMessage);
  const thumbSize = useLibraryStore((s) => s.thumbSize);
  const setThumbSize = useLibraryStore((s) => s.setThumbSize);
  return (
    <div className={`num ${styles.statusBar}`} data-testid="status-bar">
      <span>
        {shown} of {total} photos
      </span>
      <span>{selected} selected</span>
      {importing && (
        <span role="status">
          Importing {importing.done} of {importing.total}…
        </span>
      )}
      {message && (
        <span role="alert" className={styles.statusMessage}>
          {message}
        </span>
      )}
      <div className={styles.spacer} />
      <label htmlFor="thumbsize">Thumbnails</label>
      <input
        id="thumbsize"
        className={styles.sizeSlider}
        type="range"
        min={THUMB_SIZE.min}
        max={THUMB_SIZE.max}
        step={THUMB_SIZE.step}
        value={thumbSize}
        onChange={(e) => setThumbSize(Number(e.target.value))}
      />
    </div>
  );
}

function DetailsPanel() {
  const photo = useLibraryStore((s) => s.photos.find((p) => p.id === s.selectedId) ?? null);
  const setModule = useAppStore((s) => s.setModule);
  const rows: [string, string][] = photo
    ? [
        ['File name', photo.fileName],
        ['Captured', formatDateTime(photo.captureDate)],
        ['Dimensions', `${photo.width} × ${photo.height}`],
        ['File size', formatBytes(photo.size)],
        ['Imported', formatDateTime(photo.importedAt)],
      ]
    : [];
  return (
    <aside className={`${layout.side} ${layout.right}`} aria-label="Photo details" data-testid="right-panel">
      <section className={styles.preview} aria-label="Preview">
        <div className={styles.previewBox}>{photo && <PhotoThumb key={photo.id} photo={photo} />}</div>
        <button type="button" className={`${controls.primary} ${styles.editButton}`} disabled={!photo} onClick={() => setModule('develop')}>
          Edit in Develop
        </button>
      </section>
      <section className={styles.metadata} aria-label="Metadata">
        <div className={styles.metaTitle}>Metadata</div>
        {photo ? (
          <dl className={styles.metaList}>
            {rows.map(([k, v]) => (
              <div key={k} className={styles.metaRow}>
                <dt>{k}</dt>
                <dd className="num">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={styles.metaEmpty}>No photo selected</p>
        )}
      </section>
    </aside>
  );
}

export function LibraryView() {
  const all = useLibraryStore((s) => s.photos);
  const loaded = useLibraryStore((s) => s.loaded);
  const view = useLibraryStore((s) => s.view);
  const photos = visiblePhotos(all, view);
  const { dragOver, handlers } = useFileDrop();

  return (
    <div className={`${layout.row} ${styles.row}`} data-testid="library-view">
      <CatalogPanel />
      <main className={`${layout.center} ${styles.center}`} aria-label="Photo grid" data-drag-over={dragOver} {...handlers}>
        {loaded && all.length === 0 ? (
          <div className={styles.emptyGrid}>
            <DropZone />
          </div>
        ) : (
          <LibraryGrid photos={photos} />
        )}
        <StatusBar shown={photos.length} total={all.length} />
      </main>
      <DetailsPanel />
    </div>
  );
}
