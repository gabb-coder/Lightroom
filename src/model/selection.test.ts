import { describe, expect, it } from 'vitest';
import { clickSelection, EMPTY_SELECTION, pruneSelection, selectOnly } from './selection';

const order = ['a', 'b', 'c', 'd', 'e'];
const plain = { toggle: false, range: false };
const toggle = { toggle: true, range: false };
const range = { toggle: false, range: true };

describe('selection', () => {
  it('a plain click selects one photo', () => {
    expect(clickSelection(selectOnly('a'), order, 'c', plain)).toEqual({ ids: ['c'], focusId: 'c', anchorId: 'c' });
  });

  it('Ctrl/Cmd-click adds and removes photos', () => {
    let s = clickSelection(selectOnly('a'), order, 'c', toggle);
    expect(s).toEqual({ ids: ['a', 'c'], focusId: 'c', anchorId: 'c' });
    s = clickSelection(s, order, 'a', toggle);
    expect(s.ids).toEqual(['c']);
    expect(s.focusId).toBe('c');
    s = clickSelection(s, order, 'c', toggle);
    expect(s).toEqual({ ids: [], focusId: null, anchorId: 'c' });
  });

  it('Shift-click selects the range from the anchor, in display order, both directions', () => {
    const s = clickSelection(selectOnly('b'), order, 'd', range);
    expect(s).toEqual({ ids: ['b', 'c', 'd'], focusId: 'd', anchorId: 'b' });
    // A second Shift-click re-ranges from the same anchor.
    expect(clickSelection(s, order, 'a', range).ids).toEqual(['a', 'b']);
  });

  it('Ctrl/Cmd+Shift adds a range to the selection', () => {
    const s = clickSelection(selectOnly('a'), order, 'd', toggle);
    expect(clickSelection(s, order, 'e', { toggle: true, range: true }).ids).toEqual(['a', 'd', 'e']);
  });

  it('Shift-click with nothing selected selects just that photo', () => {
    expect(clickSelection(EMPTY_SELECTION, order, 'c', range)).toEqual({ ids: ['c'], focusId: 'c', anchorId: 'c' });
  });

  it('pruning drops hidden photos and moves focus to a visible one', () => {
    const s = { ids: ['a', 'c', 'e'], focusId: 'a', anchorId: 'a' };
    expect(pruneSelection(s, ['c', 'd', 'e'])).toEqual({ ids: ['c', 'e'], focusId: 'c', anchorId: 'c' });
    expect(pruneSelection(s, ['b'])).toEqual({ ids: [], focusId: null, anchorId: null });
  });
});
