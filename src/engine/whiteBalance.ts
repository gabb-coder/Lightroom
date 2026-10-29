import { luminance, srgbToLinear, type Rgb } from './color';

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

/**
 * Temp/Tint that make linear color `c` neutral (the white balance
 * eyedropper). Solves gains[0]·r = gains[1]·g = gains[2]·b for the gain
 * model above, rounded to whole slider steps and clamped to ±100 (a color
 * too strong to neutralize gets as close as the sliders allow). Null for
 * black or invalid samples.
 */
export function neutralizingWhiteBalance(c: Rgb): { temp: number; tint: number } | null {
  const [r, g, b] = c;
  if (!(r > 0 && g > 0 && b > 0) || !Number.isFinite(r + g + b)) return null;
  // 2^(2·S·t) = b/r  and  2^(-W·k) = sqrt(r·b)/g  (S, W = temp/tint stops).
  const t = Math.log2(b / r) / (2 * WB_TEMP_STOPS);
  const k = Math.log2(g / Math.sqrt(r * b)) / WB_TINT_STOPS;
  const slider = (v: number) => Math.max(-100, Math.min(100, Math.round(v * 100))) + 0; // + 0 turns -0 into 0
  return { temp: slider(t), tint: slider(k) };
}

/** Mean linear-light color of RGBA8 sRGB bytes (what the eyedropper samples), or null if empty. */
export function averageLinear(rgba: Uint8Array | Uint8ClampedArray): Rgb | null {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return null;
  const sum = [0, 0, 0];
  for (let i = 0; i < n * 4; i += 4) {
    for (let ch = 0; ch < 3; ch++) sum[ch] = (sum[ch] ?? 0) + srgbToLinear((rgba[i + ch] ?? 0) / 255);
  }
  return [(sum[0] ?? 0) / n, (sum[1] ?? 0) / n, (sum[2] ?? 0) / n];
}
