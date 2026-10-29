import { describe, expect, it } from 'vitest';
import { isWorkerCapabilityError } from './exportClient';

describe('export fallback', () => {
  it('falls back to the main thread only for "can’t render in a worker" errors', () => {
    expect(isWorkerCapabilityError(new Error('WebGL2 is not available in this browser.'))).toBe(true);
    expect(isWorkerCapabilityError(new Error('OffscreenCanvas is not defined'))).toBe(true);
    expect(isWorkerCapabilityError(new Error('Worker failed: could not start'))).toBe(true);
    expect(isWorkerCapabilityError(new Error('The source image could not be decoded.'))).toBe(false);
  });
});
