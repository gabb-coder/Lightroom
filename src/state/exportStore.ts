import { create } from 'zustand';
import { db } from '../db/db';
import { downloadBlob } from '../io/download';
import type { EditSettings } from '../model/editSettings';
import {
  BUILTIN_EXPORT_PRESETS,
  exportFileName,
  normalizeExportOptions,
  type ExportOptions,
  type ExportPreset,
} from '../model/exportOptions';
import { currentSettings, parseStoredHistory } from '../model/history';
import { cancelExport, ExportCancelled, exportInWorker } from '../workers/exportClient';
import { STAGE_PROGRESS } from '../workers/exportProtocol';
import { useAppStore } from './appStore';
import { useDevelopStore } from './developStore';
import { flushEdits } from './editPersistence';
import { useLibraryStore } from './libraryStore';
import { readUiPrefs, writeUiPrefs } from './uiPrefs';

export interface ExportJob {
  status: 'running' | 'done' | 'error' | 'cancelled';
  fileName: string;
  /** 0..1 */
  progress: number;
  message?: string;
}

interface ExportState {
  options: ExportOptions;
  /** Highlighted preset; null once the options are changed by hand. */
  presetId: string | null;
  userPresets: readonly ExportPreset[];
  job: ExportJob | null;
  setOptions: (patch: Partial<ExportOptions>) => void;
  applyPreset: (preset: ExportPreset) => void;
  savePreset: (name: string) => void;
  setUserPresets: (presets: readonly ExportPreset[]) => void;
  setJob: (job: ExportJob | null) => void;
}

const initialOptions = normalizeExportOptions((readUiPrefs().exportOptions ?? {}) as Partial<ExportOptions>);

export const useExportStore = create<ExportState>()((set, get) => ({
  options: initialOptions,
  presetId: BUILTIN_EXPORT_PRESETS.find((p) => JSON.stringify(p.options) === JSON.stringify(initialOptions))?.id ?? null,
  userPresets: [],
  job: null,
  setOptions: (patch) => {
    const options = normalizeExportOptions({ ...get().options, ...patch });
    writeUiPrefs({ exportOptions: { ...options } });
    set({ options, presetId: null });
  },
  applyPreset: (preset) => {
    writeUiPrefs({ exportOptions: { ...preset.options } });
    set({ options: preset.options, presetId: preset.id });
  },
  savePreset: (name) => {
    const preset: ExportPreset = { id: crypto.randomUUID(), name: name.trim(), options: get().options };
    set((s) => ({ userPresets: [...s.userPresets, preset], presetId: preset.id }));
    void db.exportPresets.put(preset).catch(() => undefined);
  },
  setUserPresets: (userPresets) => set({ userPresets }),
  setJob: (job) => set({ job }),
}));

/** Loads saved export presets from the catalog. */
export async function loadExportPresets(): Promise<void> {
  const rows = await db.exportPresets.toArray();
  useExportStore
    .getState()
    .setUserPresets(rows.filter((p) => typeof p.name === 'string').map((p) => ({ id: p.id, name: p.name, options: normalizeExportOptions(p.options) })));
}

/** The settings to export: the open photo's live settings, or the saved ones. */
async function settingsFor(photoId: string): Promise<EditSettings> {
  const develop = useDevelopStore.getState();
  if (develop.photo?.id === photoId) return develop.settings;
  return currentSettings(parseStoredHistory((await db.edits.get(photoId))?.history));
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function finish(job: ExportJob): void {
  useExportStore.getState().setJob(job);
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => useExportStore.getState().setJob(null), job.status === 'error' ? 8000 : 4000);
}

/** Closes the Export dialog, returning to the module it was opened from. */
export function closeExportDialog(): void {
  const app = useAppStore.getState();
  app.setModule(app.returnModule);
}

/**
 * Exports the focused photo at full resolution in the worker and downloads
 * it. The original stored in the catalog is only read.
 */
export async function runExport(): Promise<void> {
  const photoId = useLibraryStore.getState().selectedId;
  if (!photoId || useExportStore.getState().job?.status === 'running') return;
  const { options, setJob } = useExportStore.getState();
  if (hideTimer) clearTimeout(hideTimer);
  closeExportDialog();
  await flushEdits();
  const [record, original] = await Promise.all([db.photos.get(photoId), db.originals.get(photoId)]);
  if (!record || !original) return finish({ status: 'error', fileName: '', progress: 0, message: 'This photo is no longer in the catalog.' });
  const fileName = exportFileName(options, record, 1);
  setJob({ status: 'running', fileName, progress: 0 });
  try {
    const settings = await settingsFor(photoId);
    const result = await exportInWorker(original.blob, settings, options, (stage) =>
      setJob({ status: 'running', fileName, progress: STAGE_PROGRESS[stage] }),
    );
    downloadBlob(result.blob, fileName);
    finish({ status: 'done', fileName, progress: 1 });
  } catch (error) {
    if (error instanceof ExportCancelled) finish({ status: 'cancelled', fileName, progress: 0 });
    else finish({ status: 'error', fileName, progress: 0, message: error instanceof Error ? error.message : String(error) });
  }
}

export function cancelRunningExport(): void {
  cancelExport();
}
