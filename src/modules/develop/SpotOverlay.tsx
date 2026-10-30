import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { Size } from '../../engine/geometry';
import type { Spot } from '../../model/editSettings';
import { maskView, type MaskView, type Point2 } from '../../model/maskEdit';
import { moveSource, moveSpot, resizeSpot, spotRadiusFrame } from '../../model/spotEdit';
import { useDevelopStore } from '../../state/developStore';
import { addSpotAt } from '../../state/spotActions';
import maskStyles from './MaskOverlay.module.css';
import styles from './SpotOverlay.module.css';

type Part = 'spot' | 'source' | 'size';

interface Drag {
  part: Part;
  start: Spot;
  from: Point2;
}

/** Nudge per arrow key press, in frame px (Shift: 5×). */
const KEY_STEP = 4;

const LABELS: Readonly<Record<Part, string>> = { spot: 'Move spot', source: 'Move spot source', size: 'Spot size' };

function dragged(d: Drag, view: MaskView, p: Point2): Spot {
  if (d.part === 'size') return resizeSpot(d.start, view, p);
  const dx = p.x - d.from.x;
  const dy = p.y - d.from.y;
  return d.part === 'spot' ? moveSpot(d.start, view, dx, dy) : moveSource(d.start, view, dx, dy);
}

/** The selected spot's circles in frame px, and the unit vector from its source to it. */
function linkOf(spot: Spot, view: MaskView) {
  const c = view.toFrame(spot.x, spot.y);
  const s = view.toFrame(spot.sx, spot.sy);
  const r = spotRadiusFrame(spot, view);
  const len = Math.hypot(c.x - s.x, c.y - s.y);
  return { c, s, r, len, ux: len > 0 ? (c.x - s.x) / len : 0, uy: len > 0 ? (c.y - s.y) / len : 0 };
}

/**
 * Spot removal on the canvas (M28): a click on the photo adds a spot (with
 * an automatic source); every spot shows its circle, and the selected one
 * its source (dashed), the link between them and a size handle. Drag a
 * circle to move it; Delete removes the selected spot.
 */
export function SpotOverlay({ source, frame }: { source: Size; frame: Size }) {
  const spots = useDevelopStore((s) => s.settings.spots);
  const geometry = useDevelopStore((s) => s.settings.geometry);
  const selectedId = useDevelopStore((s) => s.selectedSpotId);
  const { updateSpot, removeSpot, selectSpot, setInteracting } = useDevelopStore.getState();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const view = maskView(source, geometry, frame);

  const point = (e: PointerEvent): Point2 => {
    const box = svgRef.current?.getBoundingClientRect();
    return box ? { x: ((e.clientX - box.left) * frame.width) / box.width, y: ((e.clientY - box.top) * frame.height) / box.height } : { x: 0, y: 0 };
  };

  const onAdd = (e: PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    addSpotAt(view, point(e));
  };

  const onDown = (e: PointerEvent<SVGElement>, spot: Spot, part: Part) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectSpot(spot.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { part, start: spot, from: point(e) };
    setInteracting(true);
  };
  const onMove = (e: PointerEvent<SVGElement>) => {
    const d = drag.current;
    if (!d) return;
    updateSpot(d.start.id, dragged(d, view, point(e)), LABELS[d.part], `spots.${d.start.id}.${d.part}`);
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setInteracting(false);
  };

  const onKey = (e: KeyboardEvent<SVGElement>, spot: Spot, part: 'spot' | 'source') => {
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[e.key];
    if (move) {
      const next = part === 'spot' ? moveSpot(spot, view, move[0], move[1]) : moveSource(spot, view, move[0], move[1]);
      updateSpot(spot.id, next, LABELS[part], `spots.${spot.id}.${part}`);
    } else if (e.key === 'Delete' || e.key === 'Backspace') removeSpot(spot.id);
    else if (e.key === 'Escape') selectSpot(null);
    else if (e.key === 'Enter' || e.key === ' ') selectSpot(spot.id);
    else return;
    // Keep these keys from also switching photos or toggling other shortcuts.
    e.preventDefault();
    e.stopPropagation();
  };

  const selected = spots.find((sp) => sp.id === selectedId) ?? null;
  const link = selected ? linkOf(selected, view) : null;
  return (
    <svg ref={svgRef} className={maskStyles.overlay} viewBox={`0 0 ${frame.width} ${frame.height}`} data-testid="spot-overlay">
      <rect className={maskStyles.drawArea} width={frame.width} height={frame.height} data-testid="spot-area" onPointerDown={onAdd} />
      {link && selected && (
        <>
          {link.len > 2 * link.r && <line x1={link.s.x + link.ux * link.r} y1={link.s.y + link.uy * link.r} x2={link.c.x - link.ux * link.r} y2={link.c.y - link.uy * link.r} className={styles.link} />}
          <circle
            cx={link.s.x}
            cy={link.s.y}
            r={link.r}
            className={styles.source}
            role="button"
            tabIndex={0}
            aria-label="Spot source. Drag or use arrow keys to move it"
            data-testid="spot-source"
            onPointerDown={(e) => onDown(e, selected, 'source')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={(e) => onKey(e, selected, 'source')}
          />
          <circle
            cx={link.c.x + link.r}
            cy={link.c.y}
            r={5}
            className={`${maskStyles.handle} ${styles.sizeHandle}`}
            data-testid="spot-size"
            onPointerDown={(e) => onDown(e, selected, 'size')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <title>Drag to resize the spot</title>
          </circle>
        </>
      )}
      {spots.map((spot, i) => {
        const c = view.toFrame(spot.x, spot.y);
        const isSelected = spot.id === selectedId;
        return (
          <circle
            key={spot.id}
            cx={c.x}
            cy={c.y}
            r={spotRadiusFrame(spot, view)}
            className={isSelected ? styles.spotSelected : styles.spot}
            role="button"
            tabIndex={0}
            aria-label={`Spot ${i + 1} (${spot.mode})${isSelected ? ', selected. Drag or use arrow keys to move it, Delete to remove it' : ''}`}
            aria-pressed={isSelected}
            data-testid="spot"
            onPointerDown={(e) => onDown(e, spot, 'spot')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={(e) => onKey(e, spot, 'spot')}
          />
        );
      })}
    </svg>
  );
}
