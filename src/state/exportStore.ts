import { create } from 'zustand';
import { db, getOriginal } from '../db/db';
import { downloadBlob } from '../io/download';
import {
  BUILTIN_EXPORT_PRESETS,
  exportFileName,
  LOCATION_KEYS,
  normalizeExportOptions,
  sameLook,
  subfolderOf,
  type ExportOptions,
  type ExportPreset,
  uniqueFileNames,
  withLocation,
  zipEntryPath,
  zipFileName,
} from '../model/exportOptions';
import { exportFolder, pickFolder, supportsFolderExport, writeFile, type DirectoryHandle } from '../io/folderAccess';
import { createZip } from '../io/zip';
import { cancelExport, ExportCancelled, exportInWorker } from '../workers/exportClient';
import { STAGE_PROGRESS } from '../workers/exportProtocol';
import { useAppStore } from './appStore';
import { flushEdits } from './editPersistence';
import { selectLibraryList, useLibraryStore } from './libraryStore';
import { settingsOf } from './settingsSync';
import { readUiPrefs, writeUiPrefs } from './uiPrefs';

export interface ExportJob {
  status: 'running' | 'done' | 'error' | 'cancelled';
  /** The file being written (or the last one). */
  fileName: string;
  /** 0-based photo being exported, and the batch size. */
  index: number;
  total: number;
  /** Whole batch, 0..1 */
  progress: number;
  message?: string;
}

interface ExportState {
  options: ExportOptions;
  /** Highlighted preset; null once the options are changed by hand. */
  presetId: string | null;
  userPresets: readonly ExportPreset[];
  job: ExportJob | null;
  /** Folder picked for "A folder you choose" (this session only). */
  folder: DirectoryHandle | null;
  chooseFolder: () => Promise<boolean>;
  setOptions: (patch: Partial<ExportOptions>) => void;
  applyPreset: (preset: ExportPreset) => void;
  savePreset: (name: string) => void;
  setUserPresets: (presets: readonly ExportPreset[]) => void;
  setJob: (job: ExportJob | null) => void;
}

const initialOptions = normalizeExportOptions((readUiPrefs().exportOptions ?? {}) as Partial<ExportOptions>);

