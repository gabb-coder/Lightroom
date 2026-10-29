import { describe, expect, it } from 'vitest';
import { defaultEditSettings, type Geometry } from './editSettings';
import { brushPin, brushRadius, createBrushMask, createLinearMask, createRadialMask, extendStroke, maskNames, maskView, moveMask, newStroke, radialHandles, resizeRadial, rotateHandle, rotateRadial, setLinearPoint } from './maskEdit';

const SOURCE = { width: 600, height: 400 };
const geo = (patch: Partial<Geometry> = {}): Geometry => ({ ...defaultEditSettings().geometry, ...patch });
const close = (a: { x: number; y: number }, b: { x: number; y: number }, digits = 9) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

describe('mask view (source ↔ frame)', () => {
  it('maps the uncropped photo onto the frame and back', () => {
    const v = maskView(SOURCE, geo(), { width: 300, height: 200 });
    close(v.toFrame(0.5, 0.5), { x: 150, y: 100 });
    close(v.toFrame(1, 0), { x: 300, y: 0 });
    close(v.fromFrame(75, 50), { x: 0.25, y: 0.25 });
    expect(v.scale).toBeCloseTo(2, 9);
  });

  it('round-trips through crop, quarter turns, flips and straighten', () => {
    const g = geo({ rotation: 1, flipH: true, angle: 7, cropRect: { x: 0.15, y: 0.1, w: 0.7, h: 0.75 } });
    const v = maskView(SOURCE, g, { width: 250, height: 310 });
    for (const [u, w] of [[0.3, 0.4], [0.71, 0.22], [0.5, 0.5]] as const) {
      const f = v.toFrame(u, w);
      close(v.fromFrame(f.x, f.y), { x: u, y: w });
    }
  });
});

describe('creating and editing masks', () => {
  const view = maskView(SOURCE, geo(), { width: 300, height: 200 });

  it('linear: drag sets start and end; a click makes a default downward gradient', () => {
    const m = createLinearMask('a', view, { x: 30, y: 20 }, { x: 30, y: 120 });
    expect([m.x0, m.y0, m.x1, m.y1]).toEqual([0.1, 0.1, 0.1, 0.6]);
    const click = createLinearMask('b', view, { x: 150, y: 50 }, { x: 151, y: 50 });
    expect(click.y1 - click.y0).toBeCloseTo(0.25, 9);
  });

  it('radial: a circle on screen, even when the photo is turned', () => {
    const m = createRadialMask('r', view, { x: 150, y: 100 }, { x: 190, y: 100 });
    expect(m.rx * SOURCE.width).toBeCloseTo(80, 9); // 40 frame px × 2 source px per frame px
    expect(m.ry * SOURCE.height).toBeCloseTo(80, 9);
    const turned = maskView(SOURCE, geo({ rotation: 1 }), { width: 200, height: 300 });
    const t = createRadialMask('t', turned, { x: 100, y: 150 }, { x: 100, y: 150 });
    const h = radialHandles(t, turned);
    const rx = Math.hypot(h.xPlus.x - h.center.x, h.xPlus.y - h.center.y);
    const ry = Math.hypot(h.yPlus.x - h.center.x, h.yPlus.y - h.center.y);
    expect(rx).toBeCloseTo(ry, 9);
    expect(rx).toBeCloseTo(40, 9); // 20% of the shorter frame side
  });

  it('moves masks by screen offsets, also on a rotated photo', () => {
    const m = createLinearMask('a', view, { x: 30, y: 20 }, { x: 30, y: 120 });
    const moved = moveMask(m, view, 30, 0);
    expect(moved.x0).toBeCloseTo(0.2, 9);
    expect(moved.y1).toBeCloseTo(0.6, 9);
    const turned = maskView(SOURCE, geo({ rotation: 1 }), { width: 200, height: 300 });
    const r = createRadialMask('r', turned, { x: 100, y: 150 }, { x: 140, y: 150 });
    const before = turned.toFrame(r.cx, r.cy);
    const after = moveMask(r, turned, 10, -20);
    close(turned.toFrame(after.cx, after.cy), { x: before.x + 10, y: before.y - 20 });
  });

  it('drags a linear end point, but never onto the other point', () => {
    const m = createLinearMask('a', view, { x: 30, y: 20 }, { x: 30, y: 120 });
    expect(setLinearPoint(m, view, 'end', { x: 90, y: 160 })).toMatchObject({ x1: 0.3, y1: 0.8 });
    expect(setLinearPoint(m, view, 'end', { x: 31, y: 21 })).toBe(m);
  });

  it('resizes one axis of a radial mask, or both with uniform', () => {
    const m = createRadialMask('r', view, { x: 150, y: 100 }, { x: 190, y: 100 });
    const wide = resizeRadial(m, view, 'x', { x: 230, y: 100 });
    expect(wide.rx * SOURCE.width).toBeCloseTo(160, 9);
    expect(wide.ry).toBe(m.ry);
    const round = resizeRadial(m, view, 'y', { x: 150, y: 160 }, true);
    expect(round.rx * SOURCE.width).toBeCloseTo(120, 9);
    expect(round.ry * SOURCE.height).toBeCloseTo(120, 9);
  });

  it('names masks per kind in order', () => {
    const a = createLinearMask('a', view, { x: 0, y: 0 }, { x: 0, y: 50 });
    const b = createRadialMask('b', view, { x: 0, y: 0 }, { x: 0, y: 50 });
    const c = createLinearMask('c', view, { x: 0, y: 0 }, { x: 0, y: 50 });
    expect([...maskNames([a, b, c]).values()]).toEqual(['Linear gradient 1', 'Radial gradient 1', 'Linear gradient 2']);
  });
});

