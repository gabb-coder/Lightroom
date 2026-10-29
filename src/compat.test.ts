import { describe, expect, it } from 'vitest';
import { checkSupport, type SupportEnvironment } from './compat';

const all: SupportEnvironment = {
  indexedDB: true,
  webgl2: true,
  workers: true,
  createImageBitmap: true,
  blobReading: true,
  persistentStorage: true,
  offscreenCanvas: true,
  offscreenWebgl2: true,
};

describe('browser support check', () => {
  it('reports nothing for a modern browser', () => {
    expect(checkSupport(all)).toEqual({ missing: [], limits: [] });
  });

  it('lists each missing essential', () => {
    const r = checkSupport({ ...all, webgl2: false, indexedDB: false });
    expect(r.missing).toHaveLength(2);
    expect(r.missing.join(' ')).toContain('WebGL 2');
    expect(r.missing.join(' ')).toContain('private browsing');
  });

  it('turns optional gaps into limits, not errors', () => {
    const r = checkSupport({ ...all, offscreenWebgl2: false, persistentStorage: false });
    expect(r.missing).toEqual([]);
    expect(r.limits).toHaveLength(2);
    // Without OffscreenCanvas at all, thumbnails can't be made: that one is essential.
    expect(checkSupport({ ...all, offscreenCanvas: false, offscreenWebgl2: false }).missing.join()).toContain('OffscreenCanvas');
  });
});
