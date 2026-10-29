import { useRef, type PointerEvent } from 'react';

/** Pointer movement (px) before a label press counts as a scrub instead of a click. */
const SCRUB_THRESHOLD_PX = 3;

interface ScrubHandlers {
  /** Called with the horizontal distance from the press point while scrubbing. */
  onScrub: (dx: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

/** Pointer handlers that turn a sideways drag on an element into scrub events. */
export function useLabelScrub({ onScrub, onScrubStart, onScrubEnd }: ScrubHandlers, disabled: boolean) {
  const drag = useRef<{ startX: number; scrubbing: boolean } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, scrubbing: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.scrubbing) {
      if (Math.abs(dx) < SCRUB_THRESHOLD_PX) return;
      d.scrubbing = true;
      onScrubStart();
    }
    onScrub(dx);
  };

  const finish = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d?.scrubbing) onScrubEnd();
  };

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
