import { describe, expect, it } from 'vitest';
import { matchOrganizeShortcut } from './organizeShortcuts';

describe('matchOrganizeShortcut', () => {
  it('maps digits to ratings', () => {
    expect(matchOrganizeShortcut('3')).toEqual({ kind: 'rating', value: 3 });
    expect(matchOrganizeShortcut('0')).toEqual({ kind: 'rating', value: 0 });
    expect(matchOrganizeShortcut('6')).toBeNull();
  });

  it('maps P/X/U to flags in either case', () => {
    expect(matchOrganizeShortcut('p')).toEqual({ kind: 'flag', value: 'pick' });
    expect(matchOrganizeShortcut('X')).toEqual({ kind: 'flag', value: 'reject' });
    expect(matchOrganizeShortcut('u')).toEqual({ kind: 'flag', value: null });
    expect(matchOrganizeShortcut('g')).toBeNull();
  });
});
