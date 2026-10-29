import { useEffect, useRef } from 'react';
import { SETTINGS_PANELS, type SettingsPanel } from '../model/copySettings';
import { confirmSettingsDialog, useCopyPasteStore } from '../state/copyPasteStore';
import { useLibraryStore } from '../state/libraryStore';
import { settingsSourceId, syncTargets } from '../state/settingsSync';
import controls from './controls.module.css';
import styles from './SettingsDialog.module.css';

const COPY = { title: 'Copy settings', action: 'Copy' };
const SYNC = { title: 'Synchronize settings', action: 'Synchronize' };

function PanelChecklist() {
  const panels = useCopyPasteStore((s) => s.panels);
  const setPanels = useCopyPasteStore((s) => s.setPanels);
  const toggle = (id: SettingsPanel, on: boolean) => setPanels(on ? [...panels, id] : panels.filter((p) => p !== id));
  return (
    <fieldset className={styles.panels}>
      <legend className={styles.legend}>Panels</legend>
      {SETTINGS_PANELS.map(({ id, label }) => (
        <label key={id} className={styles.check}>
          <input type="checkbox" checked={panels.includes(id)} onChange={(e) => toggle(id, e.target.checked)} />
          {label}
        </label>
      ))}
      <div className={styles.all}>
        <button type="button" className={controls.button} onClick={() => setPanels(SETTINGS_PANELS.map((p) => p.id))}>
          Check all
        </button>
        <button type="button" className={controls.button} onClick={() => setPanels([])}>
          Check none
        </button>
      </div>
    </fieldset>
  );
}

/**
 * The "Copy settings…" and "Sync settings…" dialog: tick which Develop
 * panels to take from the source photo. Modal over the whole app.
 */
export function SettingsDialog() {
  const mode = useCopyPasteStore((s) => s.dialog);
  const close = useCopyPasteStore((s) => s.closeDialog);
  const nothingTicked = useCopyPasteStore((s) => s.panels.length === 0);
  // Re-read when the dialog opens; the selection cannot change while it is modal.
  const sourceName = useLibraryStore((s) => s.photos.find((p) => p.id === (mode ? settingsSourceId() : null))?.fileName ?? '');
  const sourceCopy = useLibraryStore((s) => s.photos.find((p) => p.id === (mode ? settingsSourceId() : null))?.copyName);
  const targetCount = mode === 'sync' ? syncTargets().length : 0;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode) dialogRef.current?.focus();
  }, [mode]);

  if (!mode) return null;
  const text = mode === 'copy' ? COPY : SYNC;
  const source = sourceCopy ? `${sourceName} (${sourceCopy})` : sourceName;
  const intro =
    mode === 'copy'
      ? `Choose what to copy from ${source}.`
      : `From ${source} to ${targetCount} other selected ${targetCount === 1 ? 'photo' : 'photos'}. Each photo gets one undoable step.`;

  return (
    <div className={styles.scrim}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
      >
        <h2 id="settings-dialog-title" className={styles.title}>
          {text.title}
        </h2>
        <p className={styles.intro}>{intro}</p>
        <PanelChecklist />
        <div className={styles.footer}>
          <button type="button" className={controls.button} onClick={close}>
            Cancel
          </button>
          <button type="button" className={`${controls.primary} ${styles.action}`} disabled={nothingTicked} onClick={() => void confirmSettingsDialog()}>
            {text.action}
          </button>
        </div>
      </div>
    </div>
  );
}
