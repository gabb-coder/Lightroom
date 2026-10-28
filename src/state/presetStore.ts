import { create } from 'zustand';
import type { EditSettings } from '../model/editSettings';
import { createPreset, SAMPLE_PRESETS, type Preset } from '../model/presets';

interface PresetState {
  presets: readonly Preset[];
  /** Saves the given settings as a new user preset and returns it. */
  savePreset: (name: string, settings: EditSettings) => Preset;
}

/** Preset library. Starts with the design's samples; persisted in M4. */
export const usePresetStore = create<PresetState>()((set) => ({
  presets: SAMPLE_PRESETS,
  savePreset: (name, settings) => {
    const preset = createPreset(crypto.randomUUID(), name, settings);
    set((s) => ({ presets: [...s.presets, preset] }));
    return preset;
  },
}));
