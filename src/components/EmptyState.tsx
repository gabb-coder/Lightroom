import styles from './EmptyState.module.css';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={styles.emptyState}>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
