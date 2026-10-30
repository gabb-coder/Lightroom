import { describe, expect, it } from 'vitest';
import { DEFAULT_SHEET_OPTIONS, fitInBox, sheetLayout } from './contactSheet';

describe('contact sheet layout (M34)', () => {
  it('sizes pages from paper, orientation and resolution', () => {
    expect(sheetLayout(1, DEFAULT_SHEET_OPTIONS)).toMatchObject({ width: 1240, height: 1754 }); // A4 at 150 dpi
    expect(sheetLayout(1, { ...DEFAULT_SHEET_OPTIONS, paper: 'letter', orientation: 'landscape', dpi: 300 })).toMatchObject({ width: 3300, height: 2550 });
  });

  it('fills rows left to right inside the margins, and starts new pages when full', () => {
    const o = { ...DEFAULT_SHEET_OPTIONS, columns: 3 };
    const layout = sheetLayout(40, o);
    const first = layout.pages[0] ?? [];
    const perPage = first.length;
    expect(layout.perPage).toBe(perPage);
    expect(sheetLayout(1, o).perPage).toBe(perPage);
    expect(perPage % 3).toBe(0);
    expect(layout.pages).toHaveLength(Math.ceil(40 / perPage));
    expect(layout.pages.flat().map((c) => c.index)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    const margin = 75; // 0.5 in at 150 dpi
    for (const c of first) {
      expect(c.box.x).toBeGreaterThanOrEqual(margin);
      expect(c.box.x + c.box.width).toBeLessThanOrEqual(layout.width - margin);
      expect(c.captionY).toBeLessThan(layout.footerY);
    }
    // Same row, same y; next column to the right.
    expect(first[1]?.box.y).toBe(first[0]?.box.y);
    expect(first[1]?.box.x).toBeGreaterThan((first[0]?.box.x ?? 0) + (first[0]?.box.width ?? 0));
    // No captions: more rows fit.
    expect(sheetLayout(40, { ...o, captions: false }).pages[0]?.length).toBeGreaterThanOrEqual(perPage);
  });

  it('fits a photo inside its box, centered', () => {
    expect(fitInBox({ width: 600, height: 300 }, { x: 10, y: 20, width: 200, height: 150 })).toEqual({ x: 10, y: 45, width: 200, height: 100 });
    expect(fitInBox({ width: 300, height: 600 }, { x: 0, y: 0, width: 200, height: 150 })).toEqual({ x: 63, y: 0, width: 75, height: 150 });
  });
});
