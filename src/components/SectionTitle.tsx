import { useId, type ReactNode } from 'react';
import { useSectionOpen } from '../state/sectionStore';
import { ChevronIcon } from './icons';
import styles from './SectionTitle.module.css';

interface SectionTitleProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Id of the element it shows and hides. */
  controls: string;
  /** The heading's own look (Library panels have two: bold titles and small caps groups). */
  className?: string;
  /** Shown after the title inside the toggle (e.g. "2 selected"). */
  extra?: ReactNode;
  /** Buttons at the right, outside the toggle (e.g. "New collection"). */
  actions?: ReactNode;
}

/** A collapsible Library section heading (M22): the whole title toggles its section. */
export function SectionTitle({ title, open, onToggle, controls, className, extra, actions }: SectionTitleProps) {
  return (
    <div className={`${className ?? ''} ${styles.row}`}>
      <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={controls} onClick={onToggle}>
        <ChevronIcon open={open} />
        <span>{title}</span>
        {extra}
      </button>
      {actions}
    </div>
  );
}

interface CollapsibleSectionProps {
  /** Remembered open state key (state/sectionStore.ts). */
  id: string;
  title: string;
  /** Accessible name of the section, when it differs from the title. */
  label?: string;
  className?: string;
  titleClassName?: string;
  extra?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/** A Library panel section that collapses and remembers it (M22). */
export function CollapsibleSection({ id, title, label, className, titleClassName, extra, actions, children }: CollapsibleSectionProps) {
  const [open, toggle] = useSectionOpen(id);
  const bodyId = useId();
  return (
    <section className={className} aria-label={label ?? title} data-open={open}>
      <SectionTitle title={title} open={open} onToggle={toggle} controls={bodyId} className={titleClassName} extra={extra} actions={actions} />
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
