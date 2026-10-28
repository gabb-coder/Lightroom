import { create } from 'zustand';
import { defaultEditSettings, type BasicSliderKey, type EditSettings } from '../model/editSettings';

/** A decoded photo ready to render. The original file is never modified. */
export interface LoadedPhoto {
  name: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

interface DevelopState {
  photo: LoadedPhoto | null;
  settings: EditSettings;
  /** True while a slider is being dragged: the renderer uses the proxy. */
  interacting: boolean;
  openPhoto: (photo: LoadedPhoto) => void;
  setBasic: (key: BasicSliderKey, value: number) => void;
  setInteracting: (interacting: boolean) => void;
}

/**
 * Minimal edit store for M1: one photo and its current settings. History,
 * presets and persistence build on this in M3/M4.
 */
export const useDevelopStore = create<DevelopState>()((set) => ({
  photo: null,
  settings: defaultEditSettings(),
  interacting: false,
  openPhoto: (photo) => set({ photo, settings: defaultEditSettings(), interacting: false }),
  setBasic: (key, value) =>
    set((s) => (s.settings.basic[key] === value ? s : { settings: { ...s.settings, basic: { ...s.settings.basic, [key]: value } } })),
  setInteracting: (interacting) => set({ interacting }),
}));
