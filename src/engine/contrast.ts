import { mapRgb, type Rgb } from './color';

/**
 * Contrast works on a perceptual encoding of linear light, q = x^(1/2.2), so
 * the pivot sits near middle gray. On [0, 1] it is a cubic S-curve with fixed
 * points 0, 0.5 and 1:
 *
 *   f(q) = q + a * q * (1 - q) * (2q - 1)
 *
 * f'(0) = f'(1) = 1 - a and f'(0.5) = 1 + a/2, so it is monotonic for
 * a in [-2, 1]. Above 1 (values pushed past white by exposure) it continues
 * as a straight line with slope 1 - a, keeping it continuous and monotonic.
 */
export const CONTRAST_GAMMA = 2.2;

/** Max |a|. Keeps the curve strictly increasing at both slider extremes. */
const CONTRAST_STRENGTH = 0.9;

/** Curve amount `a` for a Contrast slider value in [-100, 100]. */
export function contrastAmount(contrast: number): number {
  return (CONTRAST_STRENGTH * contrast) / 100;
}

/** The S-curve on the perceptual value q >= 0. */
export function contrastCurve(q: number, a: number): number {
  if (q >= 1) return 1 + (1 - a) * (q - 1);
  return q + a * q * (1 - q) * (2 * q - 1);
}

export function applyContrast(c: Rgb, a: number): Rgb {
  if (a === 0) return c;
  return mapRgb(c, (x) => {
    const q = Math.pow(Math.max(x, 0), 1 / CONTRAST_GAMMA);
    return Math.pow(contrastCurve(q, a), CONTRAST_GAMMA);
  });
}
