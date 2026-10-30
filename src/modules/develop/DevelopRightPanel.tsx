import { PanelSection } from '../../components/PanelSection';
import { useState } from 'react';
import { isIdentityGeometry } from '../../engine/geometry';
import { BasicPanel } from './BasicPanel';
import { GeometryPanel } from './GeometryPanel';
import { ToneCurvePanel } from './ToneCurvePanel';
import { ColorMixerPanel } from './ColorMixerPanel';
import { ColorGradingPanel } from './ColorGradingPanel';
import { MasksPanel } from './MasksPanel';
import { SpotsPanel } from './SpotsPanel';
import { colorGradingParams } from '../../engine/colorGrading';
import { DetailPanel, EffectsPanel } from './DetailEffectsPanels';
import { isIdentityCurveSet } from '../../engine/curve';
import { hslParams } from '../../engine/hsl';
import { Histogram } from './Histogram';
import { DETAIL_SLIDERS, EFFECTS_SLIDERS, isBasicEdited, isGroupEdited } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import { openSyncDialog, pasteFromPrevious } from '../../state/copyPasteStore';
import { useLibraryStore } from '../../state/libraryStore';
import controls from '../../components/controls.module.css';
import layout from '../layout.module.css';
import styles from './DevelopRightPanel.module.css';

/** Develop panels in design order; only Basic starts open. */
const SECTIONS = [
  { title: 'Basic', open: true },
  { title: 'Tone curve', open: false },
  { title: 'Color mixer', open: false },
  { title: 'Color grading', open: false },
  { title: 'Detail', open: false },
  { title: 'Effects', open: false },
  { title: 'Spot removal', open: false },
  { title: 'Masks', open: false },
  { title: 'Crop and geometry', open: false },
] as const;

type EditedFlags = { basicEdited: boolean; curveEdited: boolean; mixerEdited: boolean; gradingEdited: boolean; detailEdited: boolean; effectsEdited: boolean };

const EDITED_FLAGS: Partial<Record<string, (f: EditedFlags) => boolean>> = {
  Basic: (f) => f.basicEdited,
  'Tone curve': (f) => f.curveEdited,
  'Color mixer': (f) => f.mixerEdited,
  'Color grading': (f) => f.gradingEdited,
  Detail: (f) => f.detailEdited,
  Effects: (f) => f.effectsEdited,
};

const PANEL_BODIES: Partial<Record<string, () => React.ReactNode>> = {
  Basic: () => <BasicPanel />,
  'Tone curve': () => <ToneCurvePanel />,
  'Color mixer': () => <ColorMixerPanel />,
  'Color grading': () => <ColorGradingPanel />,
  Detail: () => <DetailPanel />,
  Effects: () => <EffectsPanel />,
};

export function DevelopRightPanel() {
  const basicEdited = useDevelopStore((s) => isBasicEdited(s.settings));
  const geometryEdited = useDevelopStore((s) => !isIdentityGeometry(s.settings.geometry) || s.settings.geometry.aspect !== 'original');
  const curveEdited = useDevelopStore((s) => !isIdentityCurveSet(s.settings.curve));
  const mixerEdited = useDevelopStore((s) => hslParams(s.settings.hsl) !== null);
  const gradingEdited = useDevelopStore((s) => colorGradingParams(s.settings.colorGrading) !== null || s.settings.colorGrading.blending !== 50 || s.settings.colorGrading.balance !== 0);
  const detailEdited = useDevelopStore((s) => isGroupEdited(DETAIL_SLIDERS, s.settings.detail));
  const effectsEdited = useDevelopStore((s) => isGroupEdited(EFFECTS_SLIDERS, s.settings.effects));
  const cropping = useDevelopStore((s) => s.cropping);
  const masksEdited = useDevelopStore((s) => s.settings.masks.length > 0);
  const masksOpen = useDevelopStore((s) => s.masksOpen);
  const spotsEdited = useDevelopStore((s) => s.settings.spots.length > 0);
  const spotsOpen = useDevelopStore((s) => s.spotsOpen);
  const setSpotsOpen = useDevelopStore((s) => s.setSpotsOpen);
  const setMasksOpen = useDevelopStore((s) => s.setMasksOpen);
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
  const hasPrevious = useDevelopStore((s) => s.previousPhotoId !== null);
  // Several photos selected in the filmstrip: "Previous" becomes "Sync…" (as in Lightroom).
  const multiple = useLibraryStore((s) => s.selection.ids.length > 1);
  return (
    <aside className={`${layout.side} ${layout.right}`} aria-label="Develop panels" data-testid="right-panel">
      <Histogram />
      {SECTIONS.map(({ title, open }) =>
        title === 'Masks' ? (
          <PanelSection key={title} title={title} edited={masksEdited} open={masksOpen} onOpenChange={setMasksOpen}>
            <MasksPanel />
          </PanelSection>
        ) : title === 'Spot removal' ? (
          <PanelSection key={title} title={title} edited={spotsEdited} open={spotsOpen} onOpenChange={setSpotsOpen}>
            <SpotsPanel />
          </PanelSection>
        ) : title === 'Crop and geometry' ? (
          <PanelSection key={title} title={title} edited={geometryEdited} open={geometryOpen} onOpenChange={onGeometryOpenChange}>
            <GeometryPanel />
          </PanelSection>
        ) : (
          <PanelSection key={title} title={title} defaultOpen={open} edited={EDITED_FLAGS[title]?.({ basicEdited, curveEdited, mixerEdited, gradingEdited, detailEdited, effectsEdited }) ?? false}>
            {PANEL_BODIES[title]?.() ?? null}
          </PanelSection>
        ),
      )}
      <div className={styles.spacer} />
      <div className={styles.footer}>
        {multiple ? (
          <button type="button" className={controls.button} disabled={!hasPhoto} onClick={openSyncDialog}>
            Sync…
          </button>
        ) : (
          <button type="button" className={controls.button} disabled={!hasPhoto || !hasPrevious} title="Paste the previous photo's settings (except crop)" onClick={() => void pasteFromPrevious()}>
            Previous
          </button>
        )}
        <button type="button" className={controls.button} disabled={!hasPhoto} onClick={resetAll}>
          Reset all
        </button>
      </div>
    </aside>
  );
}
