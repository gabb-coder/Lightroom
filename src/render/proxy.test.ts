import { describe, expect, it } from 'vitest';
import { fitLongEdge, PROXY_LONG_EDGE } from './proxy';

describe('fitLongEdge', () => {
  it('scales the long edge down to the limit and keeps the aspect ratio', () => {
    expect(fitLongEdge({ width: 6000, height: 4000 }, PROXY_LONG_EDGE)).toEqual({ width: 1500, height: 1000 });
    expect(fitLongEdge({ width: 3000, height: 4500 }, PROXY_LONG_EDGE)).toEqual({ width: 1000, height: 1500 });
  });

  it('never scales up', () => {
    expect(fitLongEdge({ width: 800, height: 600 }, PROXY_LONG_EDGE)).toEqual({ width: 800, height: 600 });
  });
});
