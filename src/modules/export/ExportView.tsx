import { EmptyState } from '../../components/EmptyState';
import styles from './ExportView.module.css';

export function ExportView() {
  return (
    <section className={styles.export} aria-label="Export" data-testid="export-view">
      <EmptyState title="Nothing to export yet" hint="Select photos in the Library to export them." />
    </section>
  );
}
