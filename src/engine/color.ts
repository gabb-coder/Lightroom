/** RGB triple. Channels are linear-light or sRGB-encoded depending on context. */
export type Rgb = readonly [number, number, number];

/** Rec. 709 / sRGB luminance weights for linear-light RGB. */
export const LUMA_WEIGHTS: Rgb = [0.2126, 0.7152, 0.0722];

/** IEC 61966-2-1 sRGB decode of one channel in [0, 1]. */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** IEC 61966-2-1 sRGB encode of one linear channel in [0, 1]. */
export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function luminance([r, g, b]: Rgb): number {
  return LUMA_WEIGHTS[0] * r + LUMA_WEIGHTS[1] * g + LUMA_WEIGHTS[2] * b;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function mapRgb(c: Rgb, fn: (v: number) => number): Rgb {
  return [fn(c[0]), fn(c[1]), fn(c[2])];
}
