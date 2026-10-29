import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { nudgeWheel, pointFromWheel, wheelFromPoint, wheelGradient } from '../../model/colorWheel';
import styles from './ColorGradingPanel.module.css';

interface ColorWheelProps {
  label: string;
  hue: number;
  sat: number;
  disabled: boolean;
  onChange: (value: { hue: number; sat: number }) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

const SIZE = 150;
const RADIUS = SIZE / 2;
const GRADIENT = wheelGradient();

/**
 * Hue/saturation wheel: drag the puck (or anywhere) to pick a color,
 * double-click to reset, arrow keys to nudge (Shift for bigger steps).
 */
export function ColorWheel({ label, hue, sat, disabled, onChange, onDragStart, onDragEnd }: ColorWheelProps) {
  const dragging = useRef(false);
  const puck = pointFromWheel(hue, sat, RADIUS);

  const fromEvent = (e: PointerEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    const scale = box.width / SIZE;
    return wheelFromPoint((e.clientX - box.left) / scale - RADIUS, (e.clientY - box.top) / scale - RADIUS, RADIUS);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    dragging.current = true;
    onDragStart();
    onChange(fromEvent(e));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onChange(fromEvent(e));
  };
  const end = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onDragEnd();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    const next = nudgeWheel({ hue, sat }, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    onChange(next);
  };

  return (
    <div
      className={styles.wheel}
      style={{ width: SIZE, height: SIZE, background: GRADIENT }}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={sat}
      aria-valuetext={sat === 0 ? 'No color' : `Hue ${hue}°, saturation ${sat}`}
      data-testid="color-wheel"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => !disabled && onChange({ hue: 0, sat: 0 })}
      onKeyDown={onKeyDown}
    >
      <span className={styles.puck} style={{ left: RADIUS + puck.x, top: RADIUS + puck.y, background: sat === 0 ? '#8a8a8a' : `hsl(${hue} ${30 + sat * 0.55}% 55%)` }} />
    </div>
  );
}
