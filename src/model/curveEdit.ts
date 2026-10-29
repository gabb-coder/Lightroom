import { monotoneSpline } from '../engine/curve';
import type { Point } from './editSettings';

/** Curve editing rules: endpoints stay at x = 0 and x = 1 (they move vertically), interior points keep their order. */

export type CurveChannel = 'rgb' | 'r' | 'g' | 'b';
export const CURVE_CHANNELS: readonly CurveChannel[] = ['rgb', 'r', 'g', 'b'];
export const MAX_CURVE_POINTS = 16;
/** Minimum horizontal distance between points. */
export const MIN_POINT_GAP = 0.02;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Adds a point on the current curve at x. Null if too close to another point or the curve is full. */
export function addCurvePoint(points: readonly Point[], x: number): { points: Point[]; index: number } | null {
  if (points.length >= MAX_CURVE_POINTS || x <= 0 || x >= 1) return null;
  if (points.some((p) => Math.abs(p.x - x) < MIN_POINT_GAP)) return null;
  const y = clamp(monotoneSpline(points)(x), 0, 1);
  const next = [...points, { x, y }].sort((a, b) => a.x - b.x);
  return { points: next, index: next.findIndex((p) => p.x === x) };
}

/** Moves a point; endpoints only vertically, interior points between their neighbors. */
export function moveCurvePoint(points: readonly Point[], index: number, x: number, y: number): Point[] {
  const last = points.length - 1;
  const p = points[index];
  if (!p) return [...points];
  let nx = p.x;
  if (index > 0 && index < last) {
    const lo = (points[index - 1]?.x ?? 0) + MIN_POINT_GAP;
    const hi = (points[index + 1]?.x ?? 1) - MIN_POINT_GAP;
    nx = clamp(x, lo, hi);
  }
  return points.map((q, i) => (i === index ? { x: nx, y: clamp(y, 0, 1) } : q));
}

/** Removes an interior point (endpoints stay). */
export function removeCurvePoint(points: readonly Point[], index: number): Point[] {
  if (index <= 0 || index >= points.length - 1) return [...points];
  return points.filter((_, i) => i !== index);
}

export const IDENTITY_CURVE: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];
