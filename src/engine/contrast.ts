/**
 * Contrast curve, used inside the tone stage (engine/tone.ts) on the
 * perceptual value q = x^(1/2.2). On [0, 1] it is a cubic S-curve with fixed
 * points 0, 0.5 and 1:
 *
 *   f(q) = q + a * q * (1 - q) * (2q - 1)
 *
 * f'(0) = f'(1) = 1 - a and f'(0.5) = 1 + a/2, so it is monotonic for
 * a in [-2, 1]. Above 1 (values pushed past white by exposure) it continues
 * as a straight line with slope 1 - a, keeping it continuous and monotonic.
 */

/** Max |a|. Keeps the curve strictly increasing at both slider extremes. */
const CONTRAST_STRENGTH = 0.9;

/** Curve amount `a` for a Contrast slider value in [-100, 100]. */
export function contrastAmount(contrast: number): number {
  return (CONTRAST_STRENGTH * contrast) / 100;
}

export function contrastCurve(q: number, a: number): number {
  if (a === 0) return q;
  if (q >= 1) return 1 + (1 - a) * (q - 1);
  return q + a * q * (1 - q) * (2 * q - 1);
}
