import type { EditSettings } from '../model/editSettings';
import type { ExportOptions } from '../model/exportOptions';
import type { ExportResponse, ExportStage } from './exportProtocol';

let worker: Worker | null = null;
let nextId = 1;

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

let cancelCurrent: (() => void) | null = null;

/** Renders and encodes one photo in the export worker. */
export function exportInWorker(
  original: Blob,
  settings: EditSettings,
  options: ExportOptions,
  onStage: (stage: ExportStage) => void,
): Promise<{ blob: Blob; width: number; height: number }> {
  worker ??= new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<ExportResponse>) => {
      const res = e.data;
      if (res.id !== id) return;
      if (res.kind === 'progress') return onStage(res.stage);
      w.removeEventListener('message', onMessage);
      cancelCurrent = null;
      if (res.kind === 'done') resolve({ blob: res.blob, width: res.width, height: res.height });
      else reject(new Error(res.error));
    };
    w.addEventListener('message', onMessage);
    cancelCurrent = () => {
      // Stopping mid-render needs a fresh worker next time.
      w.terminate();
      worker = null;
      cancelCurrent = null;
      reject(new ExportCancelled());
    };
    w.postMessage({ id, original, settings, options });
  });
}

/** Stops the running export, if any. */
export function cancelExport(): void {
  cancelCurrent?.();
}
