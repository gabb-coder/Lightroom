import { EyedropperIcon } from '../../components/icons';
import { SliderRow } from '../../components/SliderRow';
import controls from '../../components/controls.module.css';
import type { BasicSliderKey, Treatment } from '../../model/editSettings';
import { BASIC_SLIDERS } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import { runAutoTone } from '../../state/editingAids';
import { modifierLabel } from '../../shortcuts/platform';
import styles from './BasicPanel.module.css';

/** White balance eyedropper (W): the next click on the photo makes that spot neutral. */
function WbPicker({ disabled }: { disabled: boolean }) {
  const picking = useDevelopStore((s) => s.wbPicking);
  const setWbPicking = useDevelopStore((s) => s.setWbPicking);
  return (
    <button
      type="button"
      className={styles.groupTool}
      aria-label="White balance picker"
      aria-pressed={picking}
      title="Click a spot that should be neutral gray (W)"
      disabled={disabled}
      onClick={() => setWbPicking(!picking)}
    >
      <EyedropperIcon />
    </button>
  );
}

function AutoToneButton({ disabled }: { disabled: boolean }) {
  return (
    <button type="button" className={`${styles.groupTool} ${styles.autoButton}`} title={`Auto tone (${modifierLabel()}U)`} disabled={disabled} onClick={runAutoTone}>
      Auto
    </button>
  );
}

/** Groups in design order (design/Develop.dc.html). */
const GROUPS: readonly { label: string; keys: readonly BasicSliderKey[] }[] = [
  { label: 'White balance', keys: ['temp', 'tint'] },
  { label: 'Tone', keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'] },
  { label: 'Presence', keys: ['texture', 'clarity', 'dehaze', 'vibrance', 'saturation'] },
];

const TREATMENTS: readonly { id: Treatment; label: string }[] = [
  { id: 'color', label: 'Color' },
  { id: 'bw', label: 'B&W' },
];

function TreatmentRow({ disabled }: { disabled: boolean }) {
  const treatment = useDevelopStore((s) => s.settings.basic.treatment);
  const setTreatment = useDevelopStore((s) => s.setTreatment);
  return (
    <div className={styles.treatment}>
      <span className={styles.treatmentLabel}>Treatment</span>
      <div className={controls.segmented} role="group" aria-label="Treatment">
        {TREATMENTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`${controls.segment} ${controls.segmentWide}`}
            aria-pressed={treatment === id}
            disabled={disabled}
            onClick={() => setTreatment(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BasicSlider({ sliderKey, disabled }: { sliderKey: BasicSliderKey; disabled: boolean }) {
  const value = useDevelopStore((s) => s.settings.basic[sliderKey]);
  const setBasic = useDevelopStore((s) => s.setBasic);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  return (
    <SliderRow
      def={BASIC_SLIDERS[sliderKey]}
      value={value}
      disabled={disabled}
      onChange={(v) => setBasic(sliderKey, v)}
      onDragStart={() => setInteracting(true)}
      onDragEnd={() => setInteracting(false)}
    />
  );
}

export function BasicPanel() {
  const disabled = useDevelopStore((s) => s.photo === null);
  return (
    <>
      <TreatmentRow disabled={disabled} />
      {GROUPS.map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className={styles.groupHeader}>
            <div className={`group-label ${styles.groupLabel}`}>{group.label}</div>
            {group.label === 'White balance' && <WbPicker disabled={disabled} />}
            {group.label === 'Tone' && <AutoToneButton disabled={disabled} />}
          </div>
          {group.keys.map((key) => (
            <BasicSlider key={key} sliderKey={key} disabled={disabled} />
          ))}
        </div>
      ))}
    </>
  );
}
