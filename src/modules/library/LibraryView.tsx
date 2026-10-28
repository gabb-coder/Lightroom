import { ImportIcon, PhotosIcon, RecentIcon } from '../../components/icons';
import controls from '../../components/controls.module.css';
import layout from '../layout.module.css';
import styles from './LibraryView.module.css';

const CATALOG = [
  { label: 'All photographs', Icon: PhotosIcon, current: true },
  { label: 'Previous import', Icon: RecentIcon, current: false },
] as const;

function CatalogPanel() {
  return (
    <aside className={`${layout.side} ${layout.left} ${styles.catalog}`} aria-label="Catalog" data-testid="left-panel">
      <div className={`group-label ${styles.navGroup}`}>Catalog</div>
      {CATALOG.map(({ label, Icon, current }) => (
        <button key={label} type="button" className={styles.navItem} aria-current={current ? 'page' : undefined}>
          <Icon />
          <span className={styles.navLabel}>{label}</span>
          <span className={`num ${styles.navCount}`}>0</span>
        </button>
      ))}
    </aside>
  );
}

/** Empty-library drop zone (design/Kit.dc.html "Empty library"). Wired up in M4. */
function DropZone() {
  return (
    <div className={styles.dropZone} data-testid="drop-zone">
      <span className={styles.dropIcon}>
        <ImportIcon size={28} />
      </span>
      <span className={styles.dropTitle}>Drop photos here to import</span>
      <span className={styles.dropHint}>JPEG and PNG. Originals stay untouched.</span>
      <button type="button" className={`${controls.primary} ${styles.dropButton}`} disabled>
        Choose files
      </button>
    </div>
  );
}

function DetailsPanel() {
  return (
    <aside className={`${layout.side} ${layout.right}`} aria-label="Photo details" data-testid="right-panel">
      <section className={styles.preview} aria-label="Preview">
        <div className={styles.previewBox} />
        <button type="button" className={`${controls.primary} ${styles.editButton}`} disabled>
          Edit in Develop
        </button>
      </section>
      <section className={styles.metadata} aria-label="Metadata">
        <div className={styles.metaTitle}>Metadata</div>
        <p className={styles.metaEmpty}>No photo selected</p>
      </section>
    </aside>
  );
}

export function LibraryView() {
  return (
    <div className={`${layout.row} ${styles.row}`} data-testid="library-view">
      <CatalogPanel />
      <main className={`${layout.center} ${styles.center}`} aria-label="Photo grid">
        <div className={styles.grid}>
          <DropZone />
        </div>
        <div className={`num ${styles.statusBar}`} data-testid="status-bar">
          <span>0 of 0 photos</span>
          <span>0 selected</span>
        </div>
      </main>
      <DetailsPanel />
    </div>
  );
}
