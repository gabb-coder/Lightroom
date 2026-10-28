import { PanelSection, SidePanel } from '../../components/SidePanel';
import { EmptyState } from '../../components/EmptyState';
import styles from './LibraryView.module.css';

export function LibraryView() {
  return (
    <div className={styles.library} data-testid="library-view">
      <SidePanel side="left" label="Library navigation">
        <PanelSection title="Catalog" />
      </SidePanel>
      <section className={styles.grid} aria-label="Photo grid">
        <EmptyState title="Your library is empty" hint="Import photos to get started." />
      </section>
      <SidePanel side="right" label="Library details">
        <PanelSection title="Metadata" />
      </SidePanel>
    </div>
  );
}
