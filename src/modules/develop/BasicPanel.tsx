import { SliderRow } from '../../components/SliderRow';
import type { BasicSliderKey } from '../../model/editSettings';
import { BASIC_SLIDERS } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import styles from './BasicPanel.module.css';

/** Groups in design order. M1 implements Exposure, Contrast and Saturation. */
const GROUPS: readonly { label: string; keys: readonly BasicSliderKey[] }[] = [
  { label: 'Tone', keys: ['exposure', 'contrast'] },
  { label: 'Presence', keys: ['saturation'] },
];

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
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className={`group-label ${styles.groupLabel}`}>{group.label}</div>
          {group.keys.map((key) => (
            <BasicSlider key={key} sliderKey={key} disabled={!hasPhoto} />
          ))}
        </div>
      ))}
    </>
  );
}
