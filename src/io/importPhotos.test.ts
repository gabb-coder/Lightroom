import { describe, expect, it } from 'vitest';
import { importProblemMessage } from './importPhotos';

describe('importProblemMessage', () => {
  it('is null when nothing went wrong', () => {
    expect(importProblemMessage({ rejected: [], failed: [] })).toBeNull();
  });

  it('names a single skipped or broken file and counts several', () => {
    expect(importProblemMessage({ rejected: ['notes.txt'], failed: [] })).toBe('notes.txt is not a JPEG or PNG file.');
    expect(importProblemMessage({ rejected: ['a', 'b'], failed: ['c.jpg'] })).toBe('2 files were skipped: not JPEG or PNG. c.jpg could not be read.');
    expect(importProblemMessage({ rejected: [], failed: ['x', 'y', 'z'] })).toBe('3 files could not be read.');
  });
});
