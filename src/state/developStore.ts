import { create } from 'zustand';
import { defaultEditSettings, type BasicSliderKey, type EditSettings, type Treatment } from '../model/editSettings';
import {
  createHistory,
  currentSettings,
  goToHistory,
  pushHistory,
  redo,
  undo,
  type History,
  type HistoryEntry,
} from '../model/history';
import { basicHistoryKey, basicHistoryLabel } from '../model/historyDisplay';
import { applyPresetTo, type Preset } from '../model/presets';

/** A decoded photo ready to render. The original file is never modified. */
export interface LoadedPhoto {
  /** Catalog id. */
  id: string;
  name: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

interface DevelopState {
  photo: LoadedPhoto | null;
  /** Every edit is a history step; `settings` is always the step at the cursor. */
  history: History;
  settings: EditSettings;
  /** True while a slider is being dragged or scrubbed: the renderer uses the proxy. */
  interacting: boolean;
  /** Before/After toggle (button or a tap of `\`). */
  before: boolean;
  /** True while `\` is held down to peek at the original. */
  peeking: boolean;
  /** Shows a photo with its saved history (or a fresh one). Closes the previous bitmap. */
  loadPhoto: (photo: LoadedPhoto, history?: History) => void;
  setBasic: (key: BasicSliderKey, value: number) => void;
  setTreatment: (treatment: Treatment) => void;
  applyPreset: (preset: Preset) => void;
  resetAll: () => void;
  undo: () => void;
  redo: () => void;
  goToHistory: (index: number) => void;
  setInteracting: (interacting: boolean) => void;
  toggleBefore: () => void;
  setPeeking: (peeking: boolean) => void;
}

/** True when the canvas should show the original with no adjustments. */
export const selectShowingBefore = (s: Pick<DevelopState, 'before' | 'peeking'>): boolean => s.before || s.peeking;

/** State patch for a new history step. */
function commit(history: History, entry: HistoryEntry): Pick<DevelopState, 'history' | 'settings'> {
  return { history: pushHistory(history, entry), settings: entry.settings };
}

/** State patch for moving the history cursor. */
function moveTo(history: History): Pick<DevelopState, 'history' | 'settings'> {
  return { history, settings: currentSettings(history) };
}

function initialEditState(history?: History): Pick<DevelopState, 'history' | 'settings'> {
  const h = history ?? createHistory(defaultEditSettings());
  return { history: h, settings: currentSettings(h) };
}

/**
 * Edit store for the open photo: its settings history and view state.
 * Saved to the catalog by state/editPersistence.ts.
 */
export const useDevelopStore = create<DevelopState>()((set) => ({
  photo: null,
  ...initialEditState(),
  interacting: false,
  before: false,
  peeking: false,
  loadPhoto: (photo, history) =>
    set((s) => {
      if (s.photo && s.photo.bitmap !== photo.bitmap) s.photo.bitmap.close?.();
      return { photo, ...initialEditState(history), interacting: false, before: false, peeking: false };
    }),
  setBasic: (key, value) =>
    set((s) => {
      if (s.settings.basic[key] === value) return s;
      const settings = { ...s.settings, basic: { ...s.settings.basic, [key]: value } };
      return commit(s.history, { label: basicHistoryLabel(key), key: basicHistoryKey(key), settings });
    }),
  setTreatment: (treatment) =>
    set((s) => {
      if (s.settings.basic.treatment === treatment) return s;
      const settings = { ...s.settings, basic: { ...s.settings.basic, treatment } };
      return commit(s.history, { label: basicHistoryLabel('treatment'), key: basicHistoryKey('treatment'), settings });
    }),
  applyPreset: (preset) =>
    set((s) => commit(s.history, { label: `Preset: ${preset.name}`, key: null, settings: applyPresetTo(s.settings, preset) })),
  resetAll: () => set((s) => commit(s.history, { label: 'Reset all', key: null, settings: defaultEditSettings() })),
  undo: () => set((s) => moveTo(undo(s.history))),
  redo: () => set((s) => moveTo(redo(s.history))),
  goToHistory: (index) => set((s) => moveTo(goToHistory(s.history, index))),
  setInteracting: (interacting) => set({ interacting }),
  toggleBefore: () => set((s) => ({ before: !s.before })),
  setPeeking: (peeking) => set({ peeking }),
}));
