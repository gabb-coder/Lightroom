import { create } from 'zustand';
import { defaultEditSettings, type BasicSliderKey, type EditSettings, type Treatment } from '../model/editSettings';

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
  /** True while a slider is being dragged or scrubbed: the renderer uses the proxy. */
  interacting: boolean;
  /** Before/After toggle (button or a tap of `\`). */
  before: boolean;
  /** True while `\` is held down to peek at the original. */
  peeking: boolean;
  openPhoto: (photo: LoadedPhoto) => void;
  setBasic: (key: BasicSliderKey, value: number) => void;
  setTreatment: (treatment: Treatment) => void;
  setInteracting: (interacting: boolean) => void;
  toggleBefore: () => void;
  setPeeking: (peeking: boolean) => void;
}

/** True when the canvas should show the original with no adjustments. */
export const selectShowingBefore = (s: Pick<DevelopState, 'before' | 'peeking'>): boolean => s.before || s.peeking;

/**
 * Edit store for the open photo and its current settings. History, presets
 * and persistence build on this in M3/M4.
 */
export const useDevelopStore = create<DevelopState>()((set) => ({
  photo: null,
  settings: defaultEditSettings(),
  interacting: false,
  before: false,
  peeking: false,
  openPhoto: (photo) => set({ photo, settings: defaultEditSettings(), interacting: false, before: false, peeking: false }),
  setBasic: (key, value) =>
    set((s) => (s.settings.basic[key] === value ? s : { settings: { ...s.settings, basic: { ...s.settings.basic, [key]: value } } })),
  setTreatment: (treatment) =>
    set((s) => (s.settings.basic.treatment === treatment ? s : { settings: { ...s.settings, basic: { ...s.settings.basic, treatment } } })),
  setInteracting: (interacting) => set({ interacting }),
  toggleBefore: () => set((s) => ({ before: !s.before })),
  setPeeking: (peeking) => set({ peeking }),
}));
