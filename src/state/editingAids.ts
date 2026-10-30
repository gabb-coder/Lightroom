import { autoTone } from '../engine/autoTone';
import { averageLinear, neutralizingWhiteBalance } from '../engine/whiteBalance';
import { defaultMaskRange, type EditSettings } from '../model/editSettings';
import { hueOf } from '../engine/masks';
import { fitLongEdge } from '../render/proxy';
import { useDevelopStore, type LoadedPhoto } from './developStore';

/**
 * Editing aids (M20): the white balance eyedropper and Auto tone. Both
 * measure the original photo and then make ONE history step through
 * `applySettings`. Canvas 2D is used here only to read the original's
 * pixels for measuring, never to apply an edit.
 */

/** Long edge of the copy Auto tone measures. */
export const AUTO_SAMPLE_EDGE = 96;

/** RGBA8 of a region of the photo, drawn at `out` size. */
function readRegion(bitmap: ImageBitmap, region: { x: number; y: number; w: number; h: number }, out: { width: number; height: number }): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(out.width, out.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, region.x, region.y, region.w, region.h, 0, 0, out.width, out.height);
  return ctx.getImageData(0, 0, out.width, out.height).data;
}

/** Eyedropper sample radius in photo pixels: a few pixels, more on big photos (averages out noise). */
export function sampleRadius(size: { width: number; height: number }): number {
  return Math.max(1, Math.round(Math.max(size.width, size.height) / 800));
}

/** The square of photo pixels around normalized point (u, v), clipped to the photo. */
export function sampleRegion(size: { width: number; height: number }, u: number, v: number) {
  const r = sampleRadius(size);
  const cx = Math.min(size.width - 1, Math.max(0, Math.floor(u * size.width)));
  const cy = Math.min(size.height - 1, Math.max(0, Math.floor(v * size.height)));
  const x = Math.max(0, cx - r);
  const y = Math.max(0, cy - r);
  return { x, y, w: Math.min(size.width, cx + r + 1) - x, h: Math.min(size.height, cy + r + 1) - y };
}

/**
 * Range eyedropper (M30): sets the selected mask's color range to the hue
 * at normalized source point (u, v) and turns the picker off. False when
 * nothing usable was there (no mask, outside the photo, a gray spot).
 */
export function pickRangeColor(u: number, v: number): boolean {
  const { photo, settings, selectedMaskId, updateMask, setRangePicking } = useDevelopStore.getState();
  setRangePicking(false);
  const mask = settings.masks.find((m) => m.id === selectedMaskId);
  if (!photo || !mask || u < 0 || u > 1 || v < 0 || v > 1) return false;
  const region = sampleRegion(bitmapSize(photo), u, v);
  const px = readRegion(photo.bitmap, region, { width: region.w, height: region.h });
  const sum = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (px[i + c] ?? 0);
  const n = px.length / 4;
  const [r, g, b] = sum.map((x) => x / n / 255);
  if (r === undefined || g === undefined || b === undefined || Math.max(r, g, b) - Math.min(r, g, b) < 0.02) return false;
  const range = { ...defaultMaskRange(), ...mask.range, kind: 'color' as const, hue: Math.round(hueOf(r, g, b)) };
  updateMask(mask.id, { range }, 'Mask color range', null);
  return true;
}

function withBasic(settings: EditSettings, patch: Partial<EditSettings['basic']>): EditSettings {
  return { ...settings, basic: { ...settings.basic, ...patch } };
}

/**
 * Sets Temp/Tint so the photo is neutral at normalized source point (u, v)
 * and turns the eyedropper off. Returns false if nothing could be measured
 * (e.g. a pure black spot).
 */
export function pickWhiteBalance(u: number, v: number): boolean {
  const { photo, settings, applySettings, setWbPicking } = useDevelopStore.getState();
  setWbPicking(false);
  if (!photo || u < 0 || u > 1 || v < 0 || v > 1) return false;
  const size = bitmapSize(photo);
  const region = sampleRegion(size, u, v);
  const color = averageLinear(readRegion(photo.bitmap, region, { width: region.w, height: region.h }));
  const wb = color ? neutralizingWhiteBalance(color) : null;
  if (!wb) return false;
  applySettings('White balance', withBasic(settings, wb));
  return true;
}

/** Auto tone on the open photo (one history step). */
export function runAutoTone(): void {
  const { photo, settings, applySettings } = useDevelopStore.getState();
  if (!photo) return;
  const size = bitmapSize(photo);
  const sample = readRegion(photo.bitmap, { x: 0, y: 0, w: size.width, h: size.height }, fitLongEdge(size, AUTO_SAMPLE_EDGE));
  applySettings('Auto tone', withBasic(settings, autoTone(sample, settings.basic)));
}

function bitmapSize(photo: LoadedPhoto) {
  return { width: photo.bitmap.width, height: photo.bitmap.height };
}
