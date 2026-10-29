import { create } from 'zustand';
import type { EditSettings } from '../model/editSettings';
import type { RgbaImage } from '../render/gl';

/** The latest full-quality render of the open photo, at histogram size (512px). */
export interface RenderedPreview {
  photoId: string;
  /** The exact settings object it was rendered with. */
  settings: EditSettings;
  image: RgbaImage;
}

interface PreviewState {
  preview: RenderedPreview | null;
  setPreview: (preview: RenderedPreview | null) => void;
}

/** Written by the renderer controller; read to make edited thumbnails. */
export const usePreviewStore = create<PreviewState>()((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));
