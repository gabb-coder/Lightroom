import { describe, expect, it } from 'vitest';
import { defaultEditSettings } from './editSettings';
import { isEdited, jsonEqual } from './compare';

describe('jsonEqual', () => {
  it('compares nested plain values', () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(jsonEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
  });
});

describe('isEdited', () => {
  it('is false for defaults and true after any change, including geometry', () => {
    expect(isEdited(defaultEditSettings())).toBe(false);
    const s = defaultEditSettings();
    s.geometry.flipH = true;
    expect(isEdited(s)).toBe(true);
  });
});
