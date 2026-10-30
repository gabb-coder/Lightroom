import { SliderRow } from '../../components/SliderRow';
import type { DetailKey, EffectsKey } from '../../model/editSettings';
import { DETAIL_SLIDERS, EFFECTS_SLIDERS } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import styles from './BasicPanel.module.css';

interface Group<K extends string> {
  label: string;
  keys: readonly K[];
}

/** Groups in design order (design/Develop.dc.html). */
const DETAIL_GROUPS: readonly Group<DetailKey>[] = [
  { label: 'Sharpening', keys: ['sharpAmount', 'sharpRadius'] },
  { label: 'Noise reduction', keys: ['nrLuma', 'nrColor'] },
];
const EFFECTS_GROUPS: readonly Group<EffectsKey>[] = [
  { label: 'Vignette', keys: ['vignette'] },
  { label: 'Grain', keys: ['grain', 'grainSize'] },
];

function DetailSlider({ sliderKey, disabled }: { sliderKey: DetailKey; disabled: boolean }) {
  const value = useDevelopStore((s) => s.settings.detail[sliderKey]);
  const setDetail = useDevelopStore((s) => s.setDetail);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  return (
    <SliderRow
      def={DETAIL_SLIDERS[sliderKey]}
      value={value}
      disabled={disabled}
      onChange={(v) => setDetail(sliderKey, v)}
      onDragStart={() => setInteracting(true)}
      onDragEnd={() => setInteracting(false)}
    />
  );
}

function EffectsSlider({ sliderKey, disabled }: { sliderKey: EffectsKey; disabled: boolean }) {
  const value = useDevelopStore((s) => s.settings.effects[sliderKey]);
  const setEffect = useDevelopStore((s) => s.setEffect);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  return (
    <SliderRow
      def={EFFECTS_SLIDERS[sliderKey]}
      value={value}
      disabled={disabled}
      onChange={(v) => setEffect(sliderKey, v)}
      onDragStart={() => setInteracting(true)}
      onDragEnd={() => setInteracting(false)}
    />
  );
}

function GroupLabel({ label }: { label: string }) {
  return <div className={`group-label ${styles.groupLabel}`}>{label}</div>;
}

export function DetailPanel() {
  const disabled = useDevelopStore((s) => s.photo === null);
  return DETAIL_GROUPS.map((group) => (
    <div key={group.label} role="group" aria-label={group.label}>
      <GroupLabel label={group.label} />
      {group.keys.map((key) => (
        <DetailSlider key={key} sliderKey={key} disabled={disabled} />
      ))}
    </div>
  ));
}

export function EffectsPanel() {
  const disabled = useDevelopStore((s) => s.photo === null);
  return EFFECTS_GROUPS.map((group) => (
    <div key={group.label} role="group" aria-label={group.label}>
      <GroupLabel label={group.label} />
      {group.keys.map((key) => (
        <EffectsSlider key={key} sliderKey={key} disabled={disabled} />
      ))}
    </div>
  ));
}
