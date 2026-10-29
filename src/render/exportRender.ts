/**
 * Export rendering, shared by the export worker and the main-thread
 * fallback (browsers without WebGL2 on an OffscreenCanvas in workers):
 * renders a photo at full resolution with the screen's pipeline, resizes
 * if asked, encodes, and copies EXIF per policy. The original is only read.
 */
import { pipelineParams } from '../engine/pipeline';
import { copyExif } from '../io/exifWrite';
import type { EditSettings } from '../model/editSettings';
import { exportSize, type ExportOptions } from '../model/exportOptions';
import type { RgbaImage } from './gl';
import { fitLongEdge } from './proxy';
import { Renderer } from './Renderer';

export type ExportStage = 'decode' | 'render' | 'encode';

/** A 2D canvas that can be encoded: OffscreenCanvas in workers, <canvas> on the main thread. */
export interface EncodableCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}

export interface ExportEnvironment {
  /** A renderer, reused between exports. */
  renderer: () => Renderer;
  createCanvas: (width: number, height: number) => EncodableCanvas;
  toBlob: (canvas: EncodableCanvas, type: string, quality?: number) => Promise<Blob>;
}

/** Final pixels at the export size: exact copy without resize, the browser's scaler with it. */
async function toCanvas(env: ExportEnvironment, image: RgbaImage, options: ExportOptions): Promise<EncodableCanvas> {
  const size = exportSize(image.width, image.height, options);
  const canvas = env.createCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for encoding');
  const data = new ImageData(new Uint8ClampedArray(image.data.buffer as ArrayBuffer), image.width, image.height);
  if (size.width === image.width && size.height === image.height) {
    ctx.putImageData(data, 0, 0);
    return canvas;
  }
  // resizeQuality is a hint some browsers ignore; the explicit draw size keeps the result right either way.
  const scaled = await createImageBitmap(data, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high', premultiplyAlpha: 'none' });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scaled, 0, 0, size.width, size.height);
  scaled.close();
  return canvas;
}

async function encode(env: ExportEnvironment, canvas: EncodableCanvas, original: Blob, options: ExportOptions): Promise<Blob> {
  if (options.format === 'png') return env.toBlob(canvas, 'image/png');
  const jpeg = await env.toBlob(canvas, 'image/jpeg', options.quality / 100);
  if (options.metadata === 'none' || original.type !== 'image/jpeg') return jpeg;
  const withExif = copyExif(await original.arrayBuffer(), new Uint8Array(await jpeg.arrayBuffer()), options.metadata);
  return new Blob([withExif.buffer as ArrayBuffer], { type: 'image/jpeg' });
}

export async function renderExport(
  env: ExportEnvironment,
  original: Blob,
  settings: EditSettings,
  options: ExportOptions,
  progress: (stage: ExportStage) => void,
): Promise<{ blob: Blob; width: number; height: number }> {
  progress('decode');
  const r = env.renderer();
  let bitmap = await createImageBitmap(original, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
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
  const image = r.readPixels(pipelineParams(settings), 'full');
  // Exports are occasional: give the GPU memory back instead of keeping full-size scratch images.
  r.clearImage();
  r.releaseScratch();
  progress('encode');
  const canvas = await toCanvas(env, image, options);
  const blob = await encode(env, canvas, original, options);
  return { blob, width: canvas.width, height: canvas.height };
}
