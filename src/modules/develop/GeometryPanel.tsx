import { useEffect, useRef } from 'react';
import { SliderRow } from '../../components/SliderRow';
import controls from '../../components/controls.module.css';
import { CROP_ASPECTS, type CropAspect } from '../../model/editSettings';
import { CROP_ASPECT_LABELS } from '../../model/historyDisplay';
import { ANGLE_SLIDER } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import styles from './GeometryPanel.module.css';

/** "Crop and geometry" panel (design/Develop.dc.html). */
export function GeometryPanel() {
  const disabled = useDevelopStore((s) => s.photo === null);
  const geometry = useDevelopStore((s) => s.settings.geometry);
  const cropping = useDevelopStore((s) => s.cropping);
  const setAngle = useDevelopStore((s) => s.setAngle);
  const setAspect = useDevelopStore((s) => s.setAspect);
  const setCropping = useDevelopStore((s) => s.setCropping);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  const rotate90 = useDevelopStore((s) => s.rotate90);
  const flipHorizontal = useDevelopStore((s) => s.flipHorizontal);
  const endRef = useRef<HTMLButtonElement>(null);

  // Opening the crop tool reveals these controls if the panel is scrolled away.
  useEffect(() => {
    if (cropping) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cropping]);

  return (
    <>
      <SliderRow
        def={ANGLE_SLIDER}
        value={geometry.angle}
        disabled={disabled}
        onChange={setAngle}
        onDragStart={() => setInteracting(true)}
        onDragEnd={() => setInteracting(false)}
      />
      <div className={styles.aspectRow}>
        <label htmlFor="aspect" className={styles.label}>
          Aspect
        </label>
        <select
          id="aspect"
          className={styles.select}
          value={geometry.aspect}
          disabled={disabled}
          onChange={(e) => setAspect(e.target.value as CropAspect)}
        >
          {CROP_ASPECTS.map((a) => (
            <option key={a} value={a}>
              {CROP_ASPECT_LABELS[a]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.buttons}>
        <button type="button" className={controls.button} aria-pressed={geometry.flipH} disabled={disabled} onClick={flipHorizontal}>
          Flip horizontal
        </button>
        <button type="button" className={controls.button} disabled={disabled} onClick={rotate90}>
          Rotate 90°
        </button>
      </div>
      <button
        ref={endRef}
        type="button"
        className={`${controls.button} ${styles.cropToggle}`}
        aria-pressed={cropping}
        disabled={disabled}
        onClick={() => setCropping(!cropping)}
      >
        {cropping ? 'Done cropping' : 'Edit crop'}
      </button>
    </>
  );
}
