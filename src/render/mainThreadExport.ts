/**
 * Main-thread export, used when the worker can't render (no WebGL2 on an
 * OffscreenCanvas in workers, e.g. older Safari). Same code as the worker,
 * with a <canvas> instead. Slower for the UI, but it works.
 */
import { renderExport, type EncodableCanvas, type ExportEnvironment } from './exportRender';
import { Renderer } from './Renderer';

let renderer: Renderer | null = null;

const env: ExportEnvironment = {
  renderer: () => (renderer ??= Renderer.create(document.createElement('canvas'))),
  createCanvas: (width, height) => Object.assign(document.createElement('canvas'), { width, height }) as EncodableCanvas,
  toBlob: (canvas, type, quality) =>
    new Promise<Blob>((resolve, reject) =>
      (canvas as HTMLCanvasElement).toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))), type, quality),
    ),
};

export const exportOnMainThread: typeof renderExport extends (env: ExportEnvironment, ...rest: infer A) => infer R ? (...args: A) => R : never = (...args) =>
  renderExport(env, ...args);
