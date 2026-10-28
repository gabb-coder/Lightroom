import { clamp01, linearToSrgb, mapRgb, srgbToLinear, type Rgb } from './color';
import { applyExposure, exposureGain } from './exposure';
import { applySaturation, applyVibrance, saturationScale, vibranceAmount } from './saturation';
import { applyTone, toneParams, type ToneParams } from './tone';
import { applyTreatment } from './treatment';
import { applyWhiteBalance, whiteBalanceGains } from './whiteBalance';
import type { EditSettings } from '../model/editSettings';

/**
 * Numeric parameters for every implemented stage. Both the CPU reference and
 * the WebGL shader consume these, so slider-to-math mapping lives in one place.
 */
export interface PipelineParams {
  whiteBalance: Rgb;
  exposureGain: number;
  tone: ToneParams;
  vibrance: number;
  saturationScale: number;
  bw: boolean;
}

export function pipelineParams(settings: EditSettings): PipelineParams {
  const b = settings.basic;
  return {
    whiteBalance: whiteBalanceGains(b.temp, b.tint),
    exposureGain: exposureGain(b.exposure),
    tone: toneParams(b),
    vibrance: vibranceAmount(b.vibrance),
    saturationScale: saturationScale(b.saturation),
    bw: b.treatment === 'bw',
  };
}

/** Runs the linear-light stages, in pipeline order. */
export function processLinear(c: Rgb, p: PipelineParams): Rgb {
  let out = applyWhiteBalance(c, p.whiteBalance);
  out = applyExposure(out, p.exposureGain);
  out = applyTone(out, p.tone);
  out = applyVibrance(out, p.vibrance);
  out = applySaturation(out, p.saturationScale);
  out = applyTreatment(out, p.bw);
  return out;
}

/** Full CPU reference for one sRGB-encoded pixel with channels in [0, 1]. */
export function processPixel(srgb: Rgb, p: PipelineParams): Rgb {
  const linear = mapRgb(srgb, srgbToLinear);
  return mapRgb(processLinear(linear, p), (v) => linearToSrgb(clamp01(v)));
}

/**
 * CPU reference for an RGBA8 buffer (row-major, 4 bytes per pixel). Alpha is
 * passed through. Used by tests to check the GPU output.
 */
export function processRgba8(src: Uint8Array | Uint8ClampedArray, p: PipelineParams): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const byte = (i: number) => src[i] ?? 0;
  for (let i = 0; i < src.length; i += 4) {
    const rgb = processPixel([byte(i) / 255, byte(i + 1) / 255, byte(i + 2) / 255], p);
    out[i] = Math.round(rgb[0] * 255);
    out[i + 1] = Math.round(rgb[1] * 255);
    out[i + 2] = Math.round(rgb[2] * 255);
    out[i + 3] = byte(i + 3);
  }
  return out;
}
