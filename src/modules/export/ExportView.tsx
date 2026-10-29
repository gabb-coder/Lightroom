import { LibraryView } from '../library/LibraryView';
import { ExportDialog } from './ExportDialog';
import styles from './ExportView.module.css';

/** Export module: the dialog over the (inert, dimmed) Library grid, as in design/Export.dc.html. */
export function ExportView() {
  return (
    <div className={styles.export} data-testid="export-view">
      <div className={styles.background} aria-hidden="true" {...{ inert: '' }}>
        <LibraryView />
      </div>
      <div className={styles.scrim}>
        <ExportDialog />
      </div>
    </div>
  );
}
