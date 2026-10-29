import { describe, expect, it } from 'vitest';
import { displaySize, rectCenter, scrollForCenter, toggledZoom, visibleRect, zoomScale } from './zoom';

const STAGE = { width: 800, height: 600 };
const PHOTO = { width: 4000, height: 2000 };

describe('zoom', () => {
  it('scales for fit, fill and 1:1 (device pixels)', () => {
    expect(zoomScale('fit', STAGE, PHOTO)).toBe(0.2);
    expect(zoomScale('fill', STAGE, PHOTO)).toBe(0.3);
    expect(zoomScale('1:1', STAGE, PHOTO)).toBe(1);
    expect(zoomScale('1:1', STAGE, PHOTO, 2)).toBe(0.5);
    expect(zoomScale('fit', { width: 0, height: 0 }, PHOTO)).toBe(0);
  });

  it('describes what is visible for a scroll position', () => {
    const display = displaySize(PHOTO, 1);
    expect(visibleRect(STAGE, display, 0, 0)).toEqual({ x: 0, y: 0, w: 0.2, h: 0.3 });
    expect(visibleRect(STAGE, display, 1600, 700)).toEqual({ x: 0.4, y: 0.35, w: 0.2, h: 0.3 });
    // Fit: everything is visible.
    expect(visibleRect(STAGE, displaySize(PHOTO, 0.2), 0, 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('scrolls to center a point, clamped at the edges, and round-trips', () => {
    const display = displaySize(PHOTO, 1);
    expect(scrollForCenter(STAGE, display, { x: 0.5, y: 0.5 })).toEqual({ left: 1600, top: 700 });
    expect(scrollForCenter(STAGE, display, { x: 0, y: 1 })).toEqual({ left: 0, top: 1400 });
    const s = scrollForCenter(STAGE, display, { x: 0.3, y: 0.4 });
    const c = rectCenter(visibleRect(STAGE, display, s.left, s.top));
    expect(c.x).toBeCloseTo(0.3, 9);
    expect(c.y).toBeCloseTo(0.4, 9);
  });

  it('Z toggles 1:1 and returns to the previous mode', () => {
    expect(toggledZoom('fit', 'fit')).toBe('1:1');
    expect(toggledZoom('1:1', 'fill')).toBe('fill');
    expect(toggledZoom('1:1', '1:1')).toBe('fit');
  });
});
