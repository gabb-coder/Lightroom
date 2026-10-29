import { describe, expect, it } from 'vitest';
import { formatBytes, formatDateTime } from './format';

describe('formatBytes', () => {
  it('uses binary units with sensible precision', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(834 * 1024)).toBe('834 KB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12 MB');
    expect(formatBytes(3.25 * 1024 * 1024)).toBe('3.3 MB');
  });
});

describe('formatDateTime', () => {
  it('formats local time with day, month, year and minutes', () => {
    const text = formatDateTime(new Date(2023, 5, 14, 18, 42).getTime(), 'en-GB');
    expect(text).toContain('2023');
    expect(text).toContain('Jun');
    expect(text).toContain('18:42');
  });
});
