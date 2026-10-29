/**
 * Export worker: renders a photo at full resolution with the same WebGL2
 * pipeline as the screen (on an OffscreenCanvas), then resizes and encodes.
 * The original blob is only read, never written.
 */
import { pipelineParams } from '../engine/pipeline';
import { copyExif } from '../io/exifWrite';
import { exportSize, type ExportOptions } from '../model/exportOptions';
import type { RgbaImage } from '../render/gl';
import { fitLongEdge } from '../render/proxy';
import { Renderer } from '../render/Renderer';
import type { ExportRequest, ExportResponse } from './exportProtocol';

interface WorkerScope {
  onmessage: ((e: MessageEvent<ExportRequest>) => void) | null;
  postMessage(message: ExportResponse): void;
}
const scope = self as unknown as WorkerScope;

let renderer: Renderer | null = null;

function getRenderer(): Renderer {
  renderer ??= Renderer.create(new OffscreenCanvas(1, 1));
  return renderer;
}

/** Final pixels at the export size: exact copy without resize, browser high-quality scaler with it. */
async function toCanvas(image: RgbaImage, options: ExportOptions): Promise<OffscreenCanvas> {
  const size = exportSize(image.width, image.height, options);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for encoding');
  const data = new ImageData(new Uint8ClampedArray(image.data.buffer as ArrayBuffer), image.width, image.height);
  if (size.width === image.width && size.height === image.height) {
    ctx.putImageData(data, 0, 0);
  } else {
    const scaled = await createImageBitmap(data, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high', premultiplyAlpha: 'none' });
    ctx.drawImage(scaled, 0, 0);
    scaled.close();
  }
  return canvas;
}

async function encode(canvas: OffscreenCanvas, original: Blob, options: ExportOptions): Promise<Blob> {
  if (options.format === 'png') return canvas.convertToBlob({ type: 'image/png' });
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: options.quality / 100 });
  if (options.metadata === 'none' || original.type !== 'image/jpeg') return jpeg;
  const withExif = copyExif(await original.arrayBuffer(), new Uint8Array(await jpeg.arrayBuffer()), options.metadata);
  return new Blob([withExif.buffer as ArrayBuffer], { type: 'image/jpeg' });
}

async function run(req: ExportRequest): Promise<ExportResponse> {
  const progress = (stage: 'decode' | 'render' | 'encode') => scope.postMessage({ id: req.id, kind: 'progress', stage });
  progress('decode');
  const r = getRenderer();
  let bitmap = await createImageBitmap(req.original, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
  const fits = fitLongEdge(bitmap, r.maxTextureSize);
  if (fits.width !== bitmap.width) {
    // Larger than the GPU can hold: export at the largest size it can.
    const smaller = await createImageBitmap(bitmap, { resizeWidth: fits.width, resizeHeight: fits.height, resizeQuality: 'high', premultiplyAlpha: 'none' });
    bitmap.close();
    bitmap = smaller;
  }
  progress('render');
  r.setImage({ full: bitmap });
  bitmap.close();
  const image = r.readPixels(pipelineParams(req.settings), 'full');
  r.clearImage();
  progress('encode');
  const canvas = await toCanvas(image, req.options);
  const blob = await encode(canvas, req.original, req.options);
  return { id: req.id, kind: 'done', blob, width: canvas.width, height: canvas.height };
}

scope.onmessage = async (e) => {
  try {
    scope.postMessage(await run(e.data));
  } catch (error) {
    scope.postMessage({ id: e.data.id, kind: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
