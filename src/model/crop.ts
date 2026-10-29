import { defaultEditSettings, type CropAspect, type Geometry, type Rect } from './editSettings';

/**
 * Crop editing math. Rects are normalized to the oriented image (Wo × Ho px).
 * A valid crop lies inside the straightened image: straightening never shows
 * empty corners.
 */

export interface Size {
  width: number;
  height: number;
}

export const FULL_CROP: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** Smallest crop side, normalized. */
export const MIN_CROP = 0.02;

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const ASPECT_RATIOS: Readonly<Record<Exclude<CropAspect, 'original' | 'custom'>, number>> = {
  '1:1': 1,
  '4:5': 5 / 4,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
};

/**
 * Pixel aspect (width / height) a preset asks for, in the crop's current
 * orientation (landscape crop → wide ratio, portrait → tall). Null for Custom.
 */
export function aspectRatioFor(aspect: CropAspect, o: Size, crop: Rect): number | null {
  if (aspect === 'custom') return null;
  const long = aspect === 'original' ? Math.max(o.width, o.height) / Math.min(o.width, o.height) : ASPECT_RATIOS[aspect];
  const landscape = crop.w * o.width >= crop.h * o.height;
  return landscape ? long : 1 / long;
}

/** Corners of a rect, mapped into the unrotated image (pixels): inside iff all are within it. */
export function isCropInside(r: Rect, angleDeg: number, o: Size, eps = 1e-7): boolean {
  if (r.x < -eps || r.y < -eps || r.x + r.w > 1 + eps || r.y + r.h > 1 + eps) return false;
  if (angleDeg === 0) return true;
  const t = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = o.width / 2;
  const cy = o.height / 2;
  const tol = eps * Math.max(o.width, o.height);
  for (const [nx, ny] of [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ] as const) {
    const px = nx * o.width - cx;
    const py = ny * o.height - cy;
    const qx = cos * px - sin * py + cx;
    const qy = sin * px + cos * py + cy;
    if (qx < -tol || qy < -tol || qx > o.width + tol || qy > o.height + tol) return false;
  }
  return true;
}

/** Largest centered crop with pixel aspect `ratio` inside the image straightened by `angle`. */
export function maxCenteredCrop(ratio: number, angleDeg: number, o: Size): Rect {
  const t = (Math.abs(angleDeg) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // A centered w×h rect turned by θ fits iff w·c + h·s ≤ W and w·s + h·c ≤ H.
  const h = Math.min(o.width / (ratio * c + s), o.height / (ratio * s + c));
  const wN = Math.min(1, (ratio * h) / o.width);
  const hN = Math.min(1, h / o.height);
  return { x: (1 - wN) / 2, y: (1 - hN) / 2, w: wN, h: hN };
}

const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
});

/**
 * The point along valid → candidate furthest towards candidate that is still
 * inside. Inside-ness is convex along the segment, so bisection is exact.
 */
export function constrainToward(valid: Rect, candidate: Rect, angleDeg: number, o: Size): Rect {
  if (isCropInside(candidate, angleDeg, o)) return candidate;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (isCropInside(lerpRect(valid, candidate, mid), angleDeg, o)) lo = mid;
    else hi = mid;
  }
  return lerpRect(valid, candidate, lo);
}

/** Shrinks/moves a crop just enough to fit after the straighten angle changed (keeps its aspect). */
export function fitCropToAngle(crop: Rect, angleDeg: number, o: Size): Rect {
  if (isCropInside(crop, angleDeg, o)) return crop;
  const safe = maxCenteredCrop((crop.w * o.width) / (crop.h * o.height), angleDeg, o);
  return constrainToward(safe, crop, angleDeg, o);
}

/** Largest crop of the preset's aspect, centered on the current crop where possible. */
export function cropForAspect(g: Geometry, aspect: CropAspect, o: Size): Rect {
  const ratio = aspectRatioFor(aspect, o, g.cropRect);
  if (ratio === null) return g.cropRect;
  const safe = maxCenteredCrop(ratio, g.angle, o);
  const cx = g.cropRect.x + g.cropRect.w / 2;
  const cy = g.cropRect.y + g.cropRect.h / 2;
  const recentered = { ...safe, x: Math.min(1 - safe.w, Math.max(0, cx - safe.w / 2)), y: Math.min(1 - safe.h, Math.max(0, cy - safe.h / 2)) };
  return constrainToward(safe, recentered, g.angle, o);
}

/** Moves the crop by a normalized offset, staying inside the image. */
export function moveCrop(start: Rect, dx: number, dy: number, angleDeg: number, o: Size): Rect {
  const candidate = {
    ...start,
    x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
    y: Math.min(1 - start.h, Math.max(0, start.y + dy)),
  };
  return constrainToward(start, candidate, angleDeg, o);
}

