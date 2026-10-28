import type { ReactNode } from 'react';
import styles from './SidePanel.module.css';

interface SidePanelProps {
  side: 'left' | 'right';
  label: string;
  children: ReactNode;
}

/** Fixed-width column on either side of the center area. */
export function SidePanel({ side, label, children }: SidePanelProps) {
  return (
    <aside className={`${styles.sidePanel} ${styles[side]}`} aria-label={label} data-testid={`${side}-panel`}>
      {children}
    </aside>
  );
}

interface PanelSectionProps {
  title: string;
  children?: ReactNode;
}

/** A titled section inside a side panel. Becomes collapsible in M2. */
export function PanelSection({ title, children }: PanelSectionProps) {
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{title}</h2>
      {children && <div className={styles.content}>{children}</div>}
    </section>
  );
}
