const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** Minimal shape of an event target, so this works without a DOM in tests. */
export interface TargetLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

/**
 * True when keyboard shortcuts must be ignored because the user is typing.
 * Range sliders and buttons are not text fields, so shortcuts stay active there.
 */
export function isTextEntryTarget(target: TargetLike | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') return !NON_TEXT_INPUT_TYPES.has((target.type ?? 'text').toLowerCase());
  return false;
}
