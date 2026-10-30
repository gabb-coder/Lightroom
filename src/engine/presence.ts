import { LUMA_WEIGHTS } from './color';
import type { Size } from './geometry';
import { blurPlane, gaussianKernel, quantize16, type SharpenKernel } from './sharpen';

/**
 * Presence (M26): Texture, Clarity and Dehaze, applied in the detail stage
 * on the developed sRGB-encoded image, like sharpening.
 *
 * All three need the neighbourhood of a pixel at a radius relative to the
 * photo (so a proxy looks like the full-size render). Blurring at that
 * radius in full resolution would be far too slow, so each one works on a
 * "level": the image averaged over factor × factor blocks (factor chosen so
 * the long edge is at most `maxEdge`), Gaussian-blurred there, and sampled
 * back bilinearly. A level holds two planes, luminance and the dark channel
 * (min of R, G, B), each stored as 16-bit fixed point after every step, as
 * the GPU does in an RGBA8 texture.
 *
 *   Texture: c + T · soft(Y − blurT)               (medium detail)
 *   Clarity: c + 1.5 C · 4Y(1 − Y) · soft(Y − blurC)  (large-scale contrast, midtones)
 *   Dehaze:  per channel, a simplified dark-channel haze model with white
 *            airlight: c' = 1 − (1 − c) / t,  t = 1 − 0.85 · h · dark;
 *            negative values add an even, light veil instead.
 *
 * soft(d) = d / (1 + 4|d|) keeps strong edges from getting halos.
 */

export const PRESENCE_MAX_TAPS = 16;
export const PRESENCE_WEIGHT_COUNT = PRESENCE_MAX_TAPS + 1;

export interface LevelSpec {
  /** Longest edge of the level, in level pixels (or the image's, if smaller). */
  maxEdge: number;
  /** Gaussian sigma as a fraction of the level's long edge (at least 1 level pixel). */
  radius: number;
}

export const TEXTURE_LEVEL: LevelSpec = { maxEdge: 1024, radius: 0.003 };
export const CLARITY_LEVEL: LevelSpec = { maxEdge: 256, radius: 0.02 };

/** Clarity +100 strength. */
export const CLARITY_GAIN = 1.5;
/** How strongly Dehaze +100 removes the dark channel (ω in the haze model). */
export const DEHAZE_STRENGTH = 0.85;
/** Dehaze −100 mixes this much of the veil in. */
export const HAZE_STRENGTH = 0.6;
/** Brightness of the added veil. */
export const HAZE_LEVEL = 0.9;

export interface PresenceParams {
  /** Slider / 100, in [−1, 1]. */
  texture: number;
  clarity: number;
  dehaze: number;
}

export function presenceParams(b: { texture: number; clarity: number; dehaze: number }): PresenceParams | null {
  if (b.texture === 0 && b.clarity === 0 && b.dehaze === 0) return null;
  return { texture: b.texture / 100, clarity: b.clarity / 100, dehaze: b.dehaze / 100 };
}

export interface LevelLayout {
  /** Source pixels per level pixel, along each axis. */
  factor: number;
  width: number;
  height: number;
  kernel: SharpenKernel;
}

export function levelLayout(size: Size, spec: LevelSpec): LevelLayout {
  const factor = Math.max(1, Math.ceil(Math.max(size.width, size.height) / spec.maxEdge));
  const width = Math.ceil(size.width / factor);
  const height = Math.ceil(size.height / factor);
  // At least one level pixel, so small images still get an effect.
  return { factor, width, height, kernel: gaussianKernel(Math.max(1, spec.radius * Math.max(width, height)), PRESENCE_MAX_TAPS) };
}

export interface Level {
  layout: LevelLayout;
  luma: Float64Array;
  dark: Float64Array;
}