describe('radial rotation and brush strokes (M21)', () => {
  const source = { width: 600, height: 400 };
  const geometry = defaultEditSettings().geometry;
  const view = maskView(source, geometry, { width: 300, height: 200 });

  it('the rotate handle sits above the ellipse and turns it toward the pointer', () => {
    const m = createRadialMask('r', view, { x: 150, y: 100 }, { x: 190, y: 100 });
    const knob = rotateHandle(m, view);
    expect(knob.x).toBeCloseTo(150, 6);
    expect(knob.y).toBeLessThan(radialHandles(m, view).yMinus.y);
    expect(rotateRadial(m, view, { x: 250, y: 100 }).angle).toBe(90); // pointer to the right: a quarter turn clockwise
    expect(rotateRadial(m, view, { x: 150, y: 190 }).angle).toBe(180);
    expect(rotateRadial(m, view, { x: 60, y: 10 }).angle).toBe(-45);
    expect(rotateRadial(m, view, { x: 250, y: 90 }, true).angle).toBe(90); // snapped to 15°
    // After rotating, the handle follows the pointer's direction.
    const turned = rotateRadial(m, view, { x: 250, y: 100 });
    expect(rotateHandle(turned, view).x).toBeGreaterThan(190);
  });

  it('rotation is measured on the photo, so it is right with a rotated crop', () => {
    const rotated = maskView(source, { ...geometry, rotation: 1 }, { width: 200, height: 300 });
    const m = createRadialMask('r', rotated, { x: 100, y: 150 }, { x: 140, y: 150 });
    // On screen the photo is turned a quarter clockwise: dragging the knob to screen-right is photo-up.
    expect(rotateRadial(m, rotated, { x: 190, y: 150 }).angle).toBe(0);
  });

  it('strokes add a point only after the pointer moves a little, in photo coordinates', () => {
    const s = newStroke(view, { x: 30, y: 40 }, { size: 25, feather: 50, erase: false });
    expect(s).toEqual({ erase: false, radius: brushRadius(25), feather: 50, points: [0.1, 0.2] });
    expect(extendStroke(s, view, { x: 31, y: 40 })).toBeNull();
    expect(extendStroke(s, view, { x: 60, y: 40 })?.points).toEqual([0.1, 0.2, 0.2, 0.2]);
  });

  it('a brush mask moves with all its strokes, is named and pinned', () => {
    const b = { ...createBrushMask('b', source), strokes: [{ erase: false, radius: 0.05, feather: 50, points: [0.1, 0.2, 0.3, 0.4] }] };
    expect(b.aspect).toBe(1.5);
    const moved = moveMask(b, view, 30, 20); // 30 frame px = 0.1 of the width; 20 = 0.1 of the height
    expect(moved.strokes[0]?.points.map((v) => Number(v.toFixed(6)))).toEqual([0.2, 0.3, 0.4, 0.5]);
    expect(brushPin(b)).toEqual({ x: 0.1, y: 0.2 });
    expect(brushPin(createBrushMask('e', source))).toBeNull();
    expect([...maskNames([b, { ...b, id: 'c' }]).values()]).toEqual(['Brush 1', 'Brush 2']);
  });
});
