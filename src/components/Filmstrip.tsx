import styles from './Filmstrip.module.css';

/** Bottom strip of photo thumbnails. Filled in M4. */
export function Filmstrip() {
  return (
    <footer className={styles.filmstrip} aria-label="Filmstrip" data-testid="filmstrip">
      <span className={styles.empty}>No photos imported</span>
    </footer>
  );
}
