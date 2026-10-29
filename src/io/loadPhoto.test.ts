import { describe, expect, it } from 'vitest';
import { ACCEPT_ATTRIBUTE, formatList, importTypeOf, isAcceptedFile } from './loadPhoto';

describe('import formats', () => {
  it('accepts JPEG, PNG, WebP, AVIF and HEIC by type, normalizing aliases', () => {
    expect(importTypeOf({ type: 'image/jpeg', name: 'a.jpg' })).toBe('image/jpeg');
    expect(importTypeOf({ type: 'image/pjpeg', name: 'a' })).toBe('image/jpeg');
    expect(importTypeOf({ type: 'image/webp', name: 'a.webp' })).toBe('image/webp');
    expect(importTypeOf({ type: 'image/avif', name: 'a.avif' })).toBe('image/avif');
    expect(importTypeOf({ type: 'image/heif', name: 'a.heif' })).toBe('image/heic');
  });

  it('falls back to the extension when the system gives no type', () => {
    expect(importTypeOf({ type: '', name: 'IMG_0001.HEIC' })).toBe('image/heic');
    expect(importTypeOf({ type: 'application/octet-stream', name: 'shot.webp' })).toBe('image/webp');
    expect(importTypeOf({ type: '', name: 'notes.txt' })).toBeNull();
  });

  it('rejects other types even with a photo-like name', () => {
    expect(importTypeOf({ type: 'image/gif', name: 'a.jpg' })).toBeNull();
    expect(importTypeOf({ type: 'image/tiff', name: 'a.tif' })).toBeNull();
    expect(isAcceptedFile({ type: 'image/png' })).toBe(true);
  });

  it('lists types and extensions for the file picker, and names the formats', () => {
    expect(ACCEPT_ATTRIBUTE).toContain('image/webp');
    expect(ACCEPT_ATTRIBUTE).toContain('.heic');
    expect(formatList()).toBe('JPEG, PNG, WebP, AVIF and HEIC');
  });
});
