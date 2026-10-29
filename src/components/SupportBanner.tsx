import { useMemo, useState } from 'react';
import { checkSupport, detectSupport } from '../compat';
import styles from './SupportBanner.module.css';

/**
 * Says plainly when this browser lacks something Darkroom needs (M18), and
 * which limits apply. Limits can be dismissed; missing essentials can't.
 */
export function SupportBanner() {
  const report = useMemo(() => checkSupport(detectSupport()), []);
  const [dismissed, setDismissed] = useState(false);
  if (report.missing.length > 0) {
    return (
      <div className={`${styles.banner} ${styles.error}`} role="alert" data-testid="support-banner">
        <strong>Darkroom can’t run in this browser.</strong> It needs: {report.missing.join('; ')}. Try a current version of Chrome, Edge, Firefox or Safari.
      </div>
    );
  }
  if (report.limits.length === 0 || dismissed) return null;
  return (
    <div className={styles.banner} role="status" data-testid="support-banner">
      <span>{report.limits.join(' ')}</span>
      <button type="button" className={styles.dismiss} onClick={() => setDismissed(true)}>
        OK
      </button>
    </div>
  );
}
