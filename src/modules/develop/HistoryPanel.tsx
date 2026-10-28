import { historyEntryValue } from '../../model/historyDisplay';
import { useDevelopStore } from '../../state/developStore';
import styles from './HistoryPanel.module.css';

type RowState = 'current' | 'done' | 'undone';

/** History list, newest first (design/Develop.dc.html). Click a step to go back to it. */
export function HistoryPanel() {
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const history = useDevelopStore((s) => s.history);
  const goToHistory = useDevelopStore((s) => s.goToHistory);
  const count = history.entries.length;
  const rows = hasPhoto ? history.entries.map((entry, index) => ({ entry, index })).reverse() : [];

  return (
    <section className={styles.history} aria-label="History" data-testid="history">
      <div className={styles.header}>
        <span className={styles.title}>History</span>
        {hasPhoto && (
          <span className={`num ${styles.count}`}>
            {count} {count === 1 ? 'step' : 'steps'}
          </span>
        )}
      </div>
      <ol className={styles.list}>
        {rows.map(({ entry, index }) => {
          const state: RowState = index === history.cursor ? 'current' : index > history.cursor ? 'undone' : 'done';
          return (
            <li key={index}>
              <button
                type="button"
                className={styles.row}
                data-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => goToHistory(index)}
              >
                <span className={styles.label}>{entry.label}</span>
                <span className="num">{historyEntryValue(entry)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
