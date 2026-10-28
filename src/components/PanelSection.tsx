import { useId, useState, type ReactNode } from 'react';
import { ChevronIcon } from './icons';
import styles from './PanelSection.module.css';

interface PanelSectionProps {
  title: string;
  defaultOpen?: boolean;
  /** Shows the "edited" dot when the panel's settings differ from defaults. */
  edited?: boolean;
  /** Extra content at the right of the header, e.g. an add button glyph. */
  trailing?: ReactNode;
  children?: ReactNode;
}

/** Collapsible side-panel section (design/Kit.dc.html "Panel headers"). */
export function PanelSection({ title, defaultOpen = false, edited = false, trailing, children }: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={styles.section} aria-label={title}>
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
        {trailing}
      </button>
      <div id={bodyId} className={styles.body} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
