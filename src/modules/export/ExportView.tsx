import styles from './ExportView.module.css';

/** Placeholder. M7 turns Export into the dialog from design/Export.dc.html,
    shown over the photo grid. */
export function ExportView() {
  return (
    <main className={styles.export} aria-label="Export" data-testid="export-view">
      <div className={styles.empty}>
        <p className={styles.title}>Nothing to export yet</p>
        <p className={styles.hint}>Select photos in the Library to export them.</p>
      </div>
    </main>
  );
}
