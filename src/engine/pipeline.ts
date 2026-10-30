import { clamp01, linearToSrgb, luminance, mapRgb, srgbToLinear, type Rgb } from './color';
import { applyColorGrading, colorGradingParams, type ColorGradingParams } from './colorGrading';
import { applyCurve, buildCurveLut, isIdentityCurveSet } from './curve';
import { applyExposure, exposureGain } from './exposure';
import { applyHsl, hslParams, type HslParams } from './hsl';
import { applySaturation, applyVibrance, saturationScale, vibranceAmount } from './saturation';
import { applyTone, toneParams, type ToneParams } from './tone';
import { applyTreatment } from './treatment';
import { applyWhiteBalance, whiteBalanceGains } from './whiteBalance';
import type { EditSettings, Geometry } from '../model/editSettings';
import { applyGeometryRgba8, type Size } from './geometry';
import { grainOffset, grainParams, type GrainParams } from './grain';
import { sharpenOffsets, sharpenParams, type SharpenParams } from './sharpen';
import { vignetteAmount } from './vignette';
import { applyMasks, maskParams, maskWeight, type MaskParams } from './masks';
import { dehazeChannel, presenceLevels, presenceOffset, presenceParams, sampleLevel, type PresenceParams } from './presence';

/**
 * Numeric parameters for every implemented stage. Both the CPU reference and
 * the WebGL shader consume these, so slider-to-math mapping lives in one place.
 */
export interface PipelineParams {
  whiteBalance: Rgb;
  exposureGain: number;
  tone: ToneParams;
  /** Gradient masks that change something (engine/masks.ts), in order. */
  masks: MaskParams[];
  /** Combined tone-curve lookup table, or null when every curve is identity. */
  curveLut: Float32Array | null;
  /** Color mixer amounts, or null when all are zero. */
  hsl: HslParams | null;
  vibrance: number;
  saturationScale: number;
  bw: boolean;
  /** Color grading wheels (engine/colorGrading.ts), or null when neutral. */
  colorGrading: ColorGradingParams | null;
  /** Texture, Clarity, Dehaze (engine/presence.ts), or null when all are zero. */
  presence: PresenceParams | null;
  /** Detail: unsharp mask on luminance (engine/sharpen.ts), or null when off. */
  sharpen: SharpenParams | null;
  /** Effects: film grain (engine/grain.ts), or null when off. */
  grain: GrainParams | null;
  /** Applied last, by resampling (engine/geometry.ts). */
  geometry: Geometry;
  /** Signed post-crop vignette strength (engine/vignette.ts); 0 = off. */
  vignette: number;
}

export function pipelineParams(settings: EditSettings): PipelineParams {
  const b = settings.basic;
  return {
    whiteBalance: whiteBalanceGains(b.temp, b.tint),
    exposureGain: exposureGain(b.exposure),
    tone: toneParams(b),
    masks: maskParams(settings.masks),
    curveLut: isIdentityCurveSet(settings.curve) ? null : buildCurveLut(settings.curve),
    hsl: hslParams(settings.hsl),
    vibrance: vibranceAmount(b.vibrance),
    saturationScale: saturationScale(b.saturation),
    bw: b.treatment === 'bw',
    colorGrading: colorGradingParams(settings.colorGrading),
    presence: presenceParams(b),
    sharpen: sharpenParams(settings.detail),
    grain: grainParams(settings.effects),
    geometry: settings.geometry,
    vignette: vignetteAmount(settings.effects.vignette),
  };
}

/** Runs the linear-light stages, in pipeline order. `maskWeights` are each mask's weight at this pixel. */
export function processLinear(c: Rgb, p: PipelineParams, maskWeights: readonly number[] = []): Rgb {
  let out = applyWhiteBalance(c, p.whiteBalance);
  out = applyExposure(out, p.exposureGain);
  out = applyTone(out, p.tone);
  out = applyMasks(out, p.masks, maskWeights);
  out = applyCurve(out, p.curveLut);
  out = applyHsl(out, p.hsl);
  out = applyVibrance(out, p.vibrance);
  out = applySaturation(out, p.saturationScale);
  out = applyTreatment(out, p.bw);
  out = applyColorGrading(out, p.colorGrading);
  return out;
}

