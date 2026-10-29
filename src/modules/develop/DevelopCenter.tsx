import { BeforeAfterIcon, CropIcon, PickIcon, RejectIcon, StarIcon } from '../../components/icons';
import controls from '../../components/controls.module.css';
import { useFileDrop } from '../../components/useFileDrop';
import { openImportPicker } from '../../state/importActions';
import { useLibraryStore } from '../../state/libraryStore';
import { useDevelopStore, type LoadedPhoto } from '../../state/developStore';
import { PhotoCanvas } from './PhotoCanvas';
import layout from '../layout.module.css';
import styles from './DevelopCenter.module.css';

const STARS = [1, 2, 3, 4, 5] as const;

function Toolbar() {
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const before = useDevelopStore((s) => s.before);
  const toggleBefore = useDevelopStore((s) => s.toggleBefore);
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Photo tools" data-testid="toolbar">
      <button
        type="button"
        className={`${controls.button} ${styles.toolButton}`}
        aria-pressed={before}
        disabled={!hasPhoto}
        title={'Before / After (\\, hold to peek)'}
        onClick={toggleBefore}
      >
        <BeforeAfterIcon />
        Before / After
      </button>
      <button type="button" className={`${controls.button} ${styles.toolButton}`} disabled>
        <CropIcon />
        Crop
      </button>
      <div className={styles.spacer} />
      <div className={styles.group} role="group" aria-label="Rating">
        {STARS.map((n) => (
          <button key={n} type="button" className={styles.star} aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`} disabled>
            <StarIcon filled={false} />
          </button>
        ))}
      </div>
      <div className={styles.group} role="group" aria-label="Flag">
        <button type="button" className={styles.flag} aria-label="Pick" aria-pressed={false} disabled>
          <PickIcon />
        </button>
        <button type="button" className={styles.flag} aria-label="Reject" aria-pressed={false} disabled>
          <RejectIcon />
        </button>
      </div>
    </div>
  );
}

function InfoStrip({ photo }: { photo: LoadedPhoto | null }) {
  return (
    <div className={styles.infoStrip} data-testid="info-strip">
      {photo ? (
        <>
          <span className={styles.fileName}>{photo.name}</span>
          <span>
            {photo.width} × {photo.height}
          </span>
        </>
      ) : (
        <span>No photo open</span>
      )}
    </div>
  );
}

function EmptyStage() {
  const libraryEmpty = useLibraryStore((s) => s.loaded && s.photos.length === 0);
  const importing = useLibraryStore((s) => s.importing);
  const message = useLibraryStore((s) => s.importMessage);
  return (
    <div className={styles.empty}>
      {importing ? (
        <p className={styles.emptyTitle}>
          Importing {importing.done} of {importing.total}…
        </p>
      ) : libraryEmpty ? (
        <>
          <p className={styles.emptyTitle}>No photos yet</p>
          <p className={styles.emptyHint}>Drop JPEG or PNG files here, or import them from your computer.</p>
          <button type="button" className={`${controls.button} ${styles.openButton}`} onClick={openImportPicker}>
            Import photos…
          </button>
        </>
      ) : (
        <>
          <p className={styles.emptyTitle}>No photo open</p>
          <p className={styles.emptyHint}>Pick a photo in the filmstrip, or drop more photos here.</p>
        </>
      )}
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

export function DevelopCenter() {
  const photo = useDevelopStore((s) => s.photo);
  const { dragOver, handlers } = useFileDrop();

  return (
    <main className={`${layout.center} ${styles.center}`} aria-label="Photo canvas">
      <InfoStrip photo={photo} />
      <div className={styles.stage} data-testid="canvas" data-drag-over={dragOver} {...handlers}>
        {photo ? <PhotoCanvas photo={photo} /> : <EmptyStage />}
      </div>
      <Toolbar />
    </main>
  );
}
