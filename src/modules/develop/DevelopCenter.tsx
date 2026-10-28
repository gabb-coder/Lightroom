import { useRef, useState, type DragEvent } from 'react';
import { BeforeAfterIcon, CropIcon, PickIcon, RejectIcon, StarIcon } from '../../components/icons';
import controls from '../../components/controls.module.css';
import { ACCEPTED_TYPES } from '../../io/loadPhoto';
import { useDevelopStore, type LoadedPhoto } from '../../state/developStore';
import { PhotoCanvas } from './PhotoCanvas';
import { usePhotoOpener } from './usePhotoOpener';
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

function EmptyStage({ onOpen, error }: { onOpen: () => void; error: string | null }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>No photo open</p>
      <p className={styles.emptyHint}>Drop a JPEG or PNG here, or open one from your computer.</p>
      <button type="button" className={`${controls.button} ${styles.openButton}`} onClick={onOpen}>
        Open photo…
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function DevelopCenter() {
  const photo = useDevelopStore((s) => s.photo);
  const { openFiles, error } = usePhotoOpener();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void openFiles(e.dataTransfer.files);
  };

  return (
    <main className={`${layout.center} ${styles.center}`} aria-label="Photo canvas">
      <InfoStrip photo={photo} />
      <div
        className={styles.stage}
        data-testid="canvas"
        data-drag-over={dragOver}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {photo ? <PhotoCanvas photo={photo} /> : <EmptyStage onOpen={() => inputRef.current?.click()} error={error} />}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-input"
        onChange={(e) => {
          void openFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <Toolbar />
    </main>
  );
}
