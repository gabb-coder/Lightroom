import { defaultEditSettings, type EditSettings } from './editSettings';
import { parseEditSettings } from './validate';
import { migrateSharpenDefault } from './migrate';

/**
 * A preset is a complete look: everything except geometry, masks and spots, so
 * applying one replaces all global adjustments but keeps the photo's crop,
 * rotation and local adjustments (which are tied to this picture).
 */
export type PresetSettings = Omit<EditSettings, 'geometry' | 'masks' | 'spots'>;

export type PresetGroup = 'user' | 'builtin';

export interface Preset {
  id: string;
  name: string;
  group: PresetGroup;
  settings: PresetSettings;
}

export const PRESET_GROUP_LABELS: Readonly<Record<PresetGroup, string>> = {
  user: 'User presets',
  builtin: 'Built-in',
};

export function presetSettingsOf(settings: EditSettings): PresetSettings {
  // Geometry, masks and spots are deliberately left out of presets.
  const { geometry, masks, spots, ...rest } = settings; // eslint-disable-line @typescript-eslint/no-unused-vars
  return structuredClone(rest);
}

/** Settings after applying a preset: the preset's look plus the current geometry. */
export function applyPresetTo(current: EditSettings, preset: Preset): EditSettings {
  return { ...structuredClone(preset.settings), geometry: current.geometry, masks: current.masks, spots: current.spots };
}

export function createPreset(id: string, name: string, settings: EditSettings, group: PresetGroup = 'user'): Preset {
  return { id, name: name.trim(), group, settings: presetSettingsOf(settings) };
}

/** Builds a preset from defaults plus overrides, like the design's samples. */
function samplePreset(id: string, name: string, group: PresetGroup, edit: (s: EditSettings) => void): Preset {
  const s = defaultEditSettings();
  edit(s);
  return createPreset(id, name, s, group);
}

/** The six sample presets from design/Develop.dc.html. */
export const SAMPLE_PRESETS: readonly Preset[] = [
  samplePreset('sample-warm-film', 'Warm film', 'user', (s) => {
    Object.assign(s.basic, { temp: 18, tint: 4, contrast: -8, highlights: -30, shadows: 20, vibrance: -10, saturation: -6 });
    s.effects.grain = 30;
    s.effects.vignette = -22;
  }),
  samplePreset('sample-soft-matte', 'Soft matte', 'user', (s) => {
    Object.assign(s.basic, { contrast: -24, blacks: 30, highlights: -20, saturation: -12 });
  }),
  samplePreset('sample-crisp-bw', 'Crisp B&W', 'user', (s) => {
    Object.assign(s.basic, { treatment: 'bw', contrast: 30, whites: 16, blacks: -20 });
    s.detail.sharpAmount = 60;
  }),
  samplePreset('builtin-clean-daylight', 'Clean daylight', 'builtin', (s) => {
    Object.assign(s.basic, { temp: -6, exposure: 0.15, vibrance: 20, shadows: 15 });
  }),
  samplePreset('builtin-high-contrast', 'High contrast', 'builtin', (s) => {
    Object.assign(s.basic, { contrast: 45, highlights: -25, shadows: -10, blacks: -15 });
  }),
  samplePreset('builtin-faded', 'Faded', 'builtin', (s) => {
    Object.assign(s.basic, { contrast: -30, blacks: 40, saturation: -25 });
  }),
];

/** File format marker and version for exported presets. */
const PRESET_FORMAT = 'photo-editor-preset';
/** 2 since M18 (the sharpening default changed in M9; version 1 files get the same fix as the catalog). */
const PRESET_FORMAT_VERSION = 2;

export class PresetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresetParseError';
  }
}

export function serializePreset(preset: Preset): string {
  return JSON.stringify({ format: PRESET_FORMAT, version: PRESET_FORMAT_VERSION, ...preset });
}

/** Parses a serialized preset. Settings are validated and clamped; throws on a bad file. */
export function parsePreset(json: string): Preset {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new PresetParseError('Not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null) throw new PresetParseError('Not a preset');
  const r = raw as Record<string, unknown>;
  if (r.format !== PRESET_FORMAT) throw new PresetParseError('Not a preset');
  if (r.version !== 1 && r.version !== PRESET_FORMAT_VERSION) throw new PresetParseError(`Unsupported preset version ${String(r.version)}`);
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || r.name.trim() === '') throw new PresetParseError('Preset needs an id and a name');
  const group: PresetGroup = r.group === 'builtin' ? 'builtin' : 'user';
  const settings = r.version === 1 ? migrateSharpenDefault(r.settings) : r.settings;
  return { id: r.id, name: r.name.trim(), group, settings: presetSettingsOf(parseEditSettings(settings)) };
}
