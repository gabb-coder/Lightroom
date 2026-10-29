import { describe, expect, it } from 'vitest';
import { BUILTIN_EXPORT_PRESETS, exportFileName, exportSize, normalizeExportOptions } from './exportOptions';

describe('export presets', () => {
  it('match the design list', () => {
    expect(BUILTIN_EXPORT_PRESETS.map((p) => p.name)).toEqual(['For web, 2048 px', 'Full size JPEG', 'Social square, 1080 px', 'PNG, lossless']);
    expect(BUILTIN_EXPORT_PRESETS[0]?.options).toMatchObject({ format: 'jpeg', quality: 85, resize: true, longEdge: 2048 });
    expect(BUILTIN_EXPORT_PRESETS[3]?.options).toMatchObject({ format: 'png', resize: false });
  });
});

describe('exportSize', () => {
  it('scales the long edge down, never up, keeping the aspect', () => {
    expect(exportSize(6000, 4000, { resize: true, longEdge: 2048 })).toEqual({ width: 2048, height: 1365 });
    expect(exportSize(3000, 4500, { resize: true, longEdge: 1080 })).toEqual({ width: 720, height: 1080 });
    expect(exportSize(800, 600, { resize: true, longEdge: 2048 })).toEqual({ width: 800, height: 600 });
    expect(exportSize(6000, 4000, { resize: false, longEdge: 100 })).toEqual({ width: 6000, height: 4000 });
  });
});

describe('exportFileName', () => {
  const photo = { fileName: 'IMG_0418.JPG', captureDate: new Date(2023, 5, 14, 18, 42).getTime() };

  it('keeps the original name with the new extension', () => {
    expect(exportFileName({ format: 'jpeg', naming: 'original', customName: '' }, photo)).toBe('IMG_0418.jpg');
    expect(exportFileName({ format: 'png', naming: 'original', customName: '' }, { ...photo, fileName: 'no-extension' })).toBe('no-extension.png');
  });

  it('numbers custom names and dates', () => {
    expect(exportFileName({ format: 'jpeg', naming: 'custom', customName: 'Trip' }, photo, 3)).toBe('Trip-3.jpg');
    expect(exportFileName({ format: 'png', naming: 'date', customName: '' }, photo, 1)).toBe('2023-06-14-1.png');
  });

  it('removes characters that are unsafe in file names', () => {
    expect(exportFileName({ format: 'jpeg', naming: 'custom', customName: 'a/b:c*?' }, photo, 1)).toBe('a_b_c__-1.jpg');
    expect(exportFileName({ format: 'jpeg', naming: 'custom', customName: '   ' }, photo, 2)).toBe('photo-2.jpg');
  });
});

describe('normalizeExportOptions', () => {
  it('clamps numbers and rejects unknown values', () => {
    const o = normalizeExportOptions({ quality: 400, longEdge: -5, format: 'gif' as never, metadata: 'x' as never });
    expect(o.quality).toBe(100);
    expect(o.longEdge).toBe(16);
    expect(o.format).toBe('jpeg');
    expect(o.metadata).toBe('copyright');
  });
});
