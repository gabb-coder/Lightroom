import { describe, expect, it } from 'vitest';
import { GRID_GAP, GRID_PADDING, gridMetrics, rowTop, visibleRows } from './gridLayout';

describe('gridMetrics', () => {
  it('fits as many columns as CSS auto-fill would', () => {
    // 4 cells of 190 + 3 gaps of 10 = 790.
    expect(gridMetrics(790, 190).columns).toBe(4);
    expect(gridMetrics(789, 190).columns).toBe(3);
    expect(gridMetrics(100, 190).columns).toBe(1);
  });

  it('stretches cells to fill the row and sizes rows from a 3:2 thumbnail', () => {
    const m = gridMetrics(790, 190);
    expect(m.cellWidth).toBe(190);
    expect(m.rowHeight).toBeCloseTo(16 + 14 + 8 + 174 / 1.5 + 8 + 16, 6);
    const wide = gridMetrics(800, 190);
    expect(wide.cellWidth).toBe(192.5);
  });
});

describe('visibleRows', () => {
  const m = { columns: 4, cellWidth: 190, rowHeight: 200 };

  it('covers the viewport plus overscan', () => {
    const w = visibleRows(200, m, 0, 600, 2);
    expect(w.firstRow).toBe(0);
    expect(w.lastRow).toBe(5); // ceil(600/210)=3, +2
    const mid = visibleRows(200, m, 2100, 600, 1);
    expect(mid.firstRow).toBe(8); // floor((2100 - 16) / 210) - 1
    expect(mid.lastRow).toBe(14);
  });

  it('never exceeds the row count and computes the total height', () => {
    const w = visibleRows(10, m, 5000, 600);
    expect(w.lastRow).toBe(3);
    expect(w.totalHeight).toBe(GRID_PADDING * 2 + 3 * 200 + 2 * GRID_GAP);
    expect(visibleRows(0, m, 0, 600)).toEqual({ firstRow: 0, lastRow: 0, totalHeight: 0 });
  });

  it('places rows on the gap grid', () => {
    expect(rowTop(0, m)).toBe(GRID_PADDING);
    expect(rowTop(3, m)).toBe(GRID_PADDING + 3 * 210);
  });
});