/** Block averages of luminance and dark channel (edge blocks average only the pixels they have), 16-bit. */
function downsample(data: Uint8Array | Uint8ClampedArray, size: Size, layout: LevelLayout): { luma: Float64Array; dark: Float64Array } {
  const { factor: f, width, height } = layout;
  const luma = new Float64Array(width * height);
  const dark = new Float64Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x1 = Math.min(size.width, (i + 1) * f);
      const y1 = Math.min(size.height, (j + 1) * f);
      let sl = 0;
      let sd = 0;
      for (let y = j * f; y < y1; y++) {
        for (let x = i * f; x < x1; x++) {
          const k = (y * size.width + x) * 4;
          const r = (data[k] ?? 0) / 255;
          const g = (data[k + 1] ?? 0) / 255;
          const b = (data[k + 2] ?? 0) / 255;
          sl += LUMA_WEIGHTS[0] * r + LUMA_WEIGHTS[1] * g + LUMA_WEIGHTS[2] * b;
          sd += Math.min(r, g, b);
        }
      }
      const n = (x1 - i * f) * (y1 - j * f);
      luma[j * width + i] = quantize16(sl / n);
      dark[j * width + i] = quantize16(sd / n);
    }
  }
  return { luma, dark };
}

/** A level of a developed RGBA8 image: downsampled, then blurred (each step 16-bit). */
export function buildLevel(data: Uint8Array | Uint8ClampedArray, size: Size, spec: LevelSpec): Level {
  const layout = levelLayout(size, spec);
  const planes = downsample(data, size, layout);
  const blur = (plane: Float64Array) => blurPlane(plane, layout, layout.kernel).map(quantize16);
  return { layout, luma: blur(planes.luma), dark: blur(planes.dark) };
}

/** Bilinear sample of a level plane at full-size pixel (x, y), clamped at the edges. */
export function sampleLevel(plane: Float64Array, layout: LevelLayout, x: number, y: number): number {
  const u = (x + 0.5) / layout.factor - 0.5;
  const v = (y + 0.5) / layout.factor - 0.5;
  const i0f = Math.floor(u);
  const j0f = Math.floor(v);
  const fx = u - i0f;
  const fy = v - j0f;
  const ci = (i: number) => Math.min(layout.width - 1, Math.max(0, i));
  const cj = (j: number) => Math.min(layout.height - 1, Math.max(0, j));
  const at = (i: number, j: number) => plane[cj(j) * layout.width + ci(i)] ?? 0;
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  return mix(mix(at(i0f, j0f), at(i0f + 1, j0f), fx), mix(at(i0f, j0f + 1), at(i0f + 1, j0f + 1), fx), fy);
}

/** Soft limit on a local difference, so strong edges don't get halos. */
export function softDetail(d: number): number {
  return d / (1 + 4 * Math.abs(d));
}

/** Luminance offset from Texture (blurT = texture level) and Clarity (blurC = clarity level). */
export function presenceOffset(y: number, blurT: number, blurC: number, p: PresenceParams): number {
  return p.texture * softDetail(y - blurT) + p.clarity * CLARITY_GAIN * 4 * y * (1 - y) * softDetail(y - blurC);
}

/** Dehaze one sRGB-encoded channel, given the local dark channel. */
export function dehazeChannel(c: number, dark: number, amount: number): number {
  if (amount > 0) {
    const t = 1 - DEHAZE_STRENGTH * amount * dark;
    return 1 - (1 - c) / t;
  }
  if (amount < 0) {
    const k = -amount * HAZE_STRENGTH;
    return c * (1 - k) + HAZE_LEVEL * k;
  }
  return c;
}

/** The levels a setting needs: texture for Texture, the coarse one for Clarity and Dehaze. */
export function presenceLevels(data: Uint8Array | Uint8ClampedArray, size: Size, p: PresenceParams | null): { texture: Level | null; coarse: Level | null } {
  return {
    texture: p && p.texture !== 0 ? buildLevel(data, size, TEXTURE_LEVEL) : null,
    coarse: p && (p.clarity !== 0 || p.dehaze !== 0) ? buildLevel(data, size, CLARITY_LEVEL) : null,
  };
}
