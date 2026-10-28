import controls from '../../components/controls.module.css';
import layout from '../layout.module.css';
import { HistoryPanel } from './HistoryPanel';
import { PresetsPanel } from './PresetsPanel';
import styles from './DevelopLeftPanel.module.css';

const ZOOMS = ['Fit', 'Fill', '1:1'] as const;

function Navigator() {
  return (
    <section className={styles.navigator} aria-label="Navigator">
      <div className={styles.navHeader}>
        <span className={styles.title}>Navigator</span>
        <div className={controls.segmented} role="group" aria-label="Zoom">
          {ZOOMS.map((zoom) => (
            <button key={zoom} type="button" className={controls.segment} aria-pressed={zoom === 'Fit'} disabled>
              {zoom}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.navPreview} data-testid="navigator-preview" />
    </section>
  );
}

export function DevelopLeftPanel() {
  return (
    <aside
      className={`${layout.side} ${layout.left}`}
      aria-label="Navigator, presets and history"
      data-testid="left-panel"
    >
      <Navigator />
      <PresetsPanel />
      <HistoryPanel />
      <div className={styles.copyPaste}>
        <button type="button" className={controls.button} disabled>
          Copy settings…
        </button>
        <button type="button" className={controls.button} disabled>
          Paste
        </button>
      </div>
    </aside>
  );
}
