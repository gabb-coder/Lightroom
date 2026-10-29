import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import controls from '../../components/controls.module.css';
import { isIdentityCurve, monotoneSpline } from '../../engine/curve';
import { addCurvePoint, CURVE_CHANNELS, IDENTITY_CURVE, moveCurvePoint, removeCurvePoint, type CurveChannel } from '../../model/curveEdit';
import type { Point } from '../../model/editSettings';
import { useDevelopStore } from '../../state/developStore';
import styles from './ToneCurvePanel.module.css';

const W = 272;
const H = 200;
const CHANNEL_LABELS: Readonly<Record<CurveChannel, string>> = { rgb: 'RGB', r: 'R', g: 'G', b: 'B' };
const CHANNEL_COLORS: Readonly<Record<CurveChannel, string>> = { rgb: '#d8d8d8', r: '#e0524d', g: '#5bb35b', b: '#4a7fe0' };
const KEY_STEP = 0.01;

const toSvg = (p: Point) => ({ x: p.x * W, y: (1 - p.y) * H });

function curvePath(points: readonly Point[]): string {
  const f = monotoneSpline(points);
  const parts: string[] = [];
  for (let i = 0; i <= 128; i++) {
    const x = i / 128;
    const { x: sx, y: sy } = toSvg({ x, y: Math.min(1, Math.max(0, f(x))) });
    parts.push(`${i === 0 ? 'M' : 'L'}${sx.toFixed(2)} ${sy.toFixed(2)}`);
  }
  return parts.join(' ');
}

/**
 * Tone curve editor (design/Develop.dc.html): click the curve area to add a
 * point, drag to move, double-click a point to delete it. Points take focus:
 * arrow keys move them, Delete removes.
 */
export function ToneCurvePanel() {
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const disabled = useDevelopStore((s) => s.photo === null);
  const points = useDevelopStore((s) => s.settings.curve[channel]);
  const setCurve = useDevelopStore((s) => s.setCurve);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const path = useMemo(() => curvePath(points), [points]);
  const color = CHANNEL_COLORS[channel];

  /** Pointer position in curve units (0..1, y up). */
  const toCurve = (e: PointerEvent): Point => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (e.clientX - box.left) / box.width, y: 1 - (e.clientY - box.top) / box.height };
  };

  // Capture on the pressed element (point or graph): moves still bubble to the
  // graph, and a point keeps receiving its own click/double-click.
  const startDrag = (e: PointerEvent<SVGElement>, index: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = index;
    setInteracting(true);
  };

  const onBackgroundDown = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled || e.button !== 0) return;
    const added = addCurvePoint(points, toCurve(e).x);
    if (!added) return;
    setCurve(channel, added.points);
    startDrag(e, added.index);
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const index = drag.current;
    if (index === null) return;
    const p = toCurve(e);
    setCurve(channel, moveCurvePoint(useDevelopStore.getState().settings.curve[channel], index, p.x, p.y));
  };

  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current === null) return;
    drag.current = null;
    const target = e.target as Element;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    setInteracting(false);
  };

  const remove = (index: number) => {
    if (index > 0 && index < points.length - 1) setCurve(channel, removeCurvePoint(points, index), false);
  };

  const onPointKey = (e: KeyboardEvent<SVGCircleElement>, index: number) => {
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const p = points[index];
    if (!p) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[e.key];
    if (move) setCurve(channel, moveCurvePoint(points, index, p.x + move[0], p.y + move[1]));
    else if (e.key === 'Delete' || e.key === 'Backspace') remove(index);
    else return;
    // Arrow keys would otherwise switch photos.
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={`${controls.segmented} ${styles.channels}`} role="group" aria-label="Curve channel">
          {CURVE_CHANNELS.map((c) => (
            <button key={c} type="button" className={`${controls.segment} ${styles.channel}`} aria-pressed={channel === c} onClick={() => setChannel(c)}>
              {CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>
        {!isIdentityCurve(points) && (
          <button type="button" className={styles.reset} disabled={disabled} onClick={() => setCurve(channel, [...IDENTITY_CURVE], false)}>
            Reset
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        className={styles.graph}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`${CHANNEL_LABELS[channel]} tone curve. Click to add a point, drag to move, double-click a point to delete it.`}
        data-testid="tone-curve"
        data-disabled={disabled}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <path d="M68 0V200M136 0V200M204 0V200M0 50H272M0 100H272M0 150H272" stroke="#2c2c2c" strokeWidth="1" />
        <path d="M0 200L272 0" stroke="#444444" strokeWidth="1" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" data-testid="curve-path" />
        {points.map((p, i) => {
          const s = toSvg(p);
          return (
            <circle
              key={i}
              className={styles.point}
              cx={s.x}
              cy={s.y}
              r="4"
              fill="#232323"
              stroke={color}
              strokeWidth="1.5"
              tabIndex={disabled ? -1 : 0}
              role="button"
              aria-label={`Curve point ${i + 1}: input ${Math.round(p.x * 100)}, output ${Math.round(p.y * 100)}`}
              data-testid="curve-point"
              onPointerDown={(e) => {
                if (disabled || e.button !== 0) return;
                e.stopPropagation();
                startDrag(e, i);
              }}
              onDoubleClick={() => remove(i)}
              onKeyDown={(e) => onPointKey(e, i)}
            />
          );
        })}
      </svg>
      <div className={styles.axis}>
        <span>Shadows</span>
        <span>Midtones</span>
        <span>Highlights</span>
      </div>
    </div>
  );
}
