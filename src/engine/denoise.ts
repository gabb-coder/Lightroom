import { LUMA_WEIGHTS } from './color';
import type { Size } from './geometry';
import { gaussianKernel, lumaPlane, quantize16, type SharpenKernel } from './sharpen';

/**
 * Noise reduction (M27, Detail panel), run on the developed sRGB-encoded
 * image before sharpening, like Lightroom. The image is split into
 * luminance Y and color differences dr = R − Y, db = B − Y (G follows from
 * the luminance weights).
 *
 * Luminance: a separable bilateral filter on Y. Neighbours are weighted by
 * distance (Gaussian, LUMA_SPATIAL_SIGMA full-resolution pixels) and by how
 * close their value is (Gaussian of the difference, sigma = slider ×
 * LUMA_RANGE_MAX), so grain is smoothed and edges stay.
 *
 * Color: a separable cross-bilateral filter on (dr, db) over a wider
 * window, stopped at luminance edges (CHROMA_GUIDE_SIGMA) and at real color
 * edges (sigma = slider × CHROMA_RANGE_MAX), so blotchy color noise goes
 * without colors bleeding across edges.
 *
 * Each filter runs along rows, then columns. The row pass is stored as
 * 16-bit fixed point (color differences offset by +1 and halved), exactly as
 * the GPU stores it in RG8 / RGBA8 textures; the result is 8-bit RGBA.
 */

export const DENOISE_LUMA_MAX_TAPS = 6;
export const DENOISE_CHROMA_MAX_TAPS = 12;
export const LUMA_SPATIAL_SIGMA = 1.5;
export const CHROMA_SPATIAL_SIGMA = 4;
export const LUMA_RANGE_MAX = 0.1;
export const CHROMA_RANGE_MAX = 0.2;
export const CHROMA_GUIDE_SIGMA = 0.06;

export interface DenoiseParams {
  /** Range sigma of the luminance filter; 0 = off. */
  luma: number;
  /** Range sigma of the color filter; 0 = off. */
  color: number;
}

export function denoiseParams(detail: { nrLuma: number; nrColor: number }): DenoiseParams | null {
  if (detail.nrLuma <= 0 && detail.nrColor <= 0) return null;
  return { luma: (Math.max(0, detail.nrLuma) / 100) * LUMA_RANGE_MAX, color: (Math.max(0, detail.nrColor) / 100) * CHROMA_RANGE_MAX };
}

/** Spatial kernels; `scale` is the rendered size over full resolution (a proxy filters proportionally). */
export function denoiseKernels(scale = 1): { luma: SharpenKernel; chroma: SharpenKernel } {
  return { luma: gaussianKernel(LUMA_SPATIAL_SIGMA * scale, DENOISE_LUMA_MAX_TAPS), chroma: gaussianKernel(CHROMA_SPATIAL_SIGMA * scale, DENOISE_CHROMA_MAX_TAPS) };
}

/** Gaussian weight of a value difference. */
export function rangeWeight(d2: number, sigma: number): number {
  return Math.exp(-d2 / (2 * sigma * sigma));
}

const encodeDiff = (d: number) => quantize16((d + 1) / 2);
const decodeDiff = (e: number) => 2 * e - 1;

type Axis = { step: number; along: (i: number) => number; limit: number };

function axes(size: Size): { rows: (i: number) => Axis; cols: (i: number) => Axis } {
  const { width: W, height: H } = size;
  return {
    rows: (i) => ({ step: 1, along: () => i % W, limit: W }),
    cols: (i) => ({ step: W, along: () => Math.floor(i / W), limit: H }),
  };
}

