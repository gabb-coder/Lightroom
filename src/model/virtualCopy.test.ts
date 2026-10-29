import { describe, expect, it } from 'vitest';
import { copyImportIndex, deletionSet, displayName, masterIdOf, nextCopyNumber } from './virtualCopy';

describe('virtual copies', () => {
  it('names copies after their file and number', () => {
    expect(displayName({ fileName: 'a.jpg' })).toBe('a.jpg');
    expect(displayName({ fileName: 'a.jpg', copyName: 'Copy 2' })).toBe('a.jpg (Copy 2)');
  });

  it('numbers copies per master, after the highest existing one', () => {
    const photos = [{ masterId: 'm', copyName: 'Copy 1' }, { masterId: 'm', copyName: 'Copy 3' }, { masterId: 'x', copyName: 'Copy 7' }, {}];
    expect(nextCopyNumber(photos, 'm')).toBe(4);
    expect(nextCopyNumber(photos, 'other')).toBe(1);
  });

  it('points at the shared original and sorts right after the master', () => {
    expect(masterIdOf({ id: 'c', masterId: 'm' })).toBe('m');
    expect(masterIdOf({ id: 'm' })).toBe('m');
    expect(copyImportIndex(5, 1)).toBeGreaterThan(5);
    expect(copyImportIndex(5, 999)).toBeLessThan(6);
    expect(copyImportIndex(5, 2)).toBeGreaterThan(copyImportIndex(5, 1));
  });
});

describe('deleting photos', () => {
  it('takes a master’s virtual copies with it, but not the other way round', () => {
    const photos = [{ id: 'm' }, { id: 'c1', masterId: 'm' }, { id: 'c2', masterId: 'm' }, { id: 'x' }];
    expect(deletionSet(photos, ['m'])).toEqual(['m', 'c1', 'c2']);
    expect(deletionSet(photos, ['c1'])).toEqual(['c1']);
    expect(deletionSet(photos, ['x', 'nope'])).toEqual(['x']);
  });
});
