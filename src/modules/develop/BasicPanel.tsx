import { SliderRow } from '../../components/SliderRow';
import controls from '../../components/controls.module.css';
import type { BasicSliderKey, Treatment } from '../../model/editSettings';
import { BASIC_SLIDERS } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import styles from './BasicPanel.module.css';

/** Groups in design order (design/Develop.dc.html). */
const GROUPS: readonly { label: string; keys: readonly BasicSliderKey[] }[] = [
  { label: 'White balance', keys: ['temp', 'tint'] },
  { label: 'Tone', keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'] },
  { label: 'Presence', keys: ['vibrance', 'saturation'] },
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
          <div className={`group-label ${styles.groupLabel}`}>{group.label}</div>
          {group.keys.map((key) => (
            <BasicSlider key={key} sliderKey={key} disabled={disabled} />
          ))}
        </div>
      ))}
    </>
  );
}
