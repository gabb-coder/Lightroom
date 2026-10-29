/**
 * Vignette (Effects panel), applied after crop so it follows the visible
 * frame (design/Develop.dc.html: an elliptical gradient over the shown image,
 * clear to 45% of the way to the corners, full strength at the corners).
 * Negative amounts darken toward black, positive lighten toward white, on
 * sRGB-encoded values like the design's overlay.
 */

/** Strength at ±100 (the design's 0.75 overlay opacity). */
export const VIGNETTE_MAX = 0.75;
/** Normalized radius where the vignette starts (0 = center, 1 = corners). */
export const VIGNETTE_START = 0.45;

/** Signed strength in [−0.75, 0.75]; 0 means off. */
export function vignetteAmount(vignette: number): number {
  return (vignette / 100) * VIGNETTE_MAX;
}

/** 0 inside the clear area, rising smoothly to 1 at the corners. u, v in [0, 1]. */
export function vignetteMask(u: number, v: number): number {
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.5) * 2;
  const r = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
  const t = Math.min(1, Math.max(0, (r - VIGNETTE_START) / (1 - VIGNETTE_START)));
  return t * t * (3 - 2 * t);
}

/** Applies the vignette to one sRGB-encoded channel value in [0, 1]. */
export function applyVignette(c: number, amount: number, mask: number): number {
  if (amount < 0) return c * (1 + amount * mask);
  return c + (1 - c) * amount * mask;
}
