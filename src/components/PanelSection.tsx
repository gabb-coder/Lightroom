import { useId, useRef, useState, type ReactNode } from 'react';
import { ChevronIcon } from './icons';
import styles from './PanelSection.module.css';

interface PanelSectionProps {
  title: string;
  defaultOpen?: boolean;
  /** Shows the "edited" dot when the panel's settings differ from defaults. */
  edited?: boolean;
  /** Buttons at the right of the header, outside the toggle (e.g. "New preset"). */
  actions?: ReactNode;
  /** Controlled open state (optional); otherwise the section manages it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "list" uses the tighter padding of the Presets list (design). */
  variant?: 'default' | 'list';
  children?: ReactNode;
}

/** Collapsible side-panel section (design/Kit.dc.html "Panel headers"). */
export function PanelSection({
  title,
  defaultOpen = false,
  edited = false,
  actions,
  variant = 'default',
  open: controlledOpen,
  onOpenChange,
  children,
}: PanelSectionProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const bodyId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Opening a section near the bottom of a scrolling panel brings its contents into view.
    if (next) requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: 'nearest' }));
  };

  return (
    <section ref={sectionRef} className={styles.section} aria-label={title}>
      <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.header}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
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