export const useExportStore = create<ExportState>()((set, get) => ({
  options: initialOptions,
  presetId: BUILTIN_EXPORT_PRESETS.find((p) => sameLook(p.options, initialOptions))?.id ?? null,
  userPresets: [],
  job: null,
  folder: null,
  chooseFolder: async () => {
    const folder = await pickFolder();
    if (folder) set({ folder });
    return folder !== null;
  },
  setOptions: (patch) => {
    const options = normalizeExportOptions({ ...get().options, ...patch });
    writeUiPrefs({ exportOptions: { ...options } });
    // Changing only where files go keeps the highlighted preset.
    const locationOnly = Object.keys(patch).every((k) => (LOCATION_KEYS as readonly string[]).includes(k));
    set((s) => ({ options, presetId: locationOnly ? s.presetId : null }));
  },
  applyPreset: (preset) => {
    // A preset is a look; where files go stays as chosen.
    const options = withLocation(normalizeExportOptions(preset.options), get().options);
    writeUiPrefs({ exportOptions: { ...options } });
    set({ options, presetId: preset.id });
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

/** The photos to export: every selected photo, in the order the grid shows them. */
export function exportTargets(): string[] {
  const library = useLibraryStore.getState();
  const selected = new Set(library.selection.ids);
  const ordered = selectLibraryList(library)
    .map((p) => p.id)
    .filter((id) => selected.has(id));
  return [...ordered, ...library.selection.ids.filter((id) => !ordered.includes(id))];
}

/** Renders one photo in the worker (or on the page, see exportClient). */
async function renderOne(photoId: string, options: ExportOptions, onProgress: (fraction: number) => void): Promise<Blob> {
  const original = await getOriginal(photoId);
  if (!original) throw new Error('This photo is no longer in the catalog.');
  const settings = await settingsOf(photoId);
  return (await exportInWorker(original.blob, settings, options, (stage) => onProgress(STAGE_PROGRESS[stage]))).blob;
}

/** Where a batch's files go, and what the done message says. */
interface Delivery {
  deliver: (fileName: string, blob: Blob) => Promise<void>;
  /** After the last photo (e.g. download the ZIP). */
  finish: () => Promise<void>;
  /** "Saved to Exports.zip", or null to show the file name / count. */
  label: string | null;
}

async function delivery(options: ExportOptions, total: number, folder: DirectoryHandle | null): Promise<Delivery> {
  if (options.destination === 'folder' && folder) {
    const dir = await exportFolder(folder, subfolderOf(options));
    const where = subfolderOf(options) ? `${folder.name}/${subfolderOf(options)}` : folder.name;
    return { deliver: async (name, blob) => void (await writeFile(dir, name, blob)), finish: async () => undefined, label: `Saved to ${where}` };
  }
  if (options.destination === 'zip' && total > 1) {
    const files: { name: string; data: Blob }[] = [];
    const zipName = zipFileName(options);
    return {
      deliver: async (name, blob) => void files.push({ name: zipEntryPath(options, name), data: blob }),
      finish: async () => {
        if (files.length) downloadBlob(await createZip(files), zipName);
      },
      label: `Saved to ${zipName}`,
    };
  }
  // One file each in the browser's downloads (a single photo never needs a ZIP).
  return { deliver: async (name, blob) => downloadBlob(blob, name), finish: async () => undefined, label: null };
}

/**
 * Exports the selected photos one after another at full resolution in the
 * worker and downloads each file. Originals in the catalog are only read.
 * A photo that fails is reported and the rest still export; Cancel stops
 * the batch.
 */
let cancelRequested = false;

export async function runExport(): Promise<void> {
  const ids = exportTargets();
  if (ids.length === 0 || useExportStore.getState().job?.status === 'running') return;
  // The folder picker needs the click's user gesture, so it comes first.
  const state = useExportStore.getState();
  if (state.options.destination === 'folder' && !supportsFolderExport()) state.setOptions({ destination: 'zip' });
  else if (state.options.destination === 'folder' && !state.folder && !(await state.chooseFolder())) return; // cancelled: stay in the dialog
  cancelRequested = false;
  const { options, setJob, folder } = useExportStore.getState();
  if (hideTimer) clearTimeout(hideTimer);
  closeExportDialog();
  await flushEdits();
  const records = await Promise.all(ids.map((id) => db.photos.get(id)));
  const names = uniqueFileNames(records.map((r, i) => (r ? exportFileName(options, r, i + 1) : '')));
  const total = ids.length;
  const out = await delivery(options, total, folder);
  const failed: string[] = [];
  let lastError = '';
  for (let index = 0; index < total; index++) {
    const fileName = names[index] ?? '';
    const progress = (fraction: number) => setJob({ status: 'running', fileName, index, total, progress: (index + fraction) / total });
    // Cancel pressed between two photos (no worker job to stop at that moment).
    if (cancelRequested) return finish({ status: 'cancelled', fileName, index, total, progress: index / total });
    progress(0);
    try {
      const id = ids[index];
      if (!id || !records[index]) throw new Error('This photo is no longer in the catalog.');
      await out.deliver(fileName, await renderOne(id, options, progress));
    } catch (error) {
      if (error instanceof ExportCancelled) return finish({ status: 'cancelled', fileName, index, total, progress: index / total });
      failed.push(records[index]?.fileName ?? fileName);
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  await out.finish();
  const last = names[total - 1] ?? '';
  const summary = out.label ? `${total > 1 ? `${total} photos. ` : ''}${out.label}` : total > 1 ? `${total} photos` : last;
  if (failed.length === 0) return finish({ status: 'done', fileName: summary, index: total - 1, total, progress: 1 });
  const message =
    total === 1 ? lastError : `${total - failed.length} of ${total} exported. Could not export ${failed.join(', ')}: ${lastError}`;
  finish({ status: 'error', fileName: last, index: total - 1, total, progress: 1, message });
}

export function cancelRunningExport(): void {
  cancelRequested = true;
  cancelExport();
}
