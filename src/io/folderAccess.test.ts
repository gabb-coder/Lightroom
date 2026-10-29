import { describe, expect, it } from 'vitest';
import { exportFolder, writeFile, type DirectoryHandle } from './folderAccess';

/** In-memory folder with the File System Access shape. */
function memoryFolder(name = 'root', files = new Map<string, Blob>(), dirs = new Map<string, DirectoryHandle>()): DirectoryHandle & { files: Map<string, Blob> } {
  const folder: DirectoryHandle & { files: Map<string, Blob> } = {
    name,
    files,
    async getFileHandle(file, options) {
      if (!files.has(file) && !options?.create) throw new DOMException('missing', 'NotFoundError');
      return {
        async createWritable() {
          let data = new Blob([]);
          return {
            async write(blob: Blob) {
              data = blob;
            },
            async close() {
              files.set(file, data);
            },
          };
        },
      };
    },
    async getDirectoryHandle(dir, options) {
      const existing = dirs.get(dir);
      if (existing) return existing;
      if (!options?.create) throw new DOMException('missing', 'NotFoundError');
      const created = memoryFolder(dir);
      dirs.set(dir, created);
      return created;
    },
  };
  return folder;
}

describe('exporting into a folder', () => {
  it('never overwrites: later files get -2, -3', async () => {
    const dir = memoryFolder();
    expect(await writeFile(dir, 'a.jpg', new Blob(['1']))).toBe('a.jpg');
    expect(await writeFile(dir, 'a.jpg', new Blob(['2']))).toBe('a-2.jpg');
    expect(await writeFile(dir, 'a.jpg', new Blob(['3']))).toBe('a-3.jpg');
    expect(await dir.files.get('a.jpg')?.text()).toBe('1');
  });

  it('writes into a subfolder when one is named, else into the picked folder', async () => {
    const root = memoryFolder();
    const sub = await exportFolder(root, ' Trip ');
    expect(sub.name).toBe('Trip');
    expect(await exportFolder(root, '  ')).toBe(root);
    expect(await exportFolder(root, 'Trip')).toBe(sub);
  });
});
