import { useState, type FormEvent } from 'react';
import { PanelSection } from '../../components/PanelSection';
import controls from '../../components/controls.module.css';
import { useDevelopStore } from '../../state/developStore';
import { MAX_SNAPSHOT_NAME, nextSnapshotName } from '../../model/snapshots';
import { applySnapshot, createSnapshot, deleteSnapshot, useSnapshotStore } from '../../state/snapshotStore';
import presetStyles from './PresetsPanel.module.css';
import styles from './SnapshotsPanel.module.css';

function NewSnapshotForm({ onDone }: { onDone: () => void }) {
  const snapshots = useSnapshotStore((s) => s.snapshots);
  const [name, setName] = useState(() => nextSnapshotName(snapshots));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void createSnapshot(name).then(onDone);
  };
  return (
    <form className={presetStyles.form} onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onDone()} aria-label="New snapshot">
      <input
        className={presetStyles.nameInput}
        type="text"
        aria-label="Snapshot name"
        value={name}
        maxLength={MAX_SNAPSHOT_NAME}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setName(e.target.value)}
      />
      <div className={presetStyles.formButtons}>
        <button type="button" className={controls.button} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={`${controls.primary} ${presetStyles.saveButton}`} disabled={!name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * Snapshots (M13): named states of this photo's settings. Click one to go
 * back to it (one undoable step); × deletes it.
 */
export function SnapshotsPanel() {
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const snapshots = useSnapshotStore((s) => s.snapshots);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <PanelSection
      title="Snapshots"
      variant="list"
      open={open || creating}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreating(false);
      }}
      actions={
        <button
          type="button"
          className={presetStyles.addButton}
          aria-label="Create snapshot"
          title="Save the current settings as a snapshot"
          disabled={!hasPhoto || creating}
          onClick={() => {
            setOpen(true);
            setCreating(true);
          }}
        >
          +
        </button>
      }
    >
      {creating && <NewSnapshotForm onDone={() => setCreating(false)} />}
      {snapshots.length === 0 && !creating && <p className={styles.empty}>{hasPhoto ? 'Use + to save how this photo looks now.' : 'No photo open'}</p>}
      <ul className={styles.list}>
        {snapshots.map((snapshot) => (
          <li key={snapshot.id} className={styles.row}>
            <button type="button" className={`${presetStyles.preset} ${styles.item}`} onClick={() => applySnapshot(snapshot)}>
              {snapshot.name}
            </button>
            <button type="button" className={styles.delete} aria-label={`Delete snapshot ${snapshot.name}`} onClick={() => void deleteSnapshot(snapshot.id)}>
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}
