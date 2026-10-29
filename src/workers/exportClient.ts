import type { EditSettings } from '../model/editSettings';
import type { ExportOptions } from '../model/exportOptions';
import type { ExportResponse, ExportStage } from './exportProtocol';

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * One export worker (its own WebGL context), running one job at a time.
 * Separate clients keep user exports and background thumbnail renders from
 * cancelling each other.
 */
export function createExportClient() {
  let worker: Worker | null = null;
  let nextId = 1;
  let cancelCurrent: (() => void) | null = null;

  /** Renders and encodes one photo at full resolution. */
  function run(original: Blob, settings: EditSettings, options: ExportOptions, onStage: (stage: ExportStage) => void = () => undefined): Promise<ExportResult> {
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

  /** Stops the running job, if any. */
  function cancel(): void {
    cancelCurrent?.();
  }

  return { run, cancel };
}

const exportClient = createExportClient();

/** Renders and encodes one photo in the export worker. */
export const exportInWorker = exportClient.run;

/** Stops the running export, if any. */
export const cancelExport = exportClient.cancel;
