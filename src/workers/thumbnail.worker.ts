/**
 * Thumbnail worker: decodes photos off the main thread, reads the EXIF date
 * and makes JPEG thumbnails. Canvas 2D is fine here: thumbnails of originals
 * are resizes, not edits. Edited thumbnails arrive as already-rendered pixels.
 */
import { EXIF_SCAN_BYTES, readExifCaptureDate } from '../io/exif';
import { fitLongEdge } from '../render/proxy';
import { THUMBNAIL_QUALITY, type DecodeResult, type ThumbnailRequest, type ThumbnailResponse } from './thumbnailProtocol';

/** The parts of DedicatedWorkerGlobalScope we use (the DOM lib types `self` as Window). */
interface WorkerScope {
  onmessage: ((e: MessageEvent<ThumbnailRequest>) => void) | null;
  postMessage(message: ThumbnailResponse): void;
}
const scope = self as unknown as WorkerScope;

async function toJpeg(source: ImageBitmap | ImageData, width: number, height: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context in worker');
  if (source instanceof ImageData) ctx.putImageData(source, 0, 0);
  else ctx.drawImage(source, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: THUMBNAIL_QUALITY });
}

async function decode(blob: Blob, longEdge: number): Promise<DecodeResult> {
  const exifDate = readExifCaptureDate(await blob.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const size = fitLongEdge(bitmap, longEdge);
    const small = await createImageBitmap(bitmap, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
    const thumbnail = await toJpeg(small, size.width, size.height);
    small.close();
    return { width: bitmap.width, height: bitmap.height, exifDate, thumbnail };
  } finally {
    bitmap.close();
  }
}

scope.onmessage = async (e) => {
  const req = e.data;
  try {
    if (req.kind === 'decode') {
      scope.postMessage({ id: req.id, ok: true, kind: 'decode', result: await decode(req.blob, req.longEdge) });
    } else {
      const image = new ImageData(new Uint8ClampedArray(req.pixels), req.width, req.height);
      scope.postMessage({ id: req.id, ok: true, kind: 'encode', blob: await toJpeg(image, req.width, req.height) });
    }
  } catch (error) {
    scope.postMessage({ id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
