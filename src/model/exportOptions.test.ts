import { describe, expect, it } from 'vitest';
import { BUILTIN_EXPORT_PRESETS, DEFAULT_EXPORT_OPTIONS, DEFAULT_WATERMARK, exportFileName, hasWatermark, normalizeWatermark, exportSize, normalizeExportOptions, sameLook, subfolderOf, withKept, zipEntryPath, zipFileName } from './exportOptions';
import { uniqueFileNames } from './exportOptions';

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

describe('batch file names', () => {
  it('adds -2, -3 to later duplicates (case-insensitive) and keeps unique names', () => {
    expect(uniqueFileNames(['a.jpg', 'b.jpg', 'A.jpg', 'a.jpg', 'a-2.jpg'])).toEqual(['a.jpg', 'b.jpg', 'A-2.jpg', 'a-3.jpg', 'a-2-2.jpg']);
  });
});

describe('export locations (M19)', () => {
  it('defaults to one ZIP in an "Exports" folder and normalizes stored values', () => {
    const o = normalizeExportOptions({});
    expect([o.destination, o.useSubfolder, o.subfolder]).toEqual(['zip', true, 'Exports']);
    expect(normalizeExportOptions({ destination: 'cloud' as never }).destination).toBe('zip');
    const typed = normalizeExportOptions({ subfolder: ' Trip/2024:\u0001 ' });
    expect(typed.subfolder).toBe(' Trip_2024__ ');
    expect(subfolderOf(typed)).toBe('Trip_2024__');
    expect(subfolderOf({ useSubfolder: true, subfolder: '..' })).toBe('');
    expect(subfolderOf({ useSubfolder: false, subfolder: 'Trip' })).toBe('');
  });

  it('names the ZIP and its entries after the subfolder', () => {
    const o = normalizeExportOptions({});
    expect(zipFileName(o)).toBe('Exports.zip');
    expect(zipEntryPath(o, 'a.jpg')).toBe('Exports/a.jpg');
    const flat = { ...o, useSubfolder: false };
    expect(zipFileName(flat)).toBe('Darkroom export.zip');
    expect(zipEntryPath(flat, 'a.jpg')).toBe('a.jpg');
  });

  it('presets keep the current location; the look ignores it', () => {
    const mine = normalizeExportOptions({ destination: 'folder', subfolder: 'Trip' });
    const preset = BUILTIN_EXPORT_PRESETS[1]?.options ?? normalizeExportOptions({});
    const applied = withKept(preset, mine);
    expect([applied.destination, applied.subfolder, applied.quality]).toEqual(['folder', 'Trip', preset.quality]);
    expect(sameLook(applied, preset)).toBe(true);
    expect(sameLook(applied, mine)).toBe(false);
  });
});

describe('watermark options (M23)', () => {
  it('clamps stored values and defaults to off', () => {
    expect(normalizeExportOptions({}).watermark).toEqual(DEFAULT_WATERMARK);
    expect(DEFAULT_WATERMARK.enabled).toBe(false);
    const w = normalizeWatermark({ enabled: true, logoId: 'a', position: 'middle', size: 500, opacity: -3, inset: 2.4 });
    expect(w).toEqual({ ...DEFAULT_WATERMARK, enabled: true, logoId: 'a', size: 100, opacity: 5, inset: 2 });
    // Text watermarks (M24): one line, a valid color.
    const t = normalizeWatermark({ kind: 'text', text: '© Me\nand you', textColor: '#FFD400', textShadow: false });
    expect([t.kind, t.text, t.textColor, t.textShadow]).toEqual(['text', '© Me and you', '#ffd400', false]);
    expect(normalizeWatermark({ kind: 'video', textColor: 'red', text: 'x'.repeat(500) })).toMatchObject({ kind: 'logo', textColor: '#ffffff', text: 'x'.repeat(200) });
    expect(normalizeWatermark('nope')).toEqual(DEFAULT_WATERMARK);
    // A dragged spot (M25): 'custom' with fractions clamped to 0–1.
    expect(normalizeWatermark({ position: 'custom', x: 0.37, y: 4 })).toMatchObject({ position: 'custom', x: 0.37, y: 1 });
    expect(normalizeWatermark({ position: 'custom', x: 'a', y: Number.NaN })).toMatchObject({ x: 1, y: 1 });
  });

  it('applies only with a logo, and presets keep it', () => {
    const on = normalizeExportOptions({ watermark: { ...DEFAULT_WATERMARK, enabled: true, logoId: 'x' } });
    expect(hasWatermark(on)).toBe(true);
    expect(hasWatermark(normalizeExportOptions({ watermark: { ...DEFAULT_WATERMARK, enabled: true } }))).toBe(false);
    expect(hasWatermark(normalizeExportOptions({ watermark: { ...DEFAULT_WATERMARK, enabled: true, kind: 'text', text: '  ' } }))).toBe(false);
    expect(hasWatermark(normalizeExportOptions({ watermark: { ...DEFAULT_WATERMARK, enabled: true, kind: 'text', text: '© Me' } }))).toBe(true);
    const preset = BUILTIN_EXPORT_PRESETS[1]?.options ?? DEFAULT_EXPORT_OPTIONS;
    expect(withKept(preset, on).watermark).toEqual(on.watermark);
    expect(sameLook(withKept(preset, on), preset)).toBe(true);
  });
});
