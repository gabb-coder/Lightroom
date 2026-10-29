/**
 * Test-only page (served by the Vite dev server, never built): renders a
 * known image with the WebGL2 pipeline, reads it back with readPixels and
 * compares it with the CPU reference in src/engine/.
 */
import { displayRgba8, type DisplayOptions } from '../../src/engine/display';
import { pipelineParams, renderRgba8 } from '../../src/engine/pipeline';
import { defaultEditSettings, type BasicSettings, type Geometry } from '../../src/model/editSettings';
import type { RgbaImage } from '../../src/render/gl';
import { Renderer } from '../../src/render/Renderer';
import type { GpuCheckResult, GpuExtra, GpuHarness } from './types';

const WIDTH = 64;
const HEIGHT = 48;

/** Every gray level, per-channel ramps, then seeded random colors. Non-square to catch flips. */
function testImage(): RgbaImage {
  const data = new Uint8Array(WIDTH * HEIGHT * 4);
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed >>> 16) & 0xff;
  };
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const v = i % 256;
    const block = Math.floor(i / 256);
    let rgb: [number, number, number];
    if (block === 0) rgb = [v, v, v];
    else if (block === 1) rgb = [v, 0, 0];
    else if (block === 2) rgb = [0, v, 0];
    else if (block === 3) rgb = [0, 0, v];
    else rgb = [random(), random(), random()];
    data.set([...rgb, 255], i * 4);
  }
  return { width: WIDTH, height: HEIGHT, data };
}

function maxDiff(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray) {
  let max = 0;
  let at = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (d > max) {
      max = d;
      at = i;
    }
  }
  return { max, at };
}

const source = testImage();
const renderer = Renderer.create(new OffscreenCanvas(1, 1));
renderer.setImage({ full: source });

/** Renders the test image as a half-size proxy of a (blank) 2× full-resolution image. */
const proxyRenderer = Renderer.create(new OffscreenCanvas(1, 1));
proxyRenderer.setImage({ full: { width: WIDTH * 2, height: HEIGHT * 2, data: new Uint8Array(WIDTH * HEIGHT * 16) }, proxy: source });
const PROXY_SCALE = 0.5;

function runGpuCheck(basic: Partial<BasicSettings>, geometry: Partial<Geometry> = {}, extra: GpuExtra = {}): GpuCheckResult {
  const settings = defaultEditSettings();
  settings.basic = { ...settings.basic, ...basic };
  settings.geometry = { ...settings.geometry, ...geometry };
  if (extra.curve) settings.curve = { ...settings.curve, ...extra.curve };
  if (extra.hsl) settings.hsl = { ...settings.hsl, ...extra.hsl };
  if (extra.detail) settings.detail = { ...settings.detail, ...extra.detail };
  if (extra.effects) settings.effects = { ...settings.effects, ...extra.effects };
  if (extra.colorGrading) settings.colorGrading = { ...settings.colorGrading, ...extra.colorGrading };
  if (extra.masks) settings.masks = extra.masks;
  const params = pipelineParams(settings);
  const gpuImage = extra.proxy ? proxyRenderer.readPixels(params, 'proxy') : renderer.readPixels(params);
  const cpuImage = renderRgba8(source.data, source, params, extra.proxy ? PROXY_SCALE : 1);
  const gpu = gpuImage.data;
  const cpu = cpuImage.data;
  const sameSize = gpuImage.width === cpuImage.width && gpuImage.height === cpuImage.height;
  const diff = sameSize ? maxDiff(gpu, cpu) : { max: 255, at: 0 };
  const changeSameSize = gpuImage.width === WIDTH && gpuImage.height === HEIGHT;
  return {
    width: gpuImage.width,
    height: gpuImage.height,
    sameSize,
    maxDiff: diff.max,
    worst: { pixel: Math.floor(diff.at / 4), channel: diff.at % 4, gpu: gpu[diff.at] ?? 0, cpu: cpu[diff.at] ?? 0 },
    maxChangeFromSource: changeSameSize ? maxDiff(gpu, source.data).max : 255,
  };
}

/** Scratch memory with sharpening + grain on, then after releasing it (and a render that recreates it). */
function scratchCheck() {
  const settings = defaultEditSettings();
  settings.detail.sharpAmount = 80;
  settings.effects.grain = 30;
  const params = pipelineParams(settings);
  renderer.readPixels(params);
  const withDetail = renderer.scratchBytes;
  renderer.releaseScratch();
  const released = renderer.scratchBytes;
  const again = runGpuCheck({}, {}, { detail: { sharpAmount: 80 }, effects: { grain: 30 } });
  return { withDetail, released, againMaxDiff: again.maxDiff, pixels: WIDTH * HEIGHT };
}

/**
 * Display pass (clipping overlay, split view) against its CPU reference
 * applied to the GPU's own After and Before images: must match exactly.
 */
function displayCheck(options: DisplayOptions, basic: Partial<BasicSettings>, geometry: Partial<Geometry> = {}) {
  const settings = defaultEditSettings();
  settings.basic = { ...settings.basic, ...basic };
  settings.geometry = { ...settings.geometry, ...geometry };
  const params = pipelineParams(settings);
  const before = { ...pipelineParams(defaultEditSettings()), geometry: params.geometry };
  const after = renderer.readPixels(params);
  const beforeImage = renderer.readPixels(before);
  const shown = renderer.readPixels(params, 'full', { options, before });
  const reference = displayRgba8(after.data, beforeImage.data, after.width, options);
  const count = (rgb: readonly number[]) => {
    let n = 0;
    for (let i = 0; i < reference.length; i += 4) if (reference[i] === rgb[0] && reference[i + 1] === rgb[1] && reference[i + 2] === rgb[2]) n++;
    return n;
  };
  return { maxDiff: maxDiff(shown.data, reference).max, width: shown.width, height: shown.height, count, sameAsAfter: maxDiff(shown.data, after.data).max === 0 };
}

const harness: GpuHarness = {
  runGpuCheck,
  scratchCheck,
  displayCheck: (options, basic, geometry) => {
    const r = displayCheck(options, basic, geometry);
    return { maxDiff: r.maxDiff, width: r.width, height: r.height, shadowPixels: r.count([30, 110, 255]), highlightPixels: r.count([255, 40, 40]), sameAsAfter: r.sameAsAfter };
  },
};
Object.assign(window, harness);
const status = document.getElementById('status');
if (status) status.textContent = 'ready';
