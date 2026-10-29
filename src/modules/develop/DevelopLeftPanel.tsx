import controls from '../../components/controls.module.css';
import { openCopyDialog, pasteSettings, useCopyPasteStore } from '../../state/copyPasteStore';
import { useDevelopStore } from '../../state/developStore';
import layout from '../layout.module.css';
import { HistoryPanel } from './HistoryPanel';
import { Navigator } from './Navigator';
import { PresetsPanel } from './PresetsPanel';
import { SnapshotsPanel } from './SnapshotsPanel';
import styles from './DevelopLeftPanel.module.css';

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
      <SnapshotsPanel />
      <HistoryPanel />
      <CopyPaste />
    </aside>
  );
}
