import { applyAffine, geometryMatrix, invertAffine, outputSize, type Size } from '../engine/geometry';
import { defaultMaskAdjust, MAX_STROKE_POINTS, type BrushMask, type BrushStroke, type Geometry, type LinearMask, type Mask, type RadialMask } from './editSettings';

/**
 * Mask editing math (M15). Masks are stored normalized to the uploaded photo
 * (source); the overlay works in frame pixels (the displayed, cropped and
 * rotated image at its on-screen size). Source → frame is a similarity
 * (rotation, flips and one uniform scale), so lengths and right angles carry
 * over; everything here converts through source pixels.
 */

export interface Point2 {
  x: number;
  y: number;
}

export interface MaskView {
  /** Source (normalized) → frame pixels. */
  toFrame: (u: number, v: number) => Point2;
  /** Frame pixels → source (normalized). */
  fromFrame: (x: number, y: number) => Point2;
  /** Source pixels per frame pixel. */
  scale: number;
  source: Size;
  frame: Size;
}

/** A view for a photo of `source` size shown with `geometry` in a frame of `frame` CSS pixels. */
export function maskView(source: Size, geometry: Geometry, frame: Size): MaskView {
  const out = outputSize(source, geometry);
  const toSource = geometryMatrix(source, geometry, out); // output px → source px
  const toOutput = invertAffine(toSource);
  const sx = frame.width / out.width;
  const sy = frame.height / out.height;
  const scale = Math.hypot(toSource[0], toSource[3]) / sx;
  return {
    toFrame: (u, v) => {
      const [ox, oy] = applyAffine(toOutput, u * source.width, v * source.height);
      return { x: ox * sx, y: oy * sy };
    },
    fromFrame: (x, y) => {
      const [px, py] = applyAffine(toSource, x / sx, y / sy);
      return { x: px / source.width, y: py / source.height };
    },
    scale,
    source,
    frame,
  };
}

export const MIN_DRAG_PX = 4;

/** A new linear gradient: full effect at `from`, none at `to` (frame px). A click makes a default one. */
export function createLinearMask(id: string, view: MaskView, from: Point2, to: Point2): LinearMask {
  const end = Math.hypot(to.x - from.x, to.y - from.y) < MIN_DRAG_PX ? { x: from.x, y: from.y + view.frame.height * 0.25 } : to;
  const a = view.fromFrame(from.x, from.y);
  const b = view.fromFrame(end.x, end.y);
  return { id, kind: 'linear', x0: a.x, y0: a.y, x1: b.x, y1: b.y, adjust: defaultMaskAdjust() };
}

/** A new radial gradient centered at `center` reaching `edge` (frame px); a circle on screen. */
export function createRadialMask(id: string, view: MaskView, center: Point2, edge: Point2): RadialMask {
  const dragged = Math.hypot(edge.x - center.x, edge.y - center.y);
  const radiusFrame = dragged < MIN_DRAG_PX ? Math.min(view.frame.width, view.frame.height) * 0.2 : dragged;
  const radiusPx = radiusFrame * view.scale;
  const c = view.fromFrame(center.x, center.y);
  return {
    id,
    kind: 'radial',
    cx: c.x,
    cy: c.y,
    rx: radiusPx / view.source.width,
    ry: radiusPx / view.source.height,
    angle: 0,
    feather: 50,
    invert: false,
    adjust: defaultMaskAdjust(),
  };
}

