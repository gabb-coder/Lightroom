import { useState } from 'react';
import { SliderRow } from '../../components/SliderRow';
import controls from '../../components/controls.module.css';
import { GRADE_REGIONS, type GradeRegion } from '../../model/editSettings';
import { GRADE_REGION_LABELS, gradeSliderDef, GRADING_SLIDERS } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import { ColorWheel } from './ColorWheel';
import styles from './ColorGradingPanel.module.css';

function WheelSlider({ region, prop, disabled }: { region: GradeRegion; prop: 'hue' | 'sat' | 'lum'; disabled: boolean }) {
  const value = useDevelopStore((s) => s.settings.colorGrading[region][prop]);
  const setGradeWheel = useDevelopStore((s) => s.setGradeWheel);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  return (
    <SliderRow
      def={gradeSliderDef(region, prop)}
      value={value}
      disabled={disabled}
      onChange={(v) => setGradeWheel(region, { [prop]: v }, prop)}
      onDragStart={() => setInteracting(true)}
      onDragEnd={() => setInteracting(false)}
    />
  );
}

function ParamSlider({ param, disabled }: { param: 'blending' | 'balance'; disabled: boolean }) {
  const value = useDevelopStore((s) => s.settings.colorGrading[param]);
  const setGradeParam = useDevelopStore((s) => s.setGradeParam);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  return (
    <SliderRow
      def={GRADING_SLIDERS[param]}
      value={value}
      disabled={disabled}
      onChange={(v) => setGradeParam(param, v)}
      onDragStart={() => setInteracting(true)}
      onDragEnd={() => setInteracting(false)}
    />
  );
}

/** Small dot in a region tab: the wheel's color, when it has one. */
function TabDot({ region }: { region: GradeRegion }) {
  const wheel = useDevelopStore((s) => s.settings.colorGrading[region]);
  if (wheel.sat === 0 && wheel.lum === 0) return null;
  return <span className={styles.tabDot} aria-hidden="true" style={{ background: wheel.sat === 0 ? '#9e9e9e' : `hsl(${wheel.hue} 70% 55%)` }} />;
}

/**
 * Color grading (M14): pick a region, drag its wheel (hue and saturation)
 * and set its luminance; blending and balance shape the tonal ranges.
 */
export function ColorGradingPanel() {
  const [region, setRegion] = useState<GradeRegion>('shadows');
  const disabled = useDevelopStore((s) => s.photo === null);
  const wheel = useDevelopStore((s) => s.settings.colorGrading[region]);
  const setGradeWheel = useDevelopStore((s) => s.setGradeWheel);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  const name = GRADE_REGION_LABELS[region];

  return (
    <>
      <div className={`${controls.segmented} ${styles.tabs}`} role="group" aria-label="Color grading range">
        {GRADE_REGIONS.map((r) => (
          <button key={r} type="button" className={`${controls.segment} ${styles.tab}`} aria-pressed={region === r} onClick={() => setRegion(r)}>
            {GRADE_REGION_LABELS[r]}
            <TabDot region={r} />
          </button>
        ))}
      </div>
      <div className={styles.wheelBox}>
        <ColorWheel
          key={region}
          label={`${name} color`}
          hue={wheel.hue}
          sat={wheel.sat}
          disabled={disabled}
          onChange={(v) => setGradeWheel(region, v, 'wheel')}
          onDragStart={() => setInteracting(true)}
          onDragEnd={() => setInteracting(false)}
        />
      </div>
      <div role="group" aria-label={`${name} adjustments`}>
        <WheelSlider key={`${region}-hue`} region={region} prop="hue" disabled={disabled} />
        <WheelSlider key={`${region}-sat`} region={region} prop="sat" disabled={disabled} />
        <WheelSlider key={`${region}-lum`} region={region} prop="lum" disabled={disabled} />
      </div>
      <div role="group" aria-label="Tonal ranges">
        <div className={`group-label ${styles.groupLabel}`}>Ranges</div>
        <ParamSlider param="blending" disabled={disabled} />
        <ParamSlider param="balance" disabled={disabled} />
      </div>
    </>
  );
}
