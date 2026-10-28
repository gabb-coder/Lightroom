import controls from './controls.module.css';
import styles from './Filmstrip.module.css';

/** Develop filmstrip. Thumbnails arrive in M4, the filter in M5. */
export function Filmstrip() {
  return (
    <footer className={styles.filmstrip} aria-label="Filmstrip" data-testid="filmstrip">
      <div className={styles.header}>
        <span>Filmstrip</span>
        <span className="num">0 photos</span>
        <div className={styles.spacer} />
        <label htmlFor="fs-filter">Filter</label>
        <select id="fs-filter" className={controls.select} disabled>
          <option>All photos</option>
          <option>Picks</option>
          <option>3 stars and up</option>
          <option>Edited</option>
        </select>
      </div>
      <div className={styles.strip}>
        <span className={styles.empty}>No photos imported</span>
      </div>
    </footer>
  );
}