/** Moves a mask by a frame-pixel offset from where the drag started (`start`). */
export function moveMask<M extends Mask>(start: M, view: MaskView, dx: number, dy: number): M {
  const shift = (u: number, v: number) => {
    const p = view.toFrame(u, v);
    return view.fromFrame(p.x + dx, p.y + dy);
  };
  if (start.kind === 'linear') {
    const a = shift(start.x0, start.y0);
    const b = shift(start.x1, start.y1);
    return { ...start, x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }
  if (start.kind === 'brush') {
    const strokes = start.strokes.map((s) => {
      const points: number[] = [];
      for (let i = 0; i + 1 < s.points.length; i += 2) {
        const q = shift(s.points[i] ?? 0, s.points[i + 1] ?? 0);
        points.push(q.x, q.y);
      }
      return { ...s, points };
    });
    return { ...start, strokes };
  }
  const c = shift(start.cx, start.cy);
  return { ...start, cx: c.x, cy: c.y };
}

/** Sets a linear gradient's start or end point (frame px); keeps the two points apart. */
export function setLinearPoint(m: LinearMask, view: MaskView, which: 'start' | 'end', p: Point2): LinearMask {
  const other = view.toFrame(which === 'start' ? m.x1 : m.x0, which === 'start' ? m.y1 : m.y0);
  if (Math.hypot(p.x - other.x, p.y - other.y) < MIN_DRAG_PX) return m;
  const q = view.fromFrame(p.x, p.y);
  return which === 'start' ? { ...m, x0: q.x, y0: q.y } : { ...m, x1: q.x, y1: q.y };
}

/** Ellipse axis directions in source pixels (unit vectors) for a radial mask. */
function axes(m: RadialMask): { ax: Point2; ay: Point2 } {
  const t = (m.angle * Math.PI) / 180;
  return { ax: { x: Math.cos(t), y: Math.sin(t) }, ay: { x: -Math.sin(t), y: Math.cos(t) } };
}

/** The four handle positions (end of each semi-axis) and the center, in frame px. */
export function radialHandles(m: RadialMask, view: MaskView): { center: Point2; xPlus: Point2; xMinus: Point2; yPlus: Point2; yMinus: Point2 } {
  const { width: W, height: H } = view.source;
  const { ax, ay } = axes(m);
  const cxPx = m.cx * W;
  const cyPx = m.cy * H;
  const at = (dx: number, dy: number) => view.toFrame((cxPx + dx) / W, (cyPx + dy) / H);
  const rxPx = m.rx * W;
  const ryPx = m.ry * H;
  return {
    center: at(0, 0),
    xPlus: at(ax.x * rxPx, ax.y * rxPx),
    xMinus: at(-ax.x * rxPx, -ax.y * rxPx),
    yPlus: at(ay.x * ryPx, ay.y * ryPx),
    yMinus: at(-ay.x * ryPx, -ay.y * ryPx),
  };
}

/** Resizes one axis of a radial mask so its edge passes through `p` (frame px); Shift-style `uniform` keeps it round. */
export function resizeRadial(m: RadialMask, view: MaskView, axis: 'x' | 'y', p: Point2, uniform = false): RadialMask {
  const { width: W, height: H } = view.source;
  const q = view.fromFrame(p.x, p.y);
  const d = { x: q.x * W - m.cx * W, y: q.y * H - m.cy * H };
  const { ax, ay } = axes(m);
  const dir = axis === 'x' ? ax : ay;
  const lengthPx = Math.max(2, Math.abs(d.x * dir.x + d.y * dir.y));
  if (uniform) return { ...m, rx: lengthPx / W, ry: lengthPx / H };
  return axis === 'x' ? { ...m, rx: lengthPx / W } : { ...m, ry: lengthPx / H };
}

const KIND_NAMES = { linear: 'Linear gradient', radial: 'Radial gradient', brush: 'Brush' } as const;

/** Display names per kind and order: "Linear gradient 1", "Radial gradient 1", "Brush 1"… */
export function maskNames(masks: readonly Mask[]): Map<string, string> {
  const counts = { linear: 0, radial: 0, brush: 0 };
  const names = new Map<string, string>();
  for (const m of masks) {
    counts[m.kind]++;
    names.set(m.id, `${KIND_NAMES[m.kind]} ${counts[m.kind]}`);
  }
  return names;
}

/** Distance (frame px) of the rotate handle beyond the top of a radial mask. */
export const ROTATE_HANDLE_PX = 24;

/** The rotate handle: past the −y handle, away from the center. */
export function rotateHandle(m: RadialMask, view: MaskView): Point2 {
  const h = radialHandles(m, view);
  const dx = h.yMinus.x - h.center.x;
  const dy = h.yMinus.y - h.center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: h.yMinus.x + (dx / len) * ROTATE_HANDLE_PX, y: h.yMinus.y + (dy / len) * ROTATE_HANDLE_PX };
}

/**
 * Turns a radial mask so its rotate handle points at `p` (frame px). Works
 * in source pixels, so it is right through any crop rotation or flip.
 * `snap` rounds to 15° steps.
 */
export function rotateRadial(m: RadialMask, view: MaskView, p: Point2, snap = false): RadialMask {
  const { width: W, height: H } = view.source;
  const q = view.fromFrame(p.x, p.y);
  const dx = (q.x - m.cx) * W;
  const dy = (q.y - m.cy) * H;
  if (Math.hypot(dx, dy) < 1e-9) return m;
  // The handle sits along −y of the ellipse: (sin t, −cos t).
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  angle = snap ? Math.round(angle / 15) * 15 : Math.round(angle * 10) / 10;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return { ...m, angle: angle + 0 };
}

/** Brush size slider (1–100) → radius as a fraction of the photo's long edge. */
export function brushRadius(size: number): number {
  return size / 500;
}

/** Brush radius in frame px, for the brush cursor. */
export function brushRadiusFrame(radius: number, view: MaskView): number {
  return (radius * Math.max(view.source.width, view.source.height)) / view.scale;
}

/** Minimum pointer travel (frame px) before a stroke gets another point. */
export const STROKE_STEP_PX = 2;

export function newStroke(view: MaskView, p: Point2, brush: { size: number; feather: number; erase: boolean }): BrushStroke {
  const q = view.fromFrame(p.x, p.y);
  return { erase: brush.erase, radius: brushRadius(brush.size), feather: brush.feather, points: [q.x, q.y] };
}

/** The stroke with `p` (frame px) added, or null when it hasn't moved far enough (or is full). */
export function extendStroke(stroke: BrushStroke, view: MaskView, p: Point2): BrushStroke | null {
  const n = stroke.points.length;
  if (n >= MAX_STROKE_POINTS * 2) return null;
  const last = view.toFrame(stroke.points[n - 2] ?? 0, stroke.points[n - 1] ?? 0);
  if (Math.hypot(p.x - last.x, p.y - last.y) < STROKE_STEP_PX) return null;
  const q = view.fromFrame(p.x, p.y);
  return { ...stroke, points: [...stroke.points, q.x, q.y] };
}

/** A new, empty brush mask for a photo of `source` size. */
export function createBrushMask(id: string, source: Size): BrushMask {
  return { id, kind: 'brush', aspect: source.width / source.height, strokes: [], adjust: defaultMaskAdjust() };
}

/** Where a brush mask's pin sits (normalized): the start of its first stroke. */
export function brushPin(m: BrushMask): { x: number; y: number } | null {
  const p = m.strokes[0]?.points;
  return p ? { x: p[0] ?? 0, y: p[1] ?? 0 } : null;
}

