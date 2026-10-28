import { luminance, type Rgb } from './color';

/** Stops of red/blue split at Temp ±100. */
export const WB_TEMP_STOPS = 0.5;
/** Stops of green cut (magenta) or boost (green) at Tint ±100. */
export const WB_TINT_STOPS = 0.4;

/**
 * Per-channel linear gains for Temp/Tint in [-100, 100]. Positive Temp is
 * warmer (more red, less blue); positive Tint is more magenta (less green).
 * Gains are normalized so a neutral gray keeps its luminance.
 */
export function whiteBalanceGains(temp: number, tint: number): Rgb {
  if (temp === 0 && tint === 0) return [1, 1, 1];
  const t = temp / 100;
  const k = tint / 100;
  const raw: Rgb = [Math.pow(2, WB_TEMP_STOPS * t), Math.pow(2, -WB_TINT_STOPS * k), Math.pow(2, -WB_TEMP_STOPS * t)];
  const n = luminance(raw);
  return [raw[0] / n, raw[1] / n, raw[2] / n];
}

export function applyWhiteBalance(c: Rgb, gains: Rgb): Rgb {
  return [c[0] * gains[0], c[1] * gains[1], c[2] * gains[2]];
}
