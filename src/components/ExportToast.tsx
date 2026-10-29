import { cancelRunningExport, useExportStore } from '../state/exportStore';
import styles from './ExportToast.module.css';

/** Export progress toast (design/Kit.dc.html "Export progress"). */
export function ExportToast() {
  const job = useExportStore((s) => s.job);
  if (!job) return null;
  const title =
    job.status === 'running'
      ? `Exporting ${job.index + 1} of ${job.total}`
      : job.status === 'done'
        ? 'Export complete'
        : job.status === 'cancelled'
          ? 'Export cancelled'
          : 'Export failed';
  return (
    <div className={styles.toast} role="status" aria-live="polite" data-testid="export-toast" data-status={job.status}>
      <div className={styles.row}>
        <span className={styles.title}>{title}</span>
        {job.status === 'running' && (
          <button type="button" className={styles.cancel} onClick={cancelRunningExport}>
            Cancel
          </button>
        )}
      </div>
      <div className={styles.track} role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
        <div className={styles.bar} style={{ width: `${job.progress * 100}%` }} />
      </div>
      <span className={styles.detail}>{job.status === 'error' ? job.message : job.fileName}</span>
    </div>
  );
}
