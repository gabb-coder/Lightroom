import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Size } from '../../engine/geometry';
import type { BrushMask, BrushStroke, LinearMask, Mask, RadialMask } from '../../model/editSettings';
import {
  brushPin,
  brushRadius,
  brushRadiusFrame,
  createBrushMask,
  createLinearMask,
  createRadialMask,
  extendStroke,
  maskNames,
  maskView,
  moveMask,
  newStroke,
  radialHandles,
  resizeRadial,
  rotateHandle,
  rotateRadial,
  setLinearPoint,
  type MaskView,
  type Point2,
} from '../../model/maskEdit';
import { useDevelopStore } from '../../state/developStore';
import styles from './MaskOverlay.module.css';

type Handle = 'move' | 'start' | 'end' | 'x+' | 'x-' | 'y+' | 'y-' | 'rotate';

interface Drag {
  handle: Handle;
  start: Mask;
  from: Point2;
}

/** A brush stroke in progress: the mask as it was before it, and the stroke so far. */
interface Painting {
  base: BrushMask;
  stroke: BrushStroke;
  key: string;
}

/** Nudge per arrow key press, in frame px (Shift: 5×). */
const KEY_STEP = 4;

const shapeLabel = (m: Mask) => (m.kind === 'linear' ? 'Linear gradient' : m.kind === 'radial' ? 'Radial gradient' : 'Move brush');

function LinearShape({ mask, view }: { mask: LinearMask; view: MaskView }) {
  const a = view.toFrame(mask.x0, mask.y0);
  const b = view.toFrame(mask.x1, mask.y1);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Lines across the frame, perpendicular to the gradient direction.
  const reach = Math.hypot(view.frame.width, view.frame.height);
  const n = { x: (-(b.y - a.y) / len) * reach, y: ((b.x - a.x) / len) * reach };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const line = (p: Point2, dashed = false) => (
    <line x1={p.x - n.x} y1={p.y - n.y} x2={p.x + n.x} y2={p.y + n.y} className={dashed ? styles.guideDashed : styles.guide} />
  );
  return (
    <>
      {line(a)}
      {line(mid, true)}
      {line(b)}
    </>
  );
}

function RadialShape({ mask, view }: { mask: RadialMask; view: MaskView }) {
  const h = radialHandles(mask, view);
  const rx = Math.hypot(h.xPlus.x - h.center.x, h.xPlus.y - h.center.y);
  const ry = Math.hypot(h.yPlus.x - h.center.x, h.yPlus.y - h.center.y);
  const angle = (Math.atan2(h.xPlus.y - h.center.y, h.xPlus.x - h.center.x) * 180) / Math.PI;
  const inner = 1 - mask.feather / 100;
  const transform = `rotate(${angle} ${h.center.x} ${h.center.y})`;
  const knob = rotateHandle(mask, view);
  return (
    <>
      <ellipse cx={h.center.x} cy={h.center.y} rx={rx} ry={ry} transform={transform} className={styles.guide} />
      {inner > 0.02 && inner < 0.98 && (
        <ellipse cx={h.center.x} cy={h.center.y} rx={rx * inner} ry={ry * inner} transform={transform} className={styles.guideDashed} />
      )}
      <line x1={h.yMinus.x} y1={h.yMinus.y} x2={knob.x} y2={knob.y} className={styles.guide} />
    </>
  );
}

/** Handle positions of a mask, in frame px (brush masks have none: paint to change them). */
function handlesOf(mask: Mask, view: MaskView): { handle: Handle; at: Point2; label: string }[] {
  if (mask.kind === 'brush') return [];
  if (mask.kind === 'linear') {
    const a = view.toFrame(mask.x0, mask.y0);
    const b = view.toFrame(mask.x1, mask.y1);
    return [
      { handle: 'start', at: a, label: 'Start of the gradient (full effect)' },
      { handle: 'end', at: b, label: 'End of the gradient (no effect)' },
    ];
  }
  const h = radialHandles(mask, view);
  return [
    { handle: 'x+', at: h.xPlus, label: 'Resize (Shift keeps it round)' },
    { handle: 'x-', at: h.xMinus, label: 'Resize (Shift keeps it round)' },
    { handle: 'y+', at: h.yPlus, label: 'Resize (Shift keeps it round)' },
    { handle: 'y-', at: h.yMinus, label: 'Resize (Shift keeps it round)' },
    { handle: 'rotate', at: rotateHandle(mask, view), label: 'Rotate (Shift: 15° steps)' },
  ];
}

