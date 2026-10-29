import { describe, expect, it } from 'vitest';
import { isArrowKeyTarget, isTextEntryTarget } from './isTextEntryTarget';

describe('isTextEntryTarget', () => {
  it('treats text inputs, textareas and contenteditable as text entry', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('keeps shortcuts active on sliders, buttons and plain elements', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});

describe('isArrowKeyTarget', () => {
  it('leaves arrows to sliders, selects and text fields', () => {
    expect(isArrowKeyTarget({ tagName: 'INPUT', type: 'range' })).toBe(true);
    expect(isArrowKeyTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isArrowKeyTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
  });

  it('uses arrows for photo navigation elsewhere', () => {
    expect(isArrowKeyTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isArrowKeyTarget({ tagName: 'BODY' })).toBe(false);
    expect(isArrowKeyTarget(null)).toBe(false);
  });
});
