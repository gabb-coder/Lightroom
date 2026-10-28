import { PanelSection } from '../../components/PanelSection';
import { BasicPanel } from './BasicPanel';
import controls from '../../components/controls.module.css';
import layout from '../layout.module.css';
import styles from './DevelopRightPanel.module.css';

/** Develop panels in design order; only Basic starts open. */
const SECTIONS = [
  { title: 'Basic', open: true },
  { title: 'Tone curve', open: false },
  { title: 'Color mixer', open: false },
  { title: 'Detail', open: false },
  { title: 'Effects', open: false },
  { title: 'Crop and geometry', open: false },
] as const;

function Histogram() {
  return (
    <section className={styles.histogram} aria-label="Histogram">
      <div className={styles.histBox} data-testid="histogram">
        <svg viewBox="0 0 268 84" preserveAspectRatio="none" role="img" aria-label="Histogram (no photo)">
          <path d="M0 21H268M0 42H268M0 63H268M67 0V84M134 0V84M201 0V84" stroke="#262626" strokeWidth="1" />
        </svg>
      </div>
    </section>
  );
}

export function DevelopRightPanel() {
  return (
    <aside className={`${layout.side} ${layout.right}`} aria-label="Develop panels" data-testid="right-panel">
      <Histogram />
      {SECTIONS.map(({ title, open }) => (
        <PanelSection key={title} title={title} defaultOpen={open}>
          {title === 'Basic' ? <BasicPanel /> : null}
        </PanelSection>
      ))}
      <div className={styles.spacer} />
      <div className={styles.footer}>
        <button type="button" className={controls.button} disabled>
          Previous
        </button>
        <button type="button" className={controls.button} disabled>
          Reset all
        </button>
      </div>
    </aside>
  );
}
