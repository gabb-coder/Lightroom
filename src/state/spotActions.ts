import type { MaskView, Point2 } from '../model/maskEdit';
import { createSpot, type PixelSample } from '../model/spotEdit';
import { fitLongEdge } from '../render/proxy';
import { useDevelopStore, type LoadedPhoto } from './developStore';

/** Long edge of the copy used to pick spot sources. */
export const SPOT_SAMPLE_EDGE = 320;

const samples = new WeakMap<ImageBitmap, PixelSample>();

/**
 * A small copy of the open photo for picking sources (M28). Canvas 2D only
 * reads the original's pixels here; the retouch itself is the renderer's.
 */
function spotSample(photo: LoadedPhoto): PixelSample | null {
  const cached = samples.get(photo.bitmap);
  if (cached) return cached;
  const size = fitLongEdge({ width: photo.bitmap.width, height: photo.bitmap.height }, SPOT_SAMPLE_EDGE);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(photo.bitmap, 0, 0, size.width, size.height);
  const sample = { ...size, data: ctx.getImageData(0, 0, size.width, size.height).data };
  samples.set(photo.bitmap, sample);
  return sample;
}

/** Adds a spot at frame point p with the current options and an automatic source (one history step). */
export function addSpotAt(view: MaskView, p: Point2): void {
  const { photo, spotOptions, addSpot } = useDevelopStore.getState();
  if (!photo) return;
  let sample: PixelSample | null;
  try {
    sample = spotSample(photo);
  } catch {
    sample = null; // no Canvas 2D: a fixed offset is used instead
  }
  addSpot(createSpot(crypto.randomUUID(), view, p, spotOptions, sample));
}
