import { create } from 'zustand';
import { db } from '../db/db';
import { downloadBlob } from '../io/download';
import { createZip } from '../io/zip';
import { DEFAULT_SHEET_OPTIONS, fitInBox, sheetLayout, type SheetOptions } from '../model/contactSheet';
import { displayName } from '../model/virtualCopy';
import { useLibraryStore, selectLibraryList } from './libraryStore';
import { renderEditedPreview } from './settingsSync';

/** Contact sheet dialog (M34): its options, and the sheet being made. */
interface ContactSheetState {
  open: boolean;
  options: SheetOptions;
  running: boolean;
  progress: number;
  error: string | null;
  setOpen: (open: boolean) => void;
  setOptions: (patch: Partial<SheetOptions>) => void;
}

export const useContactSheetStore = create<ContactSheetState>()((set) => ({
  open: false,
  options: DEFAULT_SHEET_OPTIONS,
  running: false,
  progress: 0,
  error: null,
  setOpen: (open) => set({ open, error: null }),
  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),
}));

/** The photos on the sheet: the selection in grid order, or the whole grid when nothing is selected. */
export function sheetPhotoIds(): string[] {
  const library = useLibraryStore.getState();
  const list = selectLibraryList(library).map((p) => p.id);
  const selected = new Set(library.selection.ids);
  return selected.size > 0 ? list.filter((id) => selected.has(id)) : list;
}

/** Shortens text with "…" to fit `width` pixels in the context's font. */
function ellipsize(ctx: OffscreenCanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}

/**
 * Makes the sheet: each photo rendered with its edits by the export worker
 * at its cell's size, laid out on white pages with its name underneath
 * (Canvas 2D only arranges finished images here). One page downloads as an
 * image; several as a ZIP.
 */
export async function makeContactSheet(ids: readonly string[], o: SheetOptions): Promise<void> {
  const store = useContactSheetStore;
  if (ids.length === 0 || store.getState().running) return;
  store.setState({ running: true, progress: 0, error: null });
  try {
    const layout = sheetLayout(ids.length, o);
    const font = `500 ${layout.fontSize}px Inter, system-ui, sans-serif`;
    await document.fonts.load(font).catch(() => undefined);
    const records = await Promise.all(ids.map((id) => db.photos.get(id)));
    const type = o.format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = o.format === 'png' ? 'png' : 'jpg';
    const files: { name: string; data: Blob }[] = [];
    let done = 0;
    for (const [p, cells] of layout.pages.entries()) {
      const canvas = new OffscreenCanvas(layout.width, layout.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is not available');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, layout.width, layout.height);
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const cell of cells) {
        const record = records[cell.index];
        if (!record) continue;
        const blob = await renderEditedPreview(record.id, Math.max(cell.box.width, cell.box.height));
        if (blob) {
          const bitmap = await createImageBitmap(blob);
          const r = fitInBox(bitmap, cell.box);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bitmap, r.x, r.y, r.width, r.height);
          bitmap.close();
        }
        if (o.captions) {
          ctx.fillStyle = '#222222';
          ctx.fillText(ellipsize(ctx, displayName(record), cell.box.width), cell.box.x + cell.box.width / 2, cell.captionY);
        }
        store.setState({ progress: ++done / ids.length });
      }
      if (layout.pages.length > 1) {
        ctx.fillStyle = '#888888';
        ctx.fillText(`Page ${p + 1} of ${layout.pages.length}`, layout.width / 2, layout.footerY);
      }
      files.push({ name: `contact-sheet${layout.pages.length > 1 ? `-${p + 1}` : ''}.${ext}`, data: await canvas.convertToBlob({ type, quality: 0.92 }) });
    }
    const [only] = files;
    if (files.length === 1 && only) downloadBlob(only.data, only.name);
    else downloadBlob(await createZip(files), 'contact-sheet.zip');
    store.setState({ running: false, open: false });
  } catch (error) {
    store.setState({ running: false, error: error instanceof Error ? error.message : String(error) });
  }
}
