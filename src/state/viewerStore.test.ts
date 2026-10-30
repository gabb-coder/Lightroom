import { beforeEach, describe, expect, it } from 'vitest';
import { useViewerStore } from './viewerStore';

describe('viewer store (M31)', () => {
  beforeEach(() => useViewerStore.setState({ mode: null, ids: [], index: 0, playing: false, compare: null }));

  it('opens within the list, wraps both ways, and a slideshow starts playing', () => {
    const v = useViewerStore.getState();
    v.open('slideshow', ['a', 'b', 'c'], 7);
    expect(useViewerStore.getState()).toMatchObject({ mode: 'slideshow', index: 2, playing: true });
    v.step(1);
    expect(useViewerStore.getState().index).toBe(0);
    v.step(-1);
    v.step(-1);
    expect(useViewerStore.getState().index).toBe(1);
    v.open('fullscreen', [], 0);
    expect(useViewerStore.getState().mode).toBe('slideshow'); // nothing to show: unchanged
  });

  it('compare swaps and changes the candidate; opening it closes full screen', () => {
    const v = useViewerStore.getState();
    v.open('fullscreen', ['a', 'b'], 0);
    v.openCompare('a', 'b');
    expect(useViewerStore.getState()).toMatchObject({ mode: null, compare: { select: 'a', candidate: 'b' } });
    v.swap();
    expect(useViewerStore.getState().compare).toEqual({ select: 'b', candidate: 'a' });
    v.setCandidate('c');
    expect(useViewerStore.getState().compare).toEqual({ select: 'b', candidate: 'c' });
    v.closeCompare();
    expect(useViewerStore.getState().compare).toBeNull();
  });
});
