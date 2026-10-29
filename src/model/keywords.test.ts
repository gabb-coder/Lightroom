import { describe, expect, it } from 'vitest';
import { addKeywords, MAX_KEYWORD_LENGTH, normalizeKeyword, parseKeywords, removeKeyword, selectionKeywords } from './keywords';

describe('keywords', () => {
  it('normalizes typed text', () => {
    expect(normalizeKeyword('  Golden   hour ')).toBe('Golden hour');
    expect(normalizeKeyword('\t\n ')).toBeNull();
    expect(normalizeKeyword('x'.repeat(100))).toHaveLength(MAX_KEYWORD_LENGTH);
  });

  it('splits on commas and semicolons and drops duplicates', () => {
    expect(parseKeywords('beach, Sunset; family,, BEACH')).toEqual(['beach', 'Sunset', 'family']);
  });

  it('adds without duplicating (existing spelling wins) and removes case-insensitively', () => {
    expect(addKeywords(['Beach'], ['beach', 'Sea'])).toEqual(['Beach', 'Sea']);
    expect(addKeywords(undefined, ['a'])).toEqual(['a']);
    expect(removeKeyword(['Beach', 'Sea'], 'BEACH')).toEqual(['Sea']);
  });

  it('counts keywords across a selection', () => {
    expect(selectionKeywords([{ keywords: ['beach', 'sea'] }, { keywords: ['Beach'] }, {}])).toEqual([
      { keyword: 'beach', count: 2 },
      { keyword: 'sea', count: 1 },
    ]);
  });
});
