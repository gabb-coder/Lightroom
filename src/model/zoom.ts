import type { Size } from '../engine/geometry';

/**
 * Zoom (M16). Fit shows the whole photo, Fill covers the stage, 1:1 shows
 * one photo pixel per device pixel. Views are described by the visible
 * rectangle and its center, normalized to the displayed image (0..1).
 */

export type ZoomMode = 'fit' | 'fill' | '1:1';

export const ZOOM_MODES: readonly { id: ZoomMode; label: string }[] = [
  { id: 'fit', label: 'Fit' },
  { id: 'fill', label: 'Fill' },
  { id: '1:1', label: '1:1' },
];

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_VIEW: ViewRect = { x: 0, y: 0, w: 1, h: 1 };

/** CSS pixels per image pixel for a zoom mode. */
export function zoomScale(mode: ZoomMode, stage: Size, image: Size, devicePixelRatio = 1): number {
  if (image.width <= 0 || image.height <= 0 || stage.width <= 0 || stage.height <= 0) return 0;
  const fit = Math.min(stage.width / image.width, stage.height / image.height);
  if (mode === 'fit') return fit;
  if (mode === 'fill') return Math.max(stage.width / image.width, stage.height / image.height);
  return 1 / devicePixelRatio;
}

/** On-screen size of the photo at a scale (whole CSS pixels, at least 1). */
export function displaySize(image: Size, scale: number): Size {
  return { width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The part of the photo inside the stage for a scroll position (the stage scrolls the photo). */
export function visibleRect(stage: Size, display: Size, scrollLeft: number, scrollTop: number): ViewRect {
  const w = Math.min(1, stage.width / display.width);
  const h = Math.min(1, stage.height / display.height);
  return { x: w >= 1 ? 0 : clamp(scrollLeft / display.width, 0, 1 - w), y: h >= 1 ? 0 : clamp(scrollTop / display.height, 0, 1 - h), w, h };
}

/** Scroll position that centers a point of the photo (normalized), clamped to the scrollable range. */
export function scrollForCenter(stage: Size, display: Size, center: { x: number; y: number }): { left: number; top: number } {
  return {
    left: clamp(center.x * display.width - stage.width / 2, 0, Math.max(0, display.width - stage.width)),
    top: clamp(center.y * display.height - stage.height / 2, 0, Math.max(0, display.height - stage.height)),
  };
}

/** Center of a visible rectangle. */
export function rectCenter(r: ViewRect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Z: 1:1 from Fit/Fill, back to the previous mode from 1:1. */
export function toggledZoom(current: ZoomMode, previous: ZoomMode): ZoomMode {
  return current === '1:1' ? (previous === '1:1' ? 'fit' : previous) : '1:1';
}
