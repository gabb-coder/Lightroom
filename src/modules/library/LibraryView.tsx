import { ImportIcon } from '../../components/icons';
import { PhotoThumb } from '../../components/PhotoThumb';
import controls from '../../components/controls.module.css';
import { useFileDrop } from '../../components/useFileDrop';
import { formatBytes, formatDateTime, formatExposure, formatFocalLength } from '../../model/format';
import type { PhotoRecord } from '../../db/db';
import { useAppStore } from '../../state/appStore';
import { openImportPicker } from '../../state/importActions';
import { COLOR_LABELS, labelInfo } from '../../model/organize';
import { setColorLabel } from '../../state/organizeActions';
import { selectLibraryList, THUMB_SIZE, useLibraryStore } from '../../state/libraryStore';
import { LibraryFilterBar } from './LibraryFilterBar';
import { CatalogPanel } from './CatalogPanel';
import { CollectionsPanel } from './CollectionsPanel';
import { KeywordsPanel } from './KeywordsPanel';
import { openCopyDialog, openSyncDialog, pasteSettings, useCopyPasteStore } from '../../state/copyPasteStore';
import layout from '../layout.module.css';
import { LibraryGrid } from './LibraryGrid';
import styles from './LibraryView.module.css';

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
  const selected = useLibraryStore((s) => s.selection.ids.length);
  const importing = useLibraryStore((s) => s.importing);
  const message = useLibraryStore((s) => s.importMessage);
  const thumbSize = useLibraryStore((s) => s.thumbSize);
  const copyMessage = useCopyPasteStore((s) => s.message);
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
      {copyMessage && (
        <span role="status" data-testid="settings-message">
          {copyMessage}
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

/** Sets the color label of every selected photo (click the current label to clear it). */
function LabelPicker() {
  const ids = useLibraryStore((s) => s.selection.ids);
  const current = useLibraryStore((s) => s.photos.find((p) => p.id === s.selectedId)?.colorLabel ?? null);
  return (
    <div className={styles.labelPicker} role="group" aria-label="Set color label">
      {COLOR_LABELS.map((l) => (
        <button
          key={l.id}
          type="button"
          className={styles.labelSwatch}
          style={{ background: l.color }}
          aria-label={`${l.name} label`}
          aria-pressed={current === l.id}
          disabled={ids.length === 0}
          onClick={() => void setColorLabel(ids, current === l.id ? null : l.id)}
        />
      ))}
    </div>
  );
}

/** Copy, paste and sync Develop settings across the selection (Lightroom's Library "Sync Settings"). */
function DevelopSettingsPanel() {
  const hasPhoto = useLibraryStore((s) => s.selectedId !== null);
  const selected = useLibraryStore((s) => s.selection.ids.length);
  const clipboard = useCopyPasteStore((s) => s.clipboard);
  return (
    <section className={styles.developSettings} aria-label="Develop settings">
      <div className={styles.metaTitle}>Develop settings</div>
      <div className={styles.settingsButtons}>
        <button type="button" className={controls.button} disabled={!hasPhoto} onClick={openCopyDialog}>
          Copy settings…
        </button>
        <button
          type="button"
          className={controls.button}
          disabled={selected === 0 || !clipboard}
          title={clipboard ? `Paste settings copied from ${clipboard.from}` : undefined}
          onClick={() => void pasteSettings()}
        >
          Paste
        </button>
      </div>
      <button type="button" className={`${controls.button} ${styles.syncButton}`} disabled={!hasPhoto || selected < 2} onClick={openSyncDialog}>
        Sync settings…
      </button>
    </section>
  );
}

const UNKNOWN = 'Unknown';

/** Camera rows in design order (design/Library.dc.html); "Unknown" when the file doesn't say. */
function exifRows(photo: PhotoRecord): [string, string][] {
  const e = photo.exif;
  return [
    ['Camera', e?.camera ?? UNKNOWN],
    ['Lens', e?.lens ?? UNKNOWN],
    ['Focal length', e?.focalLength ? formatFocalLength(e.focalLength) : UNKNOWN],
    ['Exposure', formatExposure(e?.exposureTime, e?.fNumber) ?? UNKNOWN],
    ['ISO', e?.iso ? String(e.iso) : UNKNOWN],
  ];
}

function DetailsPanel() {
  const photo = useLibraryStore((s) => s.photos.find((p) => p.id === s.selectedId) ?? null);
  const selectedCount = useLibraryStore((s) => s.selection.ids.length);
  const setModule = useAppStore((s) => s.setModule);
  const rows: [string, string][] = photo
    ? [
        ['File name', photo.fileName],
        ['Captured', formatDateTime(photo.captureDate)],
        ['Dimensions', `${photo.width} × ${photo.height}`],
        ...exifRows(photo),
        ['File size', formatBytes(photo.size)],
        ['Rating', photo.rating ? `${photo.rating} of 5` : 'None'],
        ['Flag', photo.flag === 'pick' ? 'Picked' : photo.flag === 'reject' ? 'Rejected' : 'None'],
        ['Label', photo.colorLabel ? (labelInfo(photo.colorLabel)?.name ?? photo.colorLabel) : 'None'],
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
        <div className={styles.metaTitle}>
          Metadata
          {selectedCount > 1 && <span className={`num ${styles.metaCount}`}>{selectedCount} selected</span>}
        </div>
        {photo ? (
          <>
            <dl className={styles.metaList}>
              {rows.map(([k, v]) => (
                <div key={k} className={styles.metaRow}>
                  <dt>{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
            <LabelPicker />
          </>
        ) : (
          <p className={styles.metaEmpty}>No photo selected</p>
        )}
      </section>
      <KeywordsPanel />
      <CollectionsPanel />
      <DevelopSettingsPanel />
    </aside>
  );
}

function NoMatches() {
  const clearFilter = useLibraryStore((s) => s.clearFilter);
  return (
    <div className={styles.noMatches} data-testid="no-matches">
      <span className={styles.noMatchesTitle}>No photos match these filters</span>
      <button type="button" className={controls.button} onClick={clearFilter}>
        Clear filters
      </button>
    </div>
  );
}

export function LibraryView() {
  const all = useLibraryStore((s) => s.photos);
  const loaded = useLibraryStore((s) => s.loaded);
  const photos = useLibraryStore(selectLibraryList);
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
          <>
            <LibraryFilterBar />
            {photos.length === 0 && loaded ? <NoMatches /> : <LibraryGrid photos={photos} />}
          </>
        )}
        <StatusBar shown={photos.length} total={all.length} />
      </main>
      <DetailsPanel />
    </div>
  );
}
