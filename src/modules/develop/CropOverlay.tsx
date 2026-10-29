import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { moveCrop, resizeCrop, type CropHandle, type Size } from '../../model/crop';
import type { Rect } from '../../model/editSettings';
import { useDevelopStore } from '../../state/developStore';
import styles from './CropOverlay.module.css';

const HANDLES: readonly CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_NAMES: Readonly<Record<CropHandle, string>> = {
  n: 'top edge',
  s: 'bottom edge',
  e: 'right edge',
  w: 'left edge',
  ne: 'top-right corner',
  nw: 'top-left corner',
  se: 'bottom-right corner',
  sw: 'bottom-left corner',
};

/** Nudge per arrow key press (normalized); Shift = 5×. */
const KEY_STEP = 0.01;

interface Drag {
  mode: 'move' | CropHandle;
  start: Rect;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crop rectangle over the whole straightened image: drag inside to move,
 * drag a handle to resize, rule-of-thirds guides. Arrow keys move the crop;
 * Enter or Escape finishes.
 */
export function CropOverlay({ oriented }: { oriented: Size }) {
  const geometry = useDevelopStore((s) => s.settings.geometry);
  const setCrop = useDevelopStore((s) => s.setCrop);
  const setCropping = useDevelopStore((s) => s.setCropping);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const c = geometry.cropRect;

  /** Starts a move (crop box) or resize (handle, from its data-handle). */
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box) return;
    const mode = (e.currentTarget.dataset.handle as CropHandle | undefined) ?? 'move';
    drag.current = { mode, start: c, x: e.clientX, y: e.clientY, width: box.width, height: box.height };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / d.width;
    const dy = (e.clientY - d.y) / d.height;
    setCrop(d.mode === 'move' ? moveCrop(d.start, dx, dy, geometry.angle, oriented) : resizeCrop(d.start, d.mode, dx, dy, geometry, oriented));
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[e.key];
    if (move) setCrop(moveCrop(c, move[0], move[1], geometry.angle, oriented));
    else if (e.key === 'Enter' || e.key === 'Escape') setCropping(false);
    else return;
    // Keep these keys from also switching photos or toggling other shortcuts.
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={overlayRef} className={styles.overlay} data-testid="crop-overlay">
      <div
        className={styles.crop}
        style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }}
        role="group"
        aria-label="Crop area. Drag to move, arrow keys to nudge, Enter to finish."
        tabIndex={0}
        data-testid="crop-box"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
      >
        <div className={styles.thirds} aria-hidden="true">
          <span style={{ left: '33.333%' }} className={styles.vLine} />
          <span style={{ left: '66.667%' }} className={styles.vLine} />
          <span style={{ top: '33.333%' }} className={styles.hLine} />
          <span style={{ top: '66.667%' }} className={styles.hLine} />
        </div>
        {HANDLES.map((h) => (
          <span
            key={h}
            className={styles.handle}
            data-handle={h}
            role="presentation"
            title={`Drag the ${HANDLE_NAMES[h]}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
      </div>
    </div>
  );
}
