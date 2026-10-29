import { create } from 'zustand';
import { db, type LogoRecord } from '../db/db';
import { useExportStore } from './exportStore';

/** Logo files for the export watermark (M23): PNG keeps transparency; JPEG and WebP work too. */
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_ACCEPT = LOGO_TYPES.join(',');
/** Larger files are refused: a logo never needs to be this big. */
export const MAX_LOGO_BYTES = 20 * 1024 * 1024;

interface LogoState {
  logos: LogoRecord[];
  /** Why the last added file was refused, or null. */
  error: string | null;
  load: () => Promise<void>;
  add: (file: File) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
}

/** Problem with a file chosen as a logo, or null if it can be used. */
export function logoFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return `${file.name} can't be used as a logo. Choose a PNG, JPEG or WebP file.`;
  if (file.size > MAX_LOGO_BYTES) return `${file.name} is too large for a logo (20 MB at most).`;
  return null;
}

export const useLogoStore = create<LogoState>()((set, get) => ({
  logos: [],
  error: null,
  load: async () => {
    const logos = await db.logos.toArray();
    set({ logos: logos.sort((a, b) => a.addedAt - b.addedAt) });
  },
  /** Stores the file and turns the watermark on with it. Returns its id, or null if refused. */
  add: async (file) => {
    const problem = logoFileProblem(file);
    if (problem) {
      set({ error: problem });
      return null;
    }
    let size: { width: number; height: number };
    try {
      const bitmap = await createImageBitmap(file);
      size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
    } catch {
      set({ error: `${file.name} couldn't be opened as an image.` });
      return null;
    }
    const record: LogoRecord = { id: crypto.randomUUID(), name: file.name, blob: file, ...size, addedAt: Date.now() };
    await db.logos.add(record);
    set({ error: null });
    await get().load();
    const { options, setOptions } = useExportStore.getState();
    setOptions({ watermark: { ...options.watermark, enabled: true, kind: 'logo', logoId: record.id } });
    return record.id;
  },
  remove: async (id) => {
    await db.logos.delete(id);
    const { options, setOptions } = useExportStore.getState();
    if (options.watermark.logoId === id) setOptions({ watermark: { ...options.watermark, logoId: null } });
    await get().load();
  },
}));