function freeResize(s: Rect, handle: CropHandle, dx: number, dy: number): Rect {
  let left = s.x;
  let top = s.y;
  let right = s.x + s.w;
  let bottom = s.y + s.h;
  if (handle.includes('w')) left = Math.min(right - MIN_CROP, Math.max(0, left + dx));
  if (handle.includes('e')) right = Math.max(left + MIN_CROP, Math.min(1, right + dx));
  if (handle.includes('n')) top = Math.min(bottom - MIN_CROP, Math.max(0, top + dy));
  if (handle.includes('s')) bottom = Math.max(top + MIN_CROP, Math.min(1, bottom + dy));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Resize keeping a normalized aspect `rn` (= w/h in normalized units), anchored opposite the handle. */
function lockedResize(s: Rect, handle: CropHandle, dx: number, dy: number, rn: number): Rect {
  const corner = handle.length === 2;
  let w: number;
  if (corner) {
    const wFromX = s.w + (handle.includes('e') ? dx : -dx);
    const hFromY = s.h + (handle.includes('s') ? dy : -dy);
    w = Math.max(wFromX, hFromY * rn);
  } else if (handle === 'e' || handle === 'w') {
    w = s.w + (handle === 'e' ? dx : -dx);
  } else {
    w = (s.h + (handle === 's' ? dy : -dy)) * rn;
  }
  // Anchor point and available room in each direction.
  const ax = handle.includes('w') ? s.x + s.w : handle.includes('e') ? s.x : s.x + s.w / 2;
  const ay = handle.includes('n') ? s.y + s.h : handle.includes('s') ? s.y : s.y + s.h / 2;
  const roomX = handle.includes('w') ? ax : handle.includes('e') ? 1 - ax : 2 * Math.min(ax, 1 - ax);
  const roomY = handle.includes('n') ? ay : handle.includes('s') ? 1 - ay : 2 * Math.min(ay, 1 - ay);
  w = Math.min(w, roomX, roomY * rn);
  w = Math.max(w, MIN_CROP * Math.max(1, rn));
  const h = w / rn;
  const x = handle.includes('w') ? ax - w : handle.includes('e') ? ax : ax - w / 2;
  const y = handle.includes('n') ? ay - h : handle.includes('s') ? ay : ay - h / 2;
  return { x, y, w, h };
}

/**
 * Drags a crop handle by a normalized offset. With an aspect preset the ratio
 * is kept; the result always stays inside the straightened image.
 */
export function resizeCrop(start: Rect, handle: CropHandle, dx: number, dy: number, g: Pick<Geometry, 'angle' | 'aspect'>, o: Size): Rect {
  const ratio = aspectRatioFor(g.aspect, o, start);
  const candidate = ratio === null ? freeResize(start, handle, dx, dy) : lockedResize(start, handle, dx, dy, (ratio * o.height) / o.width);
  return constrainToward(start, candidate, g.angle, o);
}

/** Rotate the result 90° clockwise: orientation, crop and flips follow; the straighten angle is unchanged. */
export function rotateGeometry90(g: Geometry): Geometry {
  const c = g.cropRect;
  return normalizeFlips({
    ...g,
    rotation: ((g.rotation + 1) % 4) as Geometry['rotation'],
    // R90 ∘ FlipH = FlipV ∘ R90, so the flips swap.
    flipH: g.flipV,
    flipV: g.flipH,
    cropRect: { x: 1 - (c.y + c.h), y: c.x, w: c.h, h: c.w },
  });
}

/** Mirror the result left-right: the crop mirrors and the straighten angle flips sign. */
export function flipGeometryH(g: Geometry): Geometry {
  const c = g.cropRect;
  return normalizeFlips({ ...g, flipH: !g.flipH, angle: g.angle === 0 ? 0 : -g.angle, cropRect: { ...c, x: 1 - c.x - c.w } });
}

/** Both flips equal a half turn; store that canonically. */
function normalizeFlips(g: Geometry): Geometry {
  if (!(g.flipH && g.flipV)) return g;
  return { ...g, flipH: false, flipV: false, rotation: ((g.rotation + 2) % 4) as Geometry['rotation'] };
}

const DEFAULT_GEOMETRY = defaultEditSettings().geometry;

/**
 * Geometry to render for the current view: none for Before, and the whole
 * straightened image (no crop) while the crop tool is open.
 */
export function displayGeometry(g: Geometry, view: { before: boolean; cropping: boolean }): Geometry {
  if (view.before) return DEFAULT_GEOMETRY;
  if (view.cropping) return { ...g, cropRect: FULL_CROP };
  return g;
}
