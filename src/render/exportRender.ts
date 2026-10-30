/**
 * Export rendering, shared by the export worker and the main-thread
 * fallback (browsers without WebGL2 on an OffscreenCanvas in workers):
 * renders a photo at full resolution with the screen's pipeline, resizes
 * if asked, lays the logo watermark on (M23), encodes, and copies EXIF per
 * policy. The original is only read.
 */
import { pipelineParams } from '../engine/pipeline';
import { applyOutputSharpen, outputSharpenParams } from '../engine/outputSharpen';
import { applyWatermark } from '../engine/watermark';
import { copyExif } from '../io/exifWrite';
import type { EditSettings } from '../model/editSettings';
import { exportSize, hasWatermark, type ExportOptions } from '../model/exportOptions';
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

/** The logo's RGBA8 pixels (straight alpha). Canvas 2D only decodes here; the compositing is engine/watermark.ts. */
async function logoPixels(env: ExportEnvironment, logo: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(logo, { premultiplyAlpha: 'none' });
  const canvas = env.createCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for the logo');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

/** Output sharpening (M34) on the final pixels, after any resize and before the watermark. */
function sharpenForOutput(canvas: EncodableCanvas, options: ExportOptions): void {
  const p = outputSharpenParams(options.outputSharpen, options.sharpenAmount);
  if (!p) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for encoding');
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyOutputSharpen(image, p);
  ctx.putImageData(image, 0, 0);
}

/** Lays the logo on the final pixels, if the options ask for one. */
async function watermark(env: ExportEnvironment, canvas: EncodableCanvas, options: ExportOptions, logo: Blob | null): Promise<void> {
  if (!logo || !hasWatermark(options)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for encoding');
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyWatermark(image, await logoPixels(env, logo), options.watermark, options.watermark.opacity / 100);
  ctx.putImageData(image, 0, 0);
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
  logo: Blob | null = null,
): Promise<{ blob: Blob; width: number; height: number; reducedTo?: number }> {
  progress('decode');
  const r = env.renderer();
  let bitmap = await createImageBitmap(original, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
  const fits = fitLongEdge(bitmap, r.maxTextureSize);
  const reducedTo = fits.width !== bitmap.width ? r.maxTextureSize : undefined;
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
  sharpenForOutput(canvas, options);
  await watermark(env, canvas, options, logo);
  const blob = await encode(env, canvas, original, options);
  return { blob, width: canvas.width, height: canvas.height, reducedTo };
}
