/**
 * Writing exports into a folder the user picks (M19), with the File System
 * Access API where the browser has it (Chromium); elsewhere exports go to
 * the downloads folder. Only the minimal surface we use is typed here.
 */

export interface WritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandle {
  createWritable(): Promise<WritableFile>;
}

export interface DirectoryHandle {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
}

type Picker = (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandle>;

function picker(): Picker | null {
  const fn = (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  return typeof fn === 'function' ? fn : null;
}

export function supportsFolderExport(): boolean {
  return picker() !== null;
}

/** Asks for a folder; null if the user cancels. Must run in a click handler (user gesture). */
export async function pickFolder(): Promise<DirectoryHandle | null> {
  const fn = picker();
  if (!fn) return null;
  try {
    return await fn.call(globalThis, { id: 'darkroom-export', mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

/** The folder to write into: `subfolder` inside the picked one (created if needed), or the picked one. */
export async function exportFolder(root: DirectoryHandle, subfolder: string): Promise<DirectoryHandle> {
  const name = subfolder.trim();
  return name ? root.getDirectoryHandle(name, { create: true }) : root;
}

async function exists(dir: DirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** "photo-2.jpg" style names until one is free in the folder. */
export async function freeName(dir: DirectoryHandle, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; await exists(dir, candidate); n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}

/** Writes a file without overwriting anything; returns the name used. */
export async function writeFile(dir: DirectoryHandle, name: string, blob: Blob): Promise<string> {
  const free = await freeName(dir, name);
  const file = await (await dir.getFileHandle(free, { create: true })).createWritable();
  await file.write(blob);
  await file.close();
  return free;
}
