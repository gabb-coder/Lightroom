import controls from '../../components/controls.module.css';
import { openCopyDialog, pasteSettings, useCopyPasteStore } from '../../state/copyPasteStore';
import { useDevelopStore } from '../../state/developStore';
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

function CopyPaste() {
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const clipboard = useCopyPasteStore((s) => s.clipboard);
  return (
    <div className={styles.copyPaste}>
      <button type="button" className={controls.button} disabled={!hasPhoto} onClick={openCopyDialog}>
        Copy settings…
      </button>
      <button
        type="button"
        className={controls.button}
        disabled={!hasPhoto || !clipboard}
        title={clipboard ? `Paste settings copied from ${clipboard.from}` : undefined}
        onClick={() => void pasteSettings()}
      >
        Paste
      </button>
    </div>
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
      <CopyPaste />
    </aside>
  );
}
