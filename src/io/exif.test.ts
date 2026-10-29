import { describe, expect, it } from 'vitest';
import { parseExifDateTime, readExifCaptureDate } from './exif';

/** Builds a minimal JPEG with an EXIF APP1 segment holding the given ASCII tags. */
function jpegWithExif(opts: { little: boolean; ifd0?: Record<number, string>; exif?: Record<number, string> }): ArrayBuffer {
  const bytes: number[] = [];
  const u16 = (v: number) => (opts.little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) =>
    opts.little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];

  // TIFF block, offsets relative to its start.
  const tiff: number[] = [];
  const data: number[] = [];
  const ifd0Tags = Object.entries(opts.ifd0 ?? {}).map(([t, v]) => [Number(t), v] as const);
  const exifTags = Object.entries(opts.exif ?? {}).map(([t, v]) => [Number(t), v] as const);
  const ifd0Count = ifd0Tags.length + (exifTags.length ? 1 : 0);
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifIfdOffset = 8 + ifd0Size;
  const exifSize = exifTags.length ? 2 + exifTags.length * 12 + 4 : 0;
  let dataOffset = exifIfdOffset + exifSize;
  const ascii = (tag: number, value: string) => {
    const s = `${value}\0`;
    const entry = [...u16(tag), ...u16(2), ...u32(s.length), ...u32(dataOffset)];
    for (const ch of s) data.push(ch.charCodeAt(0));
    dataOffset += s.length;
    return entry;
  };
  tiff.push(...(opts.little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(ifd0Count));
  for (const [t, v] of ifd0Tags) tiff.push(...ascii(t, v));
  if (exifTags.length) tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfdOffset));
  tiff.push(...u32(0));
  if (exifTags.length) {
    tiff.push(...u16(exifTags.length));
    for (const [t, v] of exifTags) tiff.push(...ascii(t, v));
    tiff.push(...u32(0));
  }
  tiff.push(...data);

  const app1 = [...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat(tiff);
  bytes.push(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00); // SOI + tiny APP0
  bytes.push(0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff, ...app1);
  bytes.push(0xff, 0xda, 0x00, 0x02, 0xff, 0xd9);
  return new Uint8Array(bytes).buffer;
}

const local = (y: number, mo: number, d: number, h: number, mi: number, s: number) => new Date(y, mo - 1, d, h, mi, s).getTime();

describe('EXIF capture date', () => {
  it('reads DateTimeOriginal (big- and little-endian)', () => {
    for (const little of [true, false]) {
      const buf = jpegWithExif({ little, ifd0: { 0x0132: '2020:01:01 00:00:00' }, exif: { 0x9003: '2023:06:14 18:42:07' } });
      expect(readExifCaptureDate(buf)).toBe(local(2023, 6, 14, 18, 42, 7));
    }
  });

  it('falls back to DateTimeDigitized, then IFD0 DateTime', () => {
    expect(readExifCaptureDate(jpegWithExif({ little: true, exif: { 0x9004: '2022:02:03 04:05:06' } }))).toBe(local(2022, 2, 3, 4, 5, 6));
    expect(readExifCaptureDate(jpegWithExif({ little: false, ifd0: { 0x0132: '2019:12:31 23:59:59' } }))).toBe(local(2019, 12, 31, 23, 59, 59));
  });

  it('returns null without EXIF, for non-JPEG data and for garbage dates', () => {
    expect(readExifCaptureDate(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull();
    expect(readExifCaptureDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(readExifCaptureDate(new ArrayBuffer(0))).toBeNull();
    expect(readExifCaptureDate(jpegWithExif({ little: true, exif: { 0x9003: '0000:00:00 00:00:00' } }))).toBeNull();
  });

  it('never throws on truncated data', () => {
    const full = new Uint8Array(jpegWithExif({ little: true, exif: { 0x9003: '2023:06:14 18:42:07' } }));
    for (let n = 0; n < full.length; n += 3) expect(() => readExifCaptureDate(full.slice(0, n).buffer)).not.toThrow();
  });

  it('parses the EXIF date format strictly', () => {
    expect(parseExifDateTime('2023:06:14 18:42:07')).toBe(local(2023, 6, 14, 18, 42, 7));
    expect(parseExifDateTime('2023-06-14 18:42:07')).toBeNull();
    expect(parseExifDateTime('2023:13:14 18:42:07')).toBeNull();
  });
});
