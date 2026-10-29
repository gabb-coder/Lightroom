import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useViewStore } from '../../state/viewStore';
import styles from './PhotoCanvas.module.css';

/** Keyboard step for the divider (fraction of the photo width). */
const KEY_STEP = 0.02;

/**
 * Split Before/After (M20): a draggable line over the photo; the renderer's
 * display pass shows the original left of it. Before/After labels mark the halves.
 */
export function SplitDivider() {
  const splitAt = useViewStore((s) => s.splitAt);
  const setSplitAt = useViewStore((s) => s.setSplitAt);
  const dragging = useRef(false);

  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    const frame = e.currentTarget.parentElement?.getBoundingClientRect();
    if (frame && frame.width > 0) setSplitAt((e.clientX - frame.left) / frame.width);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // The frame underneath would treat this as a click (zoom) or a pan.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -KEY_STEP : e.key === 'ArrowRight' ? KEY_STEP : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation(); // not "previous / next photo"
    setSplitAt(splitAt + step);
  };

  return (
    <>
      <div className={`${styles.beforeBadge} ${styles.splitBadge}`} data-testid="split-before-badge">
        Before
      </div>
      <div className={`${styles.beforeBadge} ${styles.splitBadge} ${styles.afterBadge}`} data-testid="split-after-badge">
        After
      </div>
      <div
        className={styles.splitter}
        style={{ left: `${splitAt * 100}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Before / After divider"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(splitAt * 100)}
        aria-valuetext={`${Math.round(splitAt * 100)}% Before`}
        data-testid="split-divider"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKeyDown}
      >
        <span className={styles.splitHandle} aria-hidden="true" />
      </div>
    </>
  );
}
