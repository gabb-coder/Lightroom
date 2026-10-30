import { create } from 'zustand';
import { DEFAULT_COPY_PANELS, normalizePanels, type SettingsClipboard, type SettingsPanel } from '../model/copySettings';
import { copySettings, pasteClipboard, pastePrevious, settingsSourceId, syncSettings, syncTargets } from './settingsSync';
import { readUiPrefs, writeUiPrefs } from './uiPrefs';

export type SettingsDialogMode = 'copy' | 'sync';

interface CopyPasteState {
  /** Copied settings for this session (not saved). */
  clipboard: SettingsClipboard | null;
  /** The Copy settings / Synchronize settings dialog, when open. */
  dialog: SettingsDialogMode | null;
  /** Panels ticked in the dialog; remembered between uses. */
  panels: readonly SettingsPanel[];
  /** Last result, e.g. "Pasted settings to 3 photos" (status line). */
  message: string | null;
  openDialog: (mode: SettingsDialogMode) => void;
  closeDialog: () => void;
  setPanels: (panels: readonly SettingsPanel[]) => void;
}

const storedPanels = readUiPrefs().copyPanels;

export const useCopyPasteStore = create<CopyPasteState>()((set) => ({
  clipboard: null,
  dialog: null,
  panels: Array.isArray(storedPanels) ? normalizePanels(storedPanels.filter((p) => typeof p === 'string')) : DEFAULT_COPY_PANELS,
  message: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  setPanels: (panels) => {
    const normalized = normalizePanels(panels);
    writeUiPrefs({ copyPanels: normalized });
    set({ panels: normalized });
  },
}));

let messageTimer: ReturnType<typeof setTimeout> | null = null;

/** Shows a short status message ("Pasted settings to 3 photos") for a few seconds. */
export function showMessage(message: string): void {
  if (messageTimer) clearTimeout(messageTimer);
  useCopyPasteStore.setState({ message });
  messageTimer = setTimeout(() => useCopyPasteStore.setState({ message: null }), 5000);
}

const photos = (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'}`;

/** "Copy settings…": opens the dialog when there is a photo to copy from. */
export function openCopyDialog(): void {
  if (settingsSourceId()) useCopyPasteStore.getState().openDialog('copy');
}

/** "Sync settings…": needs a source plus at least one other selected photo. */
export function openSyncDialog(): void {
  if (settingsSourceId() && syncTargets().length > 0) useCopyPasteStore.getState().openDialog('sync');
}

/** Confirms the open dialog: copies, or synchronizes to the other selected photos. */
export async function confirmSettingsDialog(): Promise<void> {
  const { dialog, panels } = useCopyPasteStore.getState();
  useCopyPasteStore.getState().closeDialog();
  if (dialog === 'copy') {
    const clipboard = await copySettings(panels);
    if (!clipboard) return;
    useCopyPasteStore.setState({ clipboard });
    showMessage(`Copied settings from ${clipboard.from}`);
  } else if (dialog === 'sync') {
    const targets = syncTargets().length;
    const changed = await syncSettings(panels);
    showMessage(`Synchronized settings to ${photos(targets)}${changed < targets ? ` (${changed} changed)` : ''}`);
  }
}

/** "Paste" / Ctrl+Shift+V. */
export async function pasteSettings(): Promise<void> {
  const { clipboard } = useCopyPasteStore.getState();
  if (!clipboard) return;
  const changed = await pasteClipboard(clipboard);
  showMessage(`Pasted settings to ${photos(changed)}`);
}

/** Develop's "Previous" button. */
export async function pasteFromPrevious(): Promise<void> {
  await pastePrevious();
}
