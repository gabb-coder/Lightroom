/**
 * Layout math for the virtualized Library grid. Mirrors CSS
 * `repeat(auto-fill, minmax(cellMin, 1fr))` so only visible rows render.
 */

export const GRID_GAP = 10;
export const GRID_PADDING = 16;
/** Cell chrome around the 3:2 thumbnail: padding, header and footer rows, gaps. */
export const CELL_PADDING = 8;
export const CELL_HEADER = 14;
export const CELL_FOOTER = 16;
export const CELL_INNER_GAP = 8;
export const THUMB_ASPECT = 3 / 2;

export interface GridMetrics {
  columns: number;
  cellWidth: number;
  rowHeight: number;
}

export function gridMetrics(contentWidth: number, cellMin: number): GridMetrics {
  const columns = Math.max(1, Math.floor((contentWidth + GRID_GAP) / (cellMin + GRID_GAP)));
  const cellWidth = Math.max(0, (contentWidth - GRID_GAP * (columns - 1)) / columns);
  const thumbHeight = (cellWidth - CELL_PADDING * 2) / THUMB_ASPECT;
  const rowHeight = CELL_PADDING * 2 + CELL_HEADER + CELL_INNER_GAP + thumbHeight + CELL_INNER_GAP + CELL_FOOTER;
  return { columns, cellWidth, rowHeight };
}

export interface RowWindow {
  firstRow: number;
  /** Exclusive. */
  lastRow: number;
  totalHeight: number;
}

/** Rows intersecting the viewport, plus `overscan` rows each side. */
export function visibleRows(itemCount: number, m: GridMetrics, scrollTop: number, viewportHeight: number, overscan = 2): RowWindow {
  const rowCount = Math.ceil(itemCount / m.columns);
  const stride = m.rowHeight + GRID_GAP;
  const totalHeight = rowCount === 0 ? 0 : GRID_PADDING * 2 + rowCount * m.rowHeight + (rowCount - 1) * GRID_GAP;
  if (rowCount === 0 || stride <= 0) return { firstRow: 0, lastRow: 0, totalHeight };
  const top = Math.max(0, scrollTop - GRID_PADDING);
  const firstRow = Math.max(0, Math.floor(top / stride) - overscan);
  const lastRow = Math.min(rowCount, Math.ceil((top + viewportHeight) / stride) + overscan);
  return { firstRow, lastRow, totalHeight };
}

/** Top offset of a row inside the scroll content. */
export function rowTop(row: number, m: GridMetrics): number {
  return GRID_PADDING + row * (m.rowHeight + GRID_GAP);
}
