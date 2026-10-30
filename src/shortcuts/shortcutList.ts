/**
 * Every keyboard shortcut (M22), for the help dialog. `Mod` is shown as Ctrl,
 * or ⌘ on a Mac. shortcutList.test.ts checks that each key the handlers
 * react to is listed here, so the help stays complete.
 */

export interface Shortcut {
  action: string;
  /** Keys pressed together; alternatives are separate entries in `alternatives`. */
  keys: string[];
  /** Other keys that do the same ("P", "X", "U" for pick / reject / unflag). */
  alternatives?: string[][];
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

export const MOD = 'Mod';

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Modules',
    shortcuts: [
      { action: 'Library grid', keys: ['G'] },
      { action: 'Develop', keys: ['D'] },
      { action: 'Export', keys: [MOD, 'Shift', 'E'] },
      { action: 'Keyboard shortcuts', keys: ['?'] },
      { action: 'Full screen', keys: ['F'] },
      { action: 'Compare (Library; ← → another candidate)', keys: ['C'] },
      { action: 'Slideshow (Space pauses)', keys: [MOD, 'Enter'] },
    ],
  },
  {
    title: 'Photos',
    shortcuts: [
      { action: 'Previous / next photo', keys: ['←'], alternatives: [['→']] },
      { action: 'Rate 1 to 5 stars', keys: ['1–5'] },
      { action: 'Clear rating', keys: ['0'] },
      { action: 'Pick / Reject / Unflag', keys: ['P'], alternatives: [['X'], ['U']] },
      { action: 'Remove from catalog', keys: ['Delete'], alternatives: [['Backspace']] },
      { action: 'Create virtual copy', keys: [MOD, "'"] },
      { action: 'Copy settings', keys: [MOD, 'Shift', 'C'] },
      { action: 'Paste settings', keys: [MOD, 'Shift', 'V'] },
    ],
  },
  {
    title: 'Develop',
    shortcuts: [
      { action: 'Undo', keys: [MOD, 'Z'] },
      { action: 'Redo', keys: [MOD, 'Shift', 'Z'] },
      { action: 'Before / after (hold to peek)', keys: ['\\'] },
      { action: 'Split before / after', keys: ['Y'] },
      { action: 'Zoom 1:1 and back', keys: ['Z'] },
      { action: 'Crop (Enter or Esc to finish)', keys: ['R'] },
      { action: 'White balance picker', keys: ['W'] },
      { action: 'Spot removal (Esc to finish)', keys: ['Q'] },
      { action: 'Auto tone (Library: every selected photo)', keys: [MOD, 'U'] },
      { action: 'Clipping warnings', keys: ['J'] },
    ],
  },
  {
    title: 'Masks',
    shortcuts: [
      { action: 'Linear gradient', keys: ['M'] },
      { action: 'Radial gradient', keys: ['Shift', 'M'] },
      { action: 'Brush (hold Alt to erase)', keys: ['K'] },
      { action: 'Show mask overlay', keys: ['O'] },
      { action: 'Cancel a tool', keys: ['Esc'] },
    ],
  },
];

/** How a key is shown: `Mod` becomes Ctrl, or ⌘ on a Mac. */
export function keyLabel(key: string, mac: boolean): string {
  return key === MOD ? (mac ? '⌘' : 'Ctrl') : key;
}
