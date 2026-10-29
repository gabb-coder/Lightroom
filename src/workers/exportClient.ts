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
  let useMainThread = forceMainThread();

  /**
   * Renders and encodes one photo at full resolution, in the worker; if the
   * worker can't (e.g. no WebGL2 on an OffscreenCanvas there), on the main
   * thread instead.
   */
  async function run(original: Blob, settings: EditSettings, options: ExportOptions, onStage: (stage: ExportStage) => void = () => undefined): Promise<ExportResult> {
    if (!useMainThread) {
      try {
        return await runInWorker(original, settings, options, onStage);
      } catch (error) {
        if (error instanceof ExportCancelled) throw error;
        if (!isWorkerCapabilityError(error)) throw error;
        useMainThread = true;
      }
    }
    const { exportOnMainThread } = await import('../render/mainThreadExport');
    return exportOnMainThread(original, settings, options, onStage);
  }

  function runInWorker(original: Blob, settings: EditSettings, options: ExportOptions, onStage: (stage: ExportStage) => void): Promise<ExportResult> {
    worker ??= new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    const w = worker;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const done = () => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        cancelCurrent = null;
      };
      const onMessage = (e: MessageEvent<ExportResponse>) => {
        const res = e.data;
        if (res.id !== id) return;
        if (res.kind === 'progress') return onStage(res.stage);
        done();
        if (res.kind === 'done') resolve({ blob: res.blob, width: res.width, height: res.height });
        else reject(new Error(res.error));
      };
      // The worker script itself failed (e.g. module workers unsupported): never answers, so fall back.
      const onError = (e: ErrorEvent) => {
        e.preventDefault();
        done();
        w.terminate();
        worker = null;
        reject(new Error(`Worker failed: ${e.message || 'could not start'}`));
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
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

/** `?export=main` renders exports on the main thread (tests of the fallback). */
function forceMainThread(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('export') === 'main';
}

/** Errors that mean "this browser can't render in a worker", as opposed to a bad photo. */
export function isWorkerCapabilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WebGL2|OffscreenCanvas|getContext|Worker/i.test(message);
}

const exportClient = createExportClient();

/** Renders and encodes one photo in the export worker. */
export const exportInWorker = exportClient.run;

/** Stops the running export, if any. */
export const cancelExport = exportClient.cancel;
