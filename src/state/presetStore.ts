import { create } from 'zustand';
import { db } from '../db/db';
import type { EditSettings } from '../model/editSettings';
import { createPreset, presetSettingsOf, SAMPLE_PRESETS, type Preset } from '../model/presets';
import { parseEditSettings } from '../model/validate';

interface PresetState {
  presets: readonly Preset[];
  /** Saves the given settings as a new user preset (also to the catalog) and returns it. */
  savePreset: (name: string, settings: EditSettings) => Preset;
  /** Adds presets read from storage after the samples. */
  addLoaded: (presets: readonly Preset[]) => void;
}

/** Preset library: the design's samples plus the user's saved presets. */
export const usePresetStore = create<PresetState>()((set) => ({
  presets: SAMPLE_PRESETS,
  savePreset: (name, settings) => {
    const preset = createPreset(crypto.randomUUID(), name, settings);
    set((s) => ({ presets: [...s.presets, preset] }));
    void db.presets.put(preset).catch(() => undefined);
    return preset;
  },
  addLoaded: (loaded) => set((s) => ({ presets: [...s.presets, ...loaded.filter((p) => !s.presets.some((q) => q.id === p.id))] })),
}));

/** Reads saved user presets from the catalog, validating each one. */
export async function loadSavedPresets(): Promise<void> {
  const rows = await db.presets.toArray();
  const presets = rows
    .filter((p) => typeof p.id === 'string' && typeof p.name === 'string')
    .map((p): Preset => ({ id: p.id, name: p.name, group: 'user', settings: presetSettingsOf(parseEditSettings(p.settings)) }));
  usePresetStore.getState().addLoaded(presets);
}