function pinOf(mask: Mask, view: MaskView): Point2 | null {
  if (mask.kind === 'radial') return view.toFrame(mask.cx, mask.cy);
  if (mask.kind === 'brush') {
    const p = brushPin(mask);
    return p ? view.toFrame(p.x, p.y) : null;
  }
  const a = view.toFrame(mask.x0, mask.y0);
  const b = view.toFrame(mask.x1, mask.y1);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The mask after dragging `handle` from `drag.from` to `p` (frame px). */
function dragged(drag: Drag, view: MaskView, p: Point2, shift: boolean): Mask {
  const m = drag.start;
  if (drag.handle === 'move') return moveMask(m, view, p.x - drag.from.x, p.y - drag.from.y);
  if (m.kind === 'linear') return drag.handle === 'start' || drag.handle === 'end' ? setLinearPoint(m, view, drag.handle, p) : m;
  if (m.kind !== 'radial') return m;
  if (drag.handle === 'rotate') return rotateRadial(m, view, p, shift);
  const axis = drag.handle === 'x+' || drag.handle === 'x-' ? 'x' : 'y';
  return resizeRadial(m, view, axis, p, shift);
}

/**
 * Masks on the canvas (M15, M21). With a gradient tool picked, a drag places
 * a new mask; with the brush, drags paint (Alt erases) into the selected
 * brush mask, or a new one. Otherwise the selected mask shows its guides
 * and handles, and every mask a pin to select it.
 */
export function MaskOverlay({ source, frame }: { source: Size; frame: Size }) {
  const masks = useDevelopStore((s) => s.settings.masks);
  const geometry = useDevelopStore((s) => s.settings.geometry);
  const selectedId = useDevelopStore((s) => s.selectedMaskId);
  const tool = useDevelopStore((s) => s.maskTool);
  const brush = useDevelopStore((s) => s.brush);
  const { putMask, updateMask, removeMask, selectMask, setMaskTool, setInteracting } = useDevelopStore.getState();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const drawing = useRef<{ id: string; from: Point2 } | null>(null);
  const painting = useRef<Painting | null>(null);
  const [cursor, setCursor] = useState<Point2 | null>(null);
  const view = maskView(source, geometry, frame);
  const selected = masks.find((m) => m.id === selectedId) ?? null;
  const names = maskNames(masks);

  const point = (e: PointerEvent): Point2 => {
    const box = svgRef.current?.getBoundingClientRect();
    return box ? { x: ((e.clientX - box.left) * frame.width) / box.width, y: ((e.clientY - box.top) * frame.height) / box.height } : { x: 0, y: 0 };
  };

  const create = (id: string, from: Point2, to: Point2): Mask =>
    tool === 'radial' ? createRadialMask(id, view, from, to) : createLinearMask(id, view, from, to);

  const startPainting = (from: Point2, erase: boolean) => {
    const base = selected?.kind === 'brush' ? selected : createBrushMask(crypto.randomUUID(), source);
    const stroke = newStroke(view, from, { ...brush, erase });
    // One history step per stroke: the moves of this stroke share a key.
    const p: Painting = { base, stroke, key: `masks.${base.id}.stroke.${base.strokes.length}` };
    painting.current = p;
    putMask({ ...base, strokes: [...base.strokes, stroke] }, p.key);
  };

  const onDrawStart = (e: PointerEvent<SVGRectElement>) => {
    if (!tool || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = point(e);
    setInteracting(true);
    if (tool === 'brush') {
      startPainting(from, brush.erase || e.altKey);
      return;
    }
    const id = crypto.randomUUID();
    drawing.current = { id, from };
    putMask(create(id, from, from), `masks.${id}.draw`);
  };
  const onDrawMove = (e: PointerEvent<SVGRectElement>) => {
    const p = point(e);
    if (tool === 'brush') setCursor(p);
    const paint = painting.current;
    if (paint) {
      const stroke = extendStroke(paint.stroke, view, p);
      if (!stroke) return;
      paint.stroke = stroke;
      putMask({ ...paint.base, strokes: [...paint.base.strokes, stroke] }, paint.key);
      return;
    }
    const d = drawing.current;
    if (d) putMask(create(d.id, d.from, p), `masks.${d.id}.draw`);
  };
  const onDrawEnd = () => {
    if (painting.current) {
      painting.current = null;
      setInteracting(false);
      return; // the brush stays picked for the next stroke
    }
    if (!drawing.current) return;
    drawing.current = null;
    setInteracting(false);
    setMaskTool(null);
  };

  const onHandleDown = (e: PointerEvent<SVGElement>, mask: Mask, handle: Handle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (mask.id !== selectedId) {
      selectMask(mask.id);
      if (handle !== 'move') return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, start: mask, from: point(e) };
    setInteracting(true);
  };
  const onHandleMove = (e: PointerEvent<SVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const label = d.handle === 'rotate' ? 'Rotate mask' : shapeLabel(d.start);
    updateMask(d.start.id, dragged(d, view, point(e), e.shiftKey), label, `masks.${d.start.id}.${d.handle === 'rotate' ? 'angle' : 'shape'}`);
  };
  const onHandleUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setInteracting(false);
  };

  const onPinKey = (e: KeyboardEvent<SVGElement>, mask: Mask) => {
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[e.key];
    if (move) updateMask(mask.id, moveMask(mask, view, move[0], move[1]), shapeLabel(mask), `masks.${mask.id}.shape`);
    else if (e.key === 'Delete' || e.key === 'Backspace') removeMask(mask.id);
    else if (e.key === 'Escape') selectMask(null);
    else if (e.key === 'Enter' || e.key === ' ') selectMask(mask.id);
    else return;
    // Keep these keys from also switching photos or toggling other shortcuts.
    e.preventDefault();
    e.stopPropagation();
  };

  const brushR = brushRadiusFrame(brushRadius(brush.size), view);
  return (
    <svg
      ref={svgRef}
      className={styles.overlay}
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      data-testid="mask-overlay"
      data-tool={tool ?? 'none'}
    >
      {tool && (
        <rect
          className={tool === 'brush' ? `${styles.drawArea} ${styles.paintArea}` : styles.drawArea}
          width={frame.width}
          height={frame.height}
          data-testid="mask-draw-area"
          onPointerDown={onDrawStart}
          onPointerMove={onDrawMove}
          onPointerUp={onDrawEnd}
          onPointerCancel={onDrawEnd}
          onPointerLeave={() => setCursor(null)}
        />
      )}
      {selected && selected.kind !== 'brush' && (
        <g aria-hidden="true" className={styles.shapes}>
          {selected.kind === 'linear' ? <LinearShape mask={selected} view={view} /> : <RadialShape mask={selected} view={view} />}
        </g>
      )}
      {tool === 'brush' && cursor && (
        <g aria-hidden="true" className={styles.shapes} data-testid="brush-cursor">
          <circle cx={cursor.x} cy={cursor.y} r={brushR} className={styles.guide} />
          {brush.feather > 2 && brush.feather < 98 && <circle cx={cursor.x} cy={cursor.y} r={brushR * (1 - brush.feather / 100)} className={styles.guideDashed} />}
        </g>
      )}
      {selected &&
        !tool &&
        handlesOf(selected, view).map(({ handle, at, label }) => (
          <circle
            key={handle}
            cx={at.x}
            cy={at.y}
            r={handle === 'rotate' ? 5 : 6}
            className={handle === 'rotate' ? `${styles.handle} ${styles.rotateHandle}` : styles.handle}
            data-handle={handle}
            onPointerDown={(e) => onHandleDown(e, selected, handle)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            <title>{label}</title>
          </circle>
        ))}
      {!tool &&
        masks.map((m) => {
          const pin = pinOf(m, view);
          if (!pin) return null;
          const isSelected = m.id === selectedId;
          return (
            <circle
              key={m.id}
              cx={pin.x}
              cy={pin.y}
              r={isSelected ? 8 : 6}
              className={isSelected ? styles.pinSelected : styles.pin}
              role="button"
              tabIndex={0}
              aria-label={`${names.get(m.id) ?? 'Mask'}${isSelected ? ', selected. Drag or use arrow keys to move, Delete to remove' : ''}`}
              aria-pressed={isSelected}
              data-testid="mask-pin"
              onPointerDown={(e) => onHandleDown(e, m, 'move')}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              onKeyDown={(e) => onPinKey(e, m)}
            />
          );
        })}
    </svg>
  );
}
