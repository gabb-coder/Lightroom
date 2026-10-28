import { PanelSection, SidePanel } from '../../components/SidePanel';
import { EmptyState } from '../../components/EmptyState';
import styles from './DevelopView.module.css';

const LEFT_SECTIONS = ['Navigator', 'Presets', 'History', 'Copy / Paste'] as const;
const RIGHT_SECTIONS = ['Basic', 'Tone Curve', 'Color Mixer', 'Detail', 'Effects'] as const;

export function DevelopView() {
  return (
    <div className={styles.develop} data-testid="develop-view">
      <SidePanel side="left" label="Develop navigation">
        {LEFT_SECTIONS.map((title) => (
          <PanelSection key={title} title={title} />
        ))}
      </SidePanel>

      <section className={styles.center} aria-label="Photo canvas">
        <div className={styles.infoStrip} data-testid="info-strip">
          <span>No photo selected</span>
        </div>
        <div className={styles.canvas} data-testid="canvas">
          <EmptyState title="No photo open" hint="Import photos in the Library to start editing." />
        </div>
        <div className={styles.toolbar} data-testid="toolbar" role="toolbar" aria-label="Canvas tools" />
      </section>

      <SidePanel side="right" label="Develop adjustments">
        <div className={styles.histogram} data-testid="histogram" aria-label="Histogram" role="img" />
        {RIGHT_SECTIONS.map((title) => (
          <PanelSection key={title} title={title} />
        ))}
      </SidePanel>
    </div>
  );
}