/** Full CPU reference for one sRGB-encoded pixel with channels in [0, 1]. */
export function processPixel(srgb: Rgb, p: PipelineParams, maskWeights: readonly number[] = []): Rgb {
  const linear = mapRgb(srgb, srgbToLinear);
  return mapRgb(processLinear(linear, p, maskWeights), (v) => linearToSrgb(clamp01(v)));
}

/**
 * CPU reference for an RGBA8 buffer (row-major, 4 bytes per pixel). Alpha is
 * passed through. `width` places gradient masks (one row if omitted). Used by
 * tests to check the GPU output.
 */
export function processRgba8(src: Uint8Array | Uint8ClampedArray, p: PipelineParams, width = src.length / 4): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const byte = (i: number) => src[i] ?? 0;
  const height = src.length / 4 / width;
  const weights = p.masks.map(() => 0);
  for (let i = 0; i < src.length; i += 4) {
    if (p.masks.length) {
      // Masks need the pixel's position (centers at +0.5, source pixels).
      const n = i / 4;
      const x = (n % width) + 0.5;
      const y = Math.floor(n / width) + 0.5;
      p.masks.forEach((m, k) => (weights[k] = maskWeight(m.shape, x, y, width, height)));
    }
    const rgb = processPixel([byte(i) / 255, byte(i + 1) / 255, byte(i + 2) / 255], p, weights);
    out[i] = Math.round(rgb[0] * 255);
    out[i + 1] = Math.round(rgb[1] * 255);
    out[i + 2] = Math.round(rgb[2] * 255);
    out[i + 3] = byte(i + 3);
  }
  return out;
}

/** True when the detail stage (presence, sharpening, grain) changes pixels. */
export function hasDetailStage(p: PipelineParams): boolean {
  return p.presence !== null || p.sharpen !== null || p.grain !== null;
}

/**
 * CPU reference for the detail stage on a developed RGBA8 image: Dehaze,
 * then Texture, Clarity, sharpening and grain offsets, on sRGB-encoded values. `scale` is the rendered size over
 * the full-resolution size (1 for full resolution and export).
 */
export function applyDetailRgba8(data: Uint8Array | Uint8ClampedArray, size: Size, p: PipelineParams, scale = 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  if (!hasDetailStage(p)) return out;
  const sharpen = sharpenOffsets(data, size, p.sharpen, scale);
  const levels = presenceLevels(data, size, p.presence);
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const i = y * size.width + x;
      let offset = (sharpen?.[i] ?? 0) + (p.grain ? grainOffset(x, y, p.grain, scale) : 0);
      let dark = 0;
      if (p.presence) {
        const luma = luminance([(data[i * 4] ?? 0) / 255, (data[i * 4 + 1] ?? 0) / 255, (data[i * 4 + 2] ?? 0) / 255]);
        const blurT = levels.texture ? sampleLevel(levels.texture.luma, levels.texture.layout, x, y) : luma;
        const blurC = levels.coarse ? sampleLevel(levels.coarse.luma, levels.coarse.layout, x, y) : luma;
        if (levels.coarse) dark = sampleLevel(levels.coarse.dark, levels.coarse.layout, x, y);
        offset += presenceOffset(luma, blurT, blurC, p.presence);
      }
      for (let ch = 0; ch < 3; ch++) {
        const c = (data[i * 4 + ch] ?? 0) / 255;
        const v = (p.presence ? dehazeChannel(c, dark, p.presence.dehaze) : c) + offset;
        out[i * 4 + ch] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      }
    }
  }
  return out;
}

/** Full CPU reference: develop every pixel, detail, then crop/straighten/rotate/flip and vignette. */
export function renderRgba8(src: Uint8Array | Uint8ClampedArray, size: Size, p: PipelineParams, scale = 1) {
  const detailed = applyDetailRgba8(processRgba8(src, p, size.width), size, p, scale);
  return applyGeometryRgba8(detailed, size, p.geometry, p.vignette);
}
