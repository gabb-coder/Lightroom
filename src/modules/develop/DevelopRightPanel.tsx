import { PanelSection } from '../../components/PanelSection';
import { useState } from 'react';
import { isIdentityGeometry } from '../../engine/geometry';
import { BasicPanel } from './BasicPanel';
import { GeometryPanel } from './GeometryPanel';
import { ToneCurvePanel } from './ToneCurvePanel';
import { ColorMixerPanel } from './ColorMixerPanel';
import { isIdentityCurveSet } from '../../engine/curve';
import { hslParams } from '../../engine/hsl';
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

type EditedFlags = { basicEdited: boolean; curveEdited: boolean; mixerEdited: boolean };

const EDITED_FLAGS: Partial<Record<string, (f: EditedFlags) => boolean>> = {
  Basic: (f) => f.basicEdited,
  'Tone curve': (f) => f.curveEdited,
  'Color mixer': (f) => f.mixerEdited,
};

const PANEL_BODIES: Partial<Record<string, () => React.ReactNode>> = {
  Basic: () => <BasicPanel />,
  'Tone curve': () => <ToneCurvePanel />,
  'Color mixer': () => <ColorMixerPanel />,
};

export function DevelopRightPanel() {
  const basicEdited = useDevelopStore((s) => isBasicEdited(s.settings));
  const geometryEdited = useDevelopStore((s) => !isIdentityGeometry(s.settings.geometry) || s.settings.geometry.aspect !== 'original');
  const curveEdited = useDevelopStore((s) => !isIdentityCurveSet(s.settings.curve));
  const mixerEdited = useDevelopStore((s) => hslParams(s.settings.hsl) !== null);
  const cropping = useDevelopStore((s) => s.cropping);
  const setCropping = useDevelopStore((s) => s.setCropping);
  const [geometryPanelOpen, setGeometryPanelOpen] = useState(false);
  // The Crop tool (toolbar, R) shows this panel; collapsing it ends cropping.
  const geometryOpen = geometryPanelOpen || cropping;
  const onGeometryOpenChange = (next: boolean) => {
    setGeometryPanelOpen(next);
    if (!next) setCropping(false);
  };
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const resetAll = useDevelopStore((s) => s.resetAll);
  return (
    <aside className={`${layout.side} ${layout.right}`} aria-label="Develop panels" data-testid="right-panel">
      <Histogram />
      {SECTIONS.map(({ title, open }) =>
        title === 'Crop and geometry' ? (
          <PanelSection key={title} title={title} edited={geometryEdited} open={geometryOpen} onOpenChange={onGeometryOpenChange}>
            <GeometryPanel />
          </PanelSection>
        ) : (
          <PanelSection key={title} title={title} defaultOpen={open} edited={EDITED_FLAGS[title]?.({ basicEdited, curveEdited, mixerEdited }) ?? false}>
            {PANEL_BODIES[title]?.() ?? null}
          </PanelSection>
        ),
      )}
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
