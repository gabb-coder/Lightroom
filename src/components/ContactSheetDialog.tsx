import { useEffect, useRef } from 'react';
import { PAPER_LABELS, sheetLayout, type Orientation, type Paper } from '../model/contactSheet';
import { makeContactSheet, sheetPhotoIds, useContactSheetStore } from '../state/contactSheetStore';
import controls from './controls.module.css';
import dialog from './SettingsDialog.module.css';
import styles from './ContactSheetDialog.module.css';

/**
 * Contact sheet (M34, Library): the selected photos (or the whole grid) on
 * printable pages, each with its edits and its name.
 */
export function ContactSheetDialog() {
  const open = useContactSheetStore((s) => s.open);
  const o = useContactSheetStore((s) => s.options);
  const running = useContactSheetStore((s) => s.running);
  const progress = useContactSheetStore((s) => s.progress);
  const error = useContactSheetStore((s) => s.error);
  const { setOpen, setOptions } = useContactSheetStore.getState();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  if (!open) return null;
  const ids = sheetPhotoIds();
  const layout = sheetLayout(ids.length, o);
  return (
    <div className={dialog.scrim} onClick={(e) => e.target === e.currentTarget && !running && setOpen(false)}>
      <div
        ref={ref}
        className={`${dialog.dialog} ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        data-testid="contact-sheet-dialog"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' && !running) setOpen(false);
        }}
      >
        <h2 id="sheet-title" className={dialog.title}>
          Contact sheet
        </h2>
        <p className={dialog.intro}>
          {ids.length} {ids.length === 1 ? 'photo' : 'photos'} on {layout.pages.length} {layout.pages.length === 1 ? 'page' : 'pages'} ({layout.perPage} per page, {layout.width} × {layout.height} px).
        </p>
        <div className={styles.grid}>
          <label htmlFor="cs-paper">Paper</label>
          <select id="cs-paper" value={o.paper} onChange={(e) => setOptions({ paper: e.target.value as Paper })}>
            {(Object.keys(PAPER_LABELS) as Paper[]).map((p) => (
              <option key={p} value={p}>
                {PAPER_LABELS[p]}
              </option>
            ))}
          </select>
          <label htmlFor="cs-orientation">Orientation</label>
          <select id="cs-orientation" value={o.orientation} onChange={(e) => setOptions({ orientation: e.target.value as Orientation })}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
          <label htmlFor="cs-columns">Columns</label>
          <select id="cs-columns" value={o.columns} onChange={(e) => setOptions({ columns: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <label htmlFor="cs-dpi">Resolution</label>
          <select id="cs-dpi" value={o.dpi} onChange={(e) => setOptions({ dpi: Number(e.target.value) === 300 ? 300 : 150 })}>
            <option value={150}>150 dpi (screen, quick prints)</option>
            <option value={300}>300 dpi (sharp prints)</option>
          </select>
          <label htmlFor="cs-format">Format</label>
          <select id="cs-format" value={o.format} onChange={(e) => setOptions({ format: e.target.value === 'png' ? 'png' : 'jpeg' })}>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>
          <span />
          <label className={styles.check}>
            <input type="checkbox" checked={o.captions} onChange={(e) => setOptions({ captions: e.target.checked })} />
            File names under the photos
          </label>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {running && (
          <div className={styles.track} role="progressbar" aria-label="Contact sheet progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className={styles.bar} style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <div className={styles.buttons}>
          <button type="button" className={controls.button} disabled={running} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className={controls.primary} disabled={running || ids.length === 0} onClick={() => void makeContactSheet(ids, o)}>
            {running ? 'Making…' : 'Make contact sheet'}
          </button>
        </div>
      </div>
    </div>
  );
}
