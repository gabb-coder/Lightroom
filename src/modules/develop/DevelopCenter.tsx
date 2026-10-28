import { BeforeAfterIcon, CropIcon, PickIcon, RejectIcon, StarIcon } from '../../components/icons';
import controls from '../../components/controls.module.css';
import layout from '../layout.module.css';
import styles from './DevelopCenter.module.css';

const STARS = [1, 2, 3, 4, 5] as const;

function Toolbar() {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Photo tools" data-testid="toolbar">
      <button type="button" className={`${controls.button} ${styles.toolButton}`} aria-pressed={false} disabled>
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

export function DevelopCenter() {
  return (
    <main className={`${layout.center} ${styles.center}`} aria-label="Photo canvas">
      <div className={styles.infoStrip} data-testid="info-strip">
        <span>No photo open</span>
      </div>
      <div className={styles.stage} data-testid="canvas">
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No photo open</p>
          <p className={styles.emptyHint}>Import photos in the Library to start editing.</p>
        </div>
      </div>
      <Toolbar />
    </main>
  );
}