/** One pass of the luminance bilateral along an axis. */
function lumaPass(plane: Float64Array, axis: (i: number) => Axis, kernel: SharpenKernel, sigma: number): Float64Array {
  const out = new Float64Array(plane.length);
  for (let i = 0; i < plane.length; i++) {
    const a = axis(i);
    const pos = a.along(i);
    const center = plane[i] ?? 0;
    let sum = 0;
    let weights = 0;
    for (let k = -kernel.taps; k <= kernel.taps; k++) {
      const q = Math.min(a.limit - 1, Math.max(0, pos + k));
      const v = plane[i + (q - pos) * a.step] ?? 0;
      const w = (kernel.weights[Math.abs(k)] ?? 0) * rangeWeight((v - center) ** 2, sigma);
      sum += w * v;
      weights += w;
    }
    out[i] = sum / weights;
  }
  return out;
}

/** One pass of the color cross-bilateral along an axis (guide = luminance). */
function chromaPass(dr: Float64Array, db: Float64Array, guide: Float64Array, axis: (i: number) => Axis, kernel: SharpenKernel, sigma: number): [Float64Array, Float64Array] {
  const outR = new Float64Array(dr.length);
  const outB = new Float64Array(db.length);
  for (let i = 0; i < dr.length; i++) {
    const a = axis(i);
    const pos = a.along(i);
    const g0 = guide[i] ?? 0;
    const r0 = dr[i] ?? 0;
    const b0 = db[i] ?? 0;
    let sr = 0;
    let sb = 0;
    let weights = 0;
    for (let k = -kernel.taps; k <= kernel.taps; k++) {
      const q = Math.min(a.limit - 1, Math.max(0, pos + k));
      const j = i + (q - pos) * a.step;
      const r = dr[j] ?? 0;
      const b = db[j] ?? 0;
      const w =
        (kernel.weights[Math.abs(k)] ?? 0) * rangeWeight(((guide[j] ?? 0) - g0) ** 2, CHROMA_GUIDE_SIGMA) * rangeWeight((r - r0) ** 2 + (b - b0) ** 2, sigma);
      sr += w * r;
      sb += w * b;
      weights += w;
    }
    outR[i] = sr / weights;
    outB[i] = sb / weights;
  }
  return [outR, outB];
}

/** CPU reference: noise reduction of a developed RGBA8 image (a copy when off). */
export function denoiseRgba8(data: Uint8Array | Uint8ClampedArray, size: Size, p: DenoiseParams | null, scale = 1): Uint8ClampedArray {
  if (!p) return new Uint8ClampedArray(data);
  const n = size.width * size.height;
  const { rows, cols } = axes(size);
  const kernels = denoiseKernels(scale);
  const y = lumaPlane(data, size);
  let yOut: Float64Array = y;
  if (p.luma > 0) {
    const yh = lumaPass(y, rows, kernels.luma, p.luma).map(quantize16);
    yOut = lumaPass(yh, cols, kernels.luma, p.luma);
  }
  const dr = new Float64Array(n);
  const db = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    dr[i] = (data[i * 4] ?? 0) / 255 - (y[i] ?? 0);
    db[i] = (data[i * 4 + 2] ?? 0) / 255 - (y[i] ?? 0);
  }
  let drOut: Float64Array = dr;
  let dbOut: Float64Array = db;
  if (p.color > 0) {
    const [hr, hb] = chromaPass(dr, db, y, rows, kernels.chroma, p.color);
    const qr = hr.map((v) => decodeDiff(encodeDiff(v)));
    const qb = hb.map((v) => decodeDiff(encodeDiff(v)));
    [drOut, dbOut] = chromaPass(qr, qb, y, cols, kernels.chroma, p.color);
  }
  const out = new Uint8ClampedArray(data.length);
  const [wr, wg, wb] = LUMA_WEIGHTS;
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let i = 0; i < n; i++) {
    const lum = yOut[i] ?? 0;
    const r = lum + (drOut[i] ?? 0);
    const b = lum + (dbOut[i] ?? 0);
    const g = (lum - wr * r - wb * b) / wg;
    out[i * 4] = byte(r);
    out[i * 4 + 1] = byte(g);
    out[i * 4 + 2] = byte(b);
    out[i * 4 + 3] = data[i * 4 + 3] ?? 0;
  }
  return out;
}
