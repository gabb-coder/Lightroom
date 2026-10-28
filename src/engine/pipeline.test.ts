import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from '../model/editSettings';
import { pipelineParams, processRgba8 } from './pipeline';

function allBytesImage(): Uint8Array {
  const data = new Uint8Array(256 * 4);
  for (let v = 0; v < 256; v++) data.set([v, 255 - v, (v * 7) % 256, v], v * 4);
  return data;
}

describe('pipeline', () => {
  it('returns the original bytes at default settings', () => {
    const src = allBytesImage();
    expect(Array.from(processRgba8(src, pipelineParams(defaultEditSettings())))).toEqual(Array.from(src));
  });

  it('passes alpha through unchanged', () => {
    const settings = defaultEditSettings();
    settings.basic.exposure = 2;
    const src = allBytesImage();
    const out = processRgba8(src, pipelineParams(settings));
    for (let i = 3; i < src.length; i += 4) expect(out[i]).toBe(src[i]);
  });

  it('brightens with positive exposure and clips at white', () => {
    const settings = defaultEditSettings();
    settings.basic.exposure = 5;
    const out = processRgba8(new Uint8Array([10, 128, 255, 255]), pipelineParams(settings));
    expect(out[0]).toBeGreaterThan(10);
    expect(out[1]).toBe(255);
    expect(out[2]).toBe(255);
  });
});
