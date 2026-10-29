import { describe, expect, it } from 'vitest';
import { addCurvePoint, IDENTITY_CURVE, MAX_CURVE_POINTS, moveCurvePoint, removeCurvePoint } from './curveEdit';

describe('curve editing', () => {
  it('adds a point on the current curve, keeping the points sorted', () => {
    const added = addCurvePoint(IDENTITY_CURVE, 0.4);
    expect(added?.points).toEqual([
      { x: 0, y: 0 },
      { x: 0.4, y: 0.4 },
      { x: 1, y: 1 },
    ]);
    expect(added?.index).toBe(1);
  });

  it('refuses points on top of others, at the ends, or beyond the maximum', () => {
    expect(addCurvePoint(IDENTITY_CURVE, 0.01)).toBeNull();
    expect(addCurvePoint(IDENTITY_CURVE, 1)).toBeNull();
    let pts = [...IDENTITY_CURVE];
    for (let i = 1; i < MAX_CURVE_POINTS - 1; i++) pts = addCurvePoint(pts, i / MAX_CURVE_POINTS)?.points ?? pts;
    expect(pts).toHaveLength(MAX_CURVE_POINTS);
    expect(addCurvePoint(pts, 0.97)).toBeNull();
  });

  it('moves interior points between their neighbors and endpoints only vertically', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0.3 },
      { x: 0.6, y: 0.6 },
      { x: 1, y: 1 },
    ];
    expect(moveCurvePoint(pts, 1, 0.9, 1.4)[1]).toEqual({ x: 0.58, y: 1 });
    expect(moveCurvePoint(pts, 0, 0.5, 0.2)[0]).toEqual({ x: 0, y: 0.2 });
    expect(moveCurvePoint(pts, 3, 0.2, -1)[3]).toEqual({ x: 1, y: 0 });
  });

  it('removes interior points but never the endpoints', () => {
    const pts = addCurvePoint(IDENTITY_CURVE, 0.5)?.points ?? [];
    expect(removeCurvePoint(pts, 1)).toEqual(IDENTITY_CURVE);
    expect(removeCurvePoint(pts, 0)).toEqual(pts);
  });
});
