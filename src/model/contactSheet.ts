/**
 * Contact sheet layout (M34): pages of a given paper size and resolution,
 * filled row by row with equal cells; each cell holds one photo fitted in a
 * 4:3 box with its file name underneath. All lengths in pixels of the page.
 */
export type Paper = 'a4' | 'letter';
export type Orientation = 'portrait' | 'landscape';

export interface SheetOptions {
  paper: Paper;
  orientation: Orientation;
  /** Dots per inch of the page image. */
  dpi: 150 | 300;
  /** 2–8. */
  columns: number;
  format: 'jpeg' | 'png';
  captions: boolean;
}

export const DEFAULT_SHEET_OPTIONS: SheetOptions = { paper: 'a4', orientation: 'portrait', dpi: 150, columns: 4, format: 'jpeg', captions: true };

/** Paper size in inches (portrait). */
export const PAPER_INCHES: Readonly<Record<Paper, { width: number; height: number }>> = {
  a4: { width: 210 / 25.4, height: 297 / 25.4 },
  letter: { width: 8.5, height: 11 },
};

export const PAPER_LABELS: Readonly<Record<Paper, string>> = { a4: 'A4', letter: 'Letter' };

/** Margins, gaps and caption size, in inches. */
const MARGIN = 0.5;
const GAP = 0.15;
const CAPTION = 0.24;
const FOOTER = 0.3;
/** Image box height over width. */
const BOX_RATIO = 3 / 4;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetCell {
  /** Index of the photo in the list. */
  index: number;
  /** The box the photo is fitted (contained) in. */
  box: Rect;
  /** Where the caption's text sits (its vertical middle). */
  captionY: number;
}

export interface SheetLayout {
  width: number;
  height: number;
  /** Caption font size in pixels. */
  fontSize: number;
  /** Footer (page number) baseline. */
  footerY: number;
  /** Cells on a full page. */
  perPage: number;
  pages: SheetCell[][];
}

export function sheetLayout(count: number, o: SheetOptions): SheetLayout {
  const paper = PAPER_INCHES[o.paper];
  const inches = o.orientation === 'portrait' ? paper : { width: paper.height, height: paper.width };
  const px = (inch: number) => Math.round(inch * o.dpi);
  const width = px(inches.width);
  const height = px(inches.height);
  const margin = px(MARGIN);
  const gap = px(GAP);
  const caption = o.captions ? px(CAPTION) : 0;
  const columns = Math.min(8, Math.max(2, Math.round(o.columns)));
  const cellWidth = Math.floor((width - 2 * margin - (columns - 1) * gap) / columns);
  const boxHeight = Math.floor(cellWidth * BOX_RATIO);
  const rowHeight = boxHeight + caption + gap;
  const usable = height - 2 * margin - px(FOOTER);
  const rows = Math.max(1, Math.floor((usable + gap) / rowHeight));
  const perPage = rows * columns;
  const pages: SheetCell[][] = [];
  for (let i = 0; i < count; i++) {
    const n = i % perPage;
    if (n === 0) pages.push([]);
    const row = Math.floor(n / columns);
    const col = n % columns;
    const box = { x: margin + col * (cellWidth + gap), y: margin + row * rowHeight, width: cellWidth, height: boxHeight };
    pages[pages.length - 1]?.push({ index: i, box, captionY: box.y + boxHeight + caption / 2 });
  }
  return { width, height, fontSize: Math.max(8, Math.round(caption * 0.5)), footerY: height - margin, perPage, pages };
}

/** A photo of `size` fitted (contained) and centered in `box`. */
export function fitInBox(size: { width: number; height: number }, box: Rect): Rect {
  const scale = Math.min(box.width / size.width, box.height / size.height);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  return { x: box.x + Math.round((box.width - width) / 2), y: box.y + Math.round((box.height - height) / 2), width, height };
}
