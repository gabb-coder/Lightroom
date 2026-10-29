import { useEffect, useRef } from 'react';
import { deletionSet } from '../model/virtualCopy';
import { deletePhotos } from '../state/catalogActions';
import { useDeleteDialogStore } from '../state/deleteDialogStore';
import { neighborId, selectLibraryList, useLibraryStore } from '../state/libraryStore';
import controls from './controls.module.css';
import styles from './SettingsDialog.module.css';

const photos = (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'}`;

/** "Its virtual copy goes too." / "Their 3 virtual copies go too." */
function copyText(chosen: number, copies: number): string {
  if (copies === 0) return '';
  const owner = chosen === 1 ? 'Its' : 'Their';
  return copies === 1 ? `${owner} virtual copy goes too. ` : `${owner} ${copies} virtual copies go too. `;
}

/**
 * Confirms removing photos from the catalog (M17). Says exactly what goes:
 * the photos, their virtual copies, edits and snapshots, in this browser
 * only.
 */
export function DeletePhotosDialog() {
  const ids = useDeleteDialogStore((s) => s.ids);
  const close = useDeleteDialogStore((s) => s.close);
  const all = useLibraryStore((s) => s.photos);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (ids) cancelRef.current?.focus();
  }, [ids]);

  if (!ids) return null;
  const doomed = deletionSet(all, ids);
  const copies = doomed.length - ids.length;

  const confirm = async () => {
    close();
    // Afterwards, select the photo that followed the last removed one.
    const library = useLibraryStore.getState();
    const list = selectLibraryList(library);
    const remaining = list.filter((p) => !doomed.includes(p.id));
    const lastIndex = Math.max(...doomed.map((id) => list.findIndex((p) => p.id === id)));
    const next = list.slice(lastIndex + 1).find((p) => !doomed.includes(p.id)) ?? remaining[remaining.length - 1];
    await deletePhotos(ids);
    useLibraryStore.getState().select(next?.id ?? neighborId(remaining, null, 1));
  };

  return (
    <div className={styles.scrim}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-text"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
      >
        <h2 id="delete-title" className={styles.title}>
          Remove {photos(ids.length)} from the catalog?
        </h2>
        <p id="delete-text" className={styles.intro}>
          {copyText(ids.length, copies)}
          The originals, edits and snapshots stored in this browser are deleted. Files on your computer are not touched.
        </p>
        <div className={styles.footer}>
          <button ref={cancelRef} type="button" className={controls.button} onClick={close}>
            Cancel
          </button>
          <button type="button" className={`${controls.primary} ${styles.action} ${styles.danger}`} onClick={() => void confirm()}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
