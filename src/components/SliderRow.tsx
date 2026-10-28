import { useRef, type ChangeEvent } from 'react';
import { formatSliderValue, scrubSliderValue, snapSliderValue, type SliderDef } from '../model/sliders';
import { useLabelScrub } from './useLabelScrub';
import { ValueField } from './ValueField';
import styles from './SliderRow.module.css';

interface SliderRowProps {
  def: SliderDef;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  /** Called when a drag or scrub starts; onDragEnd when it is released. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * Label (78px) · track · value (48px), as in design/Develop.dc.html.
 * Double-click the label or track to reset, drag the label to scrub, click
 * the value to type.
 */
export function SliderRow({ def, value, disabled = false, onChange, onDragStart, onDragEnd }: SliderRowProps) {
  const inputId = `s-${def.id}`;
  const scrubStart = useRef(value);
  const reset = () => {
    if (!disabled) onChange(def.defaultValue);
  };

  const scrub = useLabelScrub(
    {
      onScrubStart: () => {
        scrubStart.current = value;
        onDragStart?.();
      },
      onScrub: (dx) => onChange(scrubSliderValue(def, scrubStart.current, dx)),
      onScrubEnd: () => onDragEnd?.(),
    },
    disabled,
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(snapSliderValue(def, Number(e.target.value)));

  const handleTrackPointerDown = () => {
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
    <div className={styles.row} data-testid={`slider-${def.id}`}>
      <label
        htmlFor={inputId}
        className={styles.label}
        data-disabled={disabled}
        title="Drag to adjust, double-click to reset"
        onDoubleClick={reset}
        {...scrub}
      >
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
          aria-valuetext={formatSliderValue(def, value)}
          disabled={disabled}
          onChange={handleChange}
          onPointerDown={handleTrackPointerDown}
          onDoubleClick={reset}
        />
      </div>
      <ValueField def={def} value={value} disabled={disabled} onCommit={onChange} />
    </div>
  );
}
