import { useState } from 'react';
import { SliderRow } from '../../components/SliderRow';
import controls from '../../components/controls.module.css';
import { HSL_COLORS, type HslColor } from '../../model/editSettings';
import { hslSliderDef, type HslProp } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import styles from './ColorMixerPanel.module.css';

const TABS: readonly { id: HslProp; label: string }[] = [
  { id: 'hue', label: 'Hue' },
  { id: 'sat', label: 'Saturation' },
  { id: 'lum', label: 'Luminance' },
];

function MixerSlider({ color, prop, disabled }: { color: HslColor; prop: HslProp; disabled: boolean }) {
  const value = useDevelopStore((s) => s.settings.hsl[color][prop]);
  const setHsl = useDevelopStore((s) => s.setHsl);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  return (
    <SliderRow
      def={hslSliderDef(color, prop)}
      value={value}
      disabled={disabled}
      onChange={(v) => setHsl(color, prop, v)}
      onDragStart={() => setInteracting(true)}
      onDragEnd={() => setInteracting(false)}
    />
  );
}

/** Color mixer (design/Develop.dc.html): Hue / Saturation / Luminance tabs over 8 color ranges. */
export function ColorMixerPanel() {
  const [tab, setTab] = useState<HslProp>('hue');
  const disabled = useDevelopStore((s) => s.photo === null);
  return (
    <>
      <div className={`${controls.segmented} ${styles.tabs}`} role="group" aria-label="Color mixer property">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`${controls.segment} ${styles.tab}`} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="group" aria-label={`${TABS.find((t) => t.id === tab)?.label ?? ''} by color`}>
        {HSL_COLORS.map((c) => (
          <MixerSlider key={`${tab}-${c}`} color={c} prop={tab} disabled={disabled} />
        ))}
      </div>
    </>
  );
}
