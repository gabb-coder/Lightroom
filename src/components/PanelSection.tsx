import { useId, useState, type ReactNode } from 'react';
import { ChevronIcon } from './icons';
import styles from './PanelSection.module.css';

interface PanelSectionProps {
  title: string;
  defaultOpen?: boolean;
  /** Shows the "edited" dot when the panel's settings differ from defaults. */
  edited?: boolean;
  /** Buttons at the right of the header, outside the toggle (e.g. "New preset"). */
  actions?: ReactNode;
  /** "list" uses the tighter padding of the Presets list (design). */
  variant?: 'default' | 'list';
  children?: ReactNode;
}

/** Collapsible side-panel section (design/Kit.dc.html "Panel headers"). */
export function PanelSection({ title, defaultOpen = false, edited = false, actions, variant = 'default', children }: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.header}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronIcon open={open} />
          <span className={styles.title}>{title}</span>
          {edited && <span className={styles.editedDot} role="img" aria-label="Edited" />}
        </button>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <div id={bodyId} className={styles.body} data-variant={variant} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
