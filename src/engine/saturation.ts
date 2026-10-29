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

/** Vibrance amount in [-1, 1] for a slider value in [-100, 100]. */
export function vibranceAmount(vibrance: number): number {
  return vibrance / 100;
}

/**
 * Vibrance: like saturation, but weighted toward muted colors. A pixel's
 * saturation is (max - min) / max; fully saturated pixels are left alone.
 */
export function applyVibrance(c: Rgb, amount: number): Rgb {
  if (amount === 0) return c;
  const max = Math.max(c[0], c[1], c[2]);
  const min = Math.min(c[0], c[1], c[2]);
  const sat = max > 0 ? (max - min) / max : 0;
  return applySaturation(c, Math.max(0, 1 + amount * (1 - sat)));
}
