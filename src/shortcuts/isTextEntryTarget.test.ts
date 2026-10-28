import { describe, expect, it } from 'vitest';
import { isTextEntryTarget } from './isTextEntryTarget';

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
