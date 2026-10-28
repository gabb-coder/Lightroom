import { PanelSection } from '../../components/PanelSection';
import { BasicPanel } from './BasicPanel';
import { Histogram } from './Histogram';
import { isBasicEdited } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
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

export function DevelopRightPanel() {
  const basicEdited = useDevelopStore((s) => isBasicEdited(s.settings));
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const resetAll = useDevelopStore((s) => s.resetAll);
  return (
    <aside className={`${layout.side} ${layout.right}`} aria-label="Develop panels" data-testid="right-panel">
      <Histogram />
      {SECTIONS.map(({ title, open }) => (
        <PanelSection key={title} title={title} defaultOpen={open} edited={title === 'Basic' && basicEdited}>
          {title === 'Basic' ? <BasicPanel /> : null}
        </PanelSection>
      ))}
      <div className={styles.spacer} />
      <div className={styles.footer}>
        <button type="button" className={controls.button} disabled>
          Previous
        </button>
        <button type="button" className={controls.button} disabled={!hasPhoto} onClick={resetAll}>
          Reset all
        </button>
      </div>
    </aside>
  );
}
