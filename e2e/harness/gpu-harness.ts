/**
 * Test-only page (served by the Vite dev server, never built): renders a
 * known image with the WebGL2 pipeline, reads it back with readPixels and
 * compares it with the CPU reference in src/engine/.
 */
import { pipelineParams, processRgba8 } from '../../src/engine/pipeline';
import { defaultEditSettings, type BasicSettings } from '../../src/model/editSettings';
import type { RgbaImage } from '../../src/render/gl';
import { Renderer } from '../../src/render/Renderer';
import type { GpuCheckResult, GpuHarness } from './types';

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
renderer.setImage(source, null);

function runGpuCheck(basic: Partial<BasicSettings>): GpuCheckResult {
  const settings = defaultEditSettings();
  settings.basic = { ...settings.basic, ...basic };
  const params = pipelineParams(settings);
  const gpu = renderer.readPixels(params).data;
  const cpu = processRgba8(source.data, params);
  const diff = maxDiff(gpu, cpu);
  return {
    width: WIDTH,
    height: HEIGHT,
    maxDiff: diff.max,
    worst: { pixel: Math.floor(diff.at / 4), channel: diff.at % 4, gpu: gpu[diff.at] ?? 0, cpu: cpu[diff.at] ?? 0 },
    maxChangeFromSource: maxDiff(gpu, source.data).max,
  };
}

const harness: GpuHarness = { runGpuCheck };
Object.assign(window, harness);
const status = document.getElementById('status');
if (status) status.textContent = 'ready';
