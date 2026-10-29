import { importFiles, importProblemMessage } from '../io/importPhotos';
import { useLibraryStore } from './libraryStore';

/** Imports files and selects the first new photo (which opens it if Develop is showing). */
export async function importAndSelect(files: readonly File[]): Promise<void> {
  const library = useLibraryStore.getState();
  if (files.length === 0) return;
  library.setImportMessage(null);
  try {
    const result = await importFiles(files, (p) => useLibraryStore.getState().setImporting(p));
    useLibraryStore.getState().setImportMessage(importProblemMessage(result));
    const first = result.imported[0];
    if (first) {
      useLibraryStore.getState().setView('all');
      useLibraryStore.getState().select(first);
    }
  } finally {
    useLibraryStore.getState().setImporting(null);
  }
}

let input: HTMLInputElement | null = null;

/** Registers the app's hidden file input (see ImportInput). */
export function registerImportInput(el: HTMLInputElement | null): void {
  input = el;
}

/** Opens the system file picker for importing photos. */
export function openImportPicker(): void {
  input?.click();
}
