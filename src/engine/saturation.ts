import { luminance, mapRgb, type Rgb } from './color';

/** Chroma scale for a Saturation slider value in [-100, 100]. -100 is gray. */
export function saturationScale(saturation: number): number {
  return 1 + saturation / 100;
}

/**
 * Saturation stage, in linear light: moves each channel away from (or toward)
 * the pixel's luminance, which is preserved. Negative results are clipped.
 */
export function applySaturation(c: Rgb, scale: number): Rgb {
  if (scale === 1) return c;
  const y = luminance(c);
  return mapRgb(c, (v) => Math.max(0, y + (v - y) * scale));
}
