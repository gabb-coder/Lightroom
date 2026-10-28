import type { ChangeEvent } from 'react';
import { formatSliderValue, isDefaultValue, snapSliderValue, type SliderDef } from '../model/sliders';
import styles from './SliderRow.module.css';

interface SliderRowProps {
  def: SliderDef;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  /** Called when a pointer drag starts; onDragEnd when it is released. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/** Label (78px) · track · value (48px), as in design/Develop.dc.html. */
export function SliderRow({ def, value, disabled = false, onChange, onDragStart, onDragEnd }: SliderRowProps) {
  const inputId = `s-${def.id}`;
  const edited = !isDefaultValue(def, value);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(snapSliderValue(def, Number(e.target.value)));

  const handlePointerDown = () => {
    if (!onDragStart) return;
    onDragStart();
    const end = () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      onDragEnd?.();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    <div className={styles.row}>
      <label htmlFor={inputId} className={styles.label}>
        {def.label}
      </label>
      <div className={styles.trackWrap}>
        <div className={styles.track} style={{ background: def.track }} aria-hidden="true" />
        {def.bipolar && <div className={styles.tick} aria-hidden="true" />}
        <input
          id={inputId}
          className={styles.range}
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value}
          disabled={disabled}
          onChange={handleChange}
          onPointerDown={handlePointerDown}
        />
      </div>
      <output htmlFor={inputId} className={`num ${styles.value}`} data-edited={edited}>
        {formatSliderValue(def, value)}
      </output>
    </div>
  );
}
