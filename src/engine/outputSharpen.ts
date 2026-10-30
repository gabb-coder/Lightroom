import type { Size } from './geometry';
import { blurPlane, gaussianKernel, lumaPlane } from './sharpen';

/**
 * Output sharpening (M34): a final unsharp mask on luminance for where the
 * photo is going, applied to the export's pixels after any resize (like the
 * watermark; CPU only, no GPU twin). Screens want a fine radius; paper,
 * where ink spreads, a wider one, matte more than glossy.
 *
 *   out = c + amount · (Y − blur_radius(Y))   for each channel of c
 */
export type OutputSharpenTarget = 'none' | 'screen' | 'matte' | 'glossy';
export type OutputSharpenAmount = 'low' | 'standard' | 'high';

export const OUTPUT_SHARPEN_RADIUS: Readonly<Record<Exclude<OutputSharpenTarget, 'none'>, number>> = { screen: 0.6, matte: 1.2, glossy: 0.9 };
export const OUTPUT_SHARPEN_AMOUNT: Readonly<Record<OutputSharpenAmount, number>> = { low: 0.35, standard: 0.65, high: 1 };
const MAX_TAPS = 4;

export interface OutputSharpenParams {
  radius: number;
  amount: number;
}

export function outputSharpenParams(target: OutputSharpenTarget, amount: OutputSharpenAmount): OutputSharpenParams | null {
  return target === 'none' ? null : { radius: OUTPUT_SHARPEN_RADIUS[target], amount: OUTPUT_SHARPEN_AMOUNT[amount] };
}

/** Sharpens an RGBA8 image in place (alpha untouched). */
export function applyOutputSharpen(image: Size & { data: Uint8Array | Uint8ClampedArray }, p: OutputSharpenParams): void {
  const luma = lumaPlane(image.data, image);
  const blurred = blurPlane(luma, image, gaussianKernel(p.radius, MAX_TAPS));
  for (let i = 0; i < luma.length; i++) {
    const offset = p.amount * ((luma[i] ?? 0) - (blurred[i] ?? 0));
    if (offset === 0) continue;
    for (let c = 0; c < 3; c++) {
      const k = i * 4 + c;
      image.data[k] = Math.round(Math.min(1, Math.max(0, (image.data[k] ?? 0) / 255 + offset)) * 255);
    }
  }
}
