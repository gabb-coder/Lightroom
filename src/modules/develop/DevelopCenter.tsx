import { BeforeAfterIcon, CropIcon, PickIcon, RejectIcon, StarIcon } from '../../components/icons';
import controls from '../../components/controls.module.css';
import { useFileDrop } from '../../components/useFileDrop';
import { isIdentityGeometry, outputSize } from '../../engine/geometry';
import { COLOR_LABELS } from '../../model/organize';
import { setColorLabel, setFlag, setRating } from '../../state/organizeActions';
import { openImportPicker } from '../../state/importActions';
import { useLibraryStore } from '../../state/libraryStore';
import { useDevelopStore, type LoadedPhoto } from '../../state/developStore';
import { PhotoCanvas } from './PhotoCanvas';
import layout from '../layout.module.css';
import styles from './DevelopCenter.module.css';

const STARS = [1, 2, 3, 4, 5] as const;

/** Rating, flag and color label of the open photo (catalog data, not edit history). */
function OrganizeControls() {
  const photoId = useDevelopStore((s) => s.photo?.id ?? null);
  const record = useLibraryStore((s) => (photoId ? s.photos.find((p) => p.id === photoId) : undefined));
  const disabled = !record;
  const ids = photoId ? [photoId] : [];
  const rating = record?.rating ?? 0;
  const flag = record?.flag ?? null;
  const label = record?.colorLabel ?? null;
  return (
    <>
      <div className={styles.group} role="group" aria-label="Rating">
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            className={styles.star}
            aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={rating === n}
            disabled={disabled}
            onClick={() => void setRating(ids, rating === n ? 0 : n)}
          >
            <StarIcon filled={n <= rating} />
          </button>
        ))}
      </div>
      <div className={styles.group} role="group" aria-label="Flag">
        <button
          type="button"
          className={styles.flag}
          aria-label="Pick"
          aria-pressed={flag === 'pick'}
          disabled={disabled}
          onClick={() => void setFlag(ids, flag === 'pick' ? null : 'pick')}
        >
          <PickIcon />
        </button>
        <button
          type="button"
          className={styles.flag}
          aria-label="Reject"
          aria-pressed={flag === 'reject'}
          disabled={disabled}
          onClick={() => void setFlag(ids, flag === 'reject' ? null : 'reject')}
        >
          <RejectIcon />
        </button>
      </div>
      <div className={styles.group} role="group" aria-label="Color label">
        {COLOR_LABELS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={styles.labelButton}
            style={{ background: l.color }}
            aria-label={`${l.name} label`}
            aria-pressed={label === l.id}
            disabled={disabled}
            onClick={() => void setColorLabel(ids, label === l.id ? null : l.id)}
          />
        ))}
      </div>
    </>
  );
}

function Toolbar() {
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const before = useDevelopStore((s) => s.before);
  const toggleBefore = useDevelopStore((s) => s.toggleBefore);
  const cropping = useDevelopStore((s) => s.cropping);
  const setCropping = useDevelopStore((s) => s.setCropping);
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
      <button
        type="button"
        className={`${controls.button} ${styles.toolButton}`}
        aria-pressed={cropping}
        disabled={!hasPhoto}
        title="Crop (R)"
        onClick={() => setCropping(!cropping)}
      >
        <CropIcon />
        Crop
      </button>
      <div className={styles.spacer} />
      <OrganizeControls />
    </div>
  );
}

function InfoStrip({ photo }: { photo: LoadedPhoto | null }) {
  const geometry = useDevelopStore((s) => s.settings.geometry);
  const out = photo && !isIdentityGeometry(geometry) ? outputSize(photo, geometry) : null;
  return (
    <div className={styles.infoStrip} data-testid="info-strip">
      {photo ? (
        <>
          <span className={styles.fileName}>{photo.name}</span>
          <span>
            {photo.width} × {photo.height}
          </span>
          {out && (
            <span data-testid="output-size">
              Output {out.width} × {out.height}
            </span>
          )}
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
