/**
 * Export worker: runs render/exportRender.ts on an OffscreenCanvas. If this
 * browser can't do WebGL2 in a worker, the job fails here and the client
 * retries on the main thread (workers/exportClient.ts).
 */
import { renderExport, type ExportEnvironment } from '../render/exportRender';
import { Renderer } from '../render/Renderer';
import type { ExportRequest, ExportResponse } from './exportProtocol';

interface WorkerScope {
  onmessage: ((e: MessageEvent<ExportRequest>) => void) | null;
  postMessage(message: ExportResponse): void;
}
const scope = self as unknown as WorkerScope;

let renderer: Renderer | null = null;

const env: ExportEnvironment = {
  renderer: () => (renderer ??= Renderer.create(new OffscreenCanvas(1, 1))),
  createCanvas: (width, height) => new OffscreenCanvas(width, height),
  toBlob: (canvas, type, quality) => (canvas as OffscreenCanvas).convertToBlob({ type, quality }),
};

scope.onmessage = async (e) => {
  const req = e.data;
  try {
    const result = await renderExport(env, req.original, req.settings, req.options, (stage) => scope.postMessage({ id: req.id, kind: 'progress', stage }));
    scope.postMessage({ id: req.id, kind: 'done', ...result });
  } catch (error) {
    scope.postMessage({ id: req.id, kind: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
