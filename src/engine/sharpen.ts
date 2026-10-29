import { LUMA_WEIGHTS } from './color';
import type { Size } from './geometry';

/**
 * Sharpening (Detail panel): an unsharp mask on luminance, applied to the
 * developed sRGB-encoded image before geometry. Only luminance is sharpened,
 * so edges get brighter/darker without colored halos:
 *
 *   out = c + amount · (Y − blur(Y))   for each channel of c
 *
 * blur is a separable Gaussian. On the GPU the horizontal pass is stored as
 * 16-bit fixed point (two bytes of an RGBA8 texture); quantize16 mirrors it.
 */

/** Largest kernel half-width in pixels (radius 3 → ceil(3σ) = 9). */
export const SHARPEN_MAX_TAPS = 9;
/** Number of weights (center + one side) passed to the shader. */
export const SHARPEN_WEIGHT_COUNT = SHARPEN_MAX_TAPS + 1;

export interface SharpenParams {
  /** Unsharp-mask strength: slider Amount / 100. */
  amount: number;
  /** Gaussian sigma in full-resolution pixels (slider Radius). */
  radius: number;
}

export function sharpenParams(detail: { sharpAmount: number; sharpRadius: number }): SharpenParams | null {
  if (detail.sharpAmount <= 0) return null;
  return { amount: detail.sharpAmount / 100, radius: detail.sharpRadius };
}

export interface SharpenKernel {
  /** Half-width in pixels; 0 means no blur (the mask has no effect). */
  taps: number;
  /** weights[i] for offset ±i, i = 0..SHARPEN_MAX_TAPS; normalized, zero past taps. */
  weights: Float32Array;
}

/**
 * Gaussian weights for sigma = radius · scale, where scale is the rendered
 * size over the full-resolution size (a proxy is sharpened proportionally).
 * Float32 so the CPU uses exactly the weights the shader receives.
 */
export function sharpenKernel(radius: number, scale = 1): SharpenKernel {
  const sigma = radius * scale;
  const weights = new Float32Array(SHARPEN_WEIGHT_COUNT);
  const taps = Math.min(SHARPEN_MAX_TAPS, Math.ceil(3 * sigma));
  if (sigma <= 0 || taps === 0) {
    weights[0] = 1;
    return { taps: 0, weights };
  }
  const raw: number[] = [];
  for (let i = 0; i <= taps; i++) raw.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const total = raw.reduce((sum, w, i) => sum + (i === 0 ? w : 2 * w), 0);
  raw.forEach((w, i) => (weights[i] = w / total));
  return { taps, weights };
}

/** The GPU stores the horizontal blur in 16 bits. */
export function quantize16(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 65535) / 65535;
}

/** Luminance of each pixel of an RGBA8 image, sRGB-encoded, in [0, 1]. */
export function lumaPlane(data: Uint8Array | Uint8ClampedArray, size: Size): Float64Array {
  const out = new Float64Array(size.width * size.height);
  for (let i = 0; i < out.length; i++) {
    const r = (data[i * 4] ?? 0) / 255;
    const g = (data[i * 4 + 1] ?? 0) / 255;
    const b = (data[i * 4 + 2] ?? 0) / 255;
    out[i] = LUMA_WEIGHTS[0] * r + LUMA_WEIGHTS[1] * g + LUMA_WEIGHTS[2] * b;
  }
  return out;
}

/** Separable Gaussian blur of a plane with clamped edges; the horizontal pass is 16-bit quantized. */
export function blurPlane(plane: Float64Array, size: Size, kernel: SharpenKernel): Float64Array {
  const { width: W, height: H } = size;
  const { taps, weights } = kernel;
  const tap = (i: number) => weights[Math.abs(i)] ?? 0;
  const horizontal = new Float64Array(plane.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let i = -taps; i <= taps; i++) sum += tap(i) * (plane[y * W + Math.min(W - 1, Math.max(0, x + i))] ?? 0);
      horizontal[y * W + x] = quantize16(sum);
    }
  }
  const out = new Float64Array(plane.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let j = -taps; j <= taps; j++) sum += tap(j) * (horizontal[Math.min(H - 1, Math.max(0, y + j)) * W + x] ?? 0);
      out[y * W + x] = sum;
    }
  }
  return out;
}

/**
 * Per-pixel luminance offset amount · (Y − blur(Y)) for the whole image, or
 * null when sharpening is off. Added to each channel by applyDetailRgba8.
 */
export function sharpenOffsets(data: Uint8Array | Uint8ClampedArray, size: Size, p: SharpenParams | null, scale = 1): Float64Array | null {
  if (!p) return null;
  const luma = lumaPlane(data, size);
  const blurred = blurPlane(luma, size, sharpenKernel(p.radius, scale));
  return luma.map((y, i) => p.amount * (y - (blurred[i] ?? 0)));
}
