import { useEffect, useRef, useState } from 'react';
import controls from '../../components/controls.module.css';
import { CollapsibleSection } from '../../components/SectionTitle';
import { formatBytes } from '../../model/format';
import { downloadBackup, requestPersistence, restoreBackup, storageInfo, type StorageInfo } from '../../state/catalogActions';
import styles from './LibraryView.module.css';

type Busy = { label: string; done: number; total: number } | null;

/**
 * Catalog safety (M17), at the bottom of the Library's left panel: back up
 * to one file, restore from one, and how much this browser is storing.
 */
export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  const refresh = () => void storageInfo().then(setStorage);
  useEffect(refresh, []);

  const run = async (label: string, work: (progress: (done: number, total: number) => void) => Promise<string>) => {
    setMessage(null);
    setBusy({ label, done: 0, total: 0 });
    try {
      setMessage(await work((done, total) => setBusy({ label, done, total })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const backup = () =>
    void run('Backing up', async (progress) => {
      await downloadBackup(progress);
      return 'Backup saved to your downloads.';
    });

  const restore = (file: File) =>
    void run('Restoring', async (progress) => {
      const r = await restoreBackup(file, progress);
      const parts = [`Restored ${r.added} ${r.added === 1 ? 'photo' : 'photos'}`];
      if (r.collections) parts.push(`${r.collections} ${r.collections === 1 ? 'collection' : 'collections'}`);
      if (r.presets) parts.push(`${r.presets} ${r.presets === 1 ? 'preset' : 'presets'}`);
      let text = `${parts.join(', ')}.`;
      if (r.skipped) text += ` ${r.skipped} already in the catalog.`;
      if (r.failed) text += ` ${r.failed} could not be restored.`;
      return text;
    });

  return (
    <CollapsibleSection id="library.backup" title="Backup" className={styles.backup} titleClassName={`group-label ${styles.navGroup}`}>
      <div className={styles.backupButtons}>
        <button type="button" className={controls.button} disabled={busy !== null} onClick={backup}>
          Back up catalog
        </button>
        <button type="button" className={controls.button} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          Restore…
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        aria-label="Backup file to restore"
        data-testid="restore-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) restore(file);
        }}
      />
      {busy && (
        <p className={`num ${styles.backupStatus}`} role="status">
          {busy.label}
          {busy.total > 0 ? ` ${busy.done} of ${busy.total}…` : '…'}
        </p>
      )}
      {message && (
        <p className={styles.backupStatus} role="status" data-testid="backup-message">
          {message}
        </p>
      )}
      {storage?.usage != null && (
        <p className={`num ${styles.backupStatus}`} data-testid="storage-usage">
          Using {formatBytes(storage.usage)}
          {storage.quota ? ` of ${formatBytes(storage.quota)}` : ''} in this browser.
        </p>
      )}
      {storage?.persisted === false && (
        <p className={styles.backupStatus}>
          The browser may clear this data when space runs low.{' '}
          <button type="button" className={styles.linkButton} onClick={() => void requestPersistence().then(refresh)}>
            Ask to keep it
          </button>
        </p>
      )}
    </CollapsibleSection>
  );
}
