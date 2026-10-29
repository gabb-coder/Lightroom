import { describe, expect, it } from 'vitest';
import { cameraName, readExif, parseExifDateTime, readExifCaptureDate } from './exif';
import { formatExposure, formatExposureTime, formatFocalLength } from '../model/format';

/** A tag value: ASCII text, a SHORT, a LONG or an unsigned RATIONAL [numerator, denominator]. */
type TagValue = string | { short: number } | { long: number } | { rational: [number, number] };

/** Builds a minimal JPEG with an EXIF APP1 segment holding the given ASCII tags. */
function jpegWithExif(opts: { little: boolean; ifd0?: Record<number, TagValue>; exif?: Record<number, TagValue> }): ArrayBuffer {
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
  const entry = (tag: number, value: TagValue) => {
    if (typeof value === 'string') {
      const s = `${value}\0`;
      const out = [...u16(tag), ...u16(2), ...u32(s.length), ...(s.length <= 4 ? [...s].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0]).slice(0, 4) : u32(dataOffset))];
      if (s.length > 4) {
        for (const ch of s) data.push(ch.charCodeAt(0));
        dataOffset += s.length;
      }
      return out;
    }
    if ('short' in value) return [...u16(tag), ...u16(3), ...u32(1), ...u16(value.short), 0, 0];
    if ('long' in value) return [...u16(tag), ...u16(4), ...u32(1), ...u32(value.long)];
    const out = [...u16(tag), ...u16(5), ...u32(1), ...u32(dataOffset)];
    data.push(...u32(value.rational[0]), ...u32(value.rational[1]));
    dataOffset += 8;
    return out;
  };
  tiff.push(...(opts.little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(ifd0Count));
  for (const [t, v] of ifd0Tags) tiff.push(...entry(t, v));
  if (exifTags.length) tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfdOffset));
  tiff.push(...u32(0));
  if (exifTags.length) {
    tiff.push(...u16(exifTags.length));
    for (const [t, v] of exifTags) tiff.push(...entry(t, v));
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

describe('EXIF camera fields', () => {
  const camera = (little: boolean) =>
    jpegWithExif({
      little,
      ifd0: { 0x010f: 'Canon', 0x0110: 'Canon EOS R5' },
      exif: {
        0x9003: '2023:06:14 18:42:07',
        0x829a: { rational: [1, 125] },
        0x829d: { rational: [80, 10] },
        0x8827: { short: 200 },
        0x920a: { rational: [35, 1] },
        0xa434: 'RF24-105mm F4 L IS USM',
      },
    });

  it('reads camera, lens, ISO, shutter, aperture and focal length (big- and little-endian)', () => {
    for (const little of [true, false]) {
      expect(readExif(camera(little))).toEqual({
        captureDate: new Date(2023, 5, 14, 18, 42, 7).getTime(),
        camera: 'Canon EOS R5',
        lens: 'RF24-105mm F4 L IS USM',
        iso: 200,
        exposureTime: 1 / 125,
        fNumber: 8,
        focalLength: 35,
      });
    }
  });

  it('names the camera once: Make is added only when Model leaves it out', () => {
    expect(cameraName('Canon', 'Canon EOS R5')).toBe('Canon EOS R5');
    expect(cameraName('NIKON CORPORATION', 'NIKON Z 6')).toBe('NIKON Z 6');
    expect(cameraName('SONY', 'ILCE-7M3')).toBe('SONY ILCE-7M3');
    expect(cameraName('Apple', null)).toBe('Apple');
    expect(cameraName(null, null)).toBeNull();
  });

  it('trims padding, short inline text and falls back for saturated ISO', () => {
    const info = readExif(
      jpegWithExif({
        little: true,
        ifd0: { 0x010f: 'FUJIFILM   ', 0x0110: 'X-T4' },
        exif: { 0x8827: { short: 65535 }, 0x8833: { long: 102400 }, 0xa434: 'XF' },
      }),
    );
    expect(info.camera).toBe('FUJIFILM X-T4');
    expect(info.iso).toBe(102400);
    expect(info.lens).toBe('XF');
  });

  it('returns nulls for files without EXIF or with broken values', () => {
    expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer).camera).toBeNull();
    const broken = readExif(jpegWithExif({ little: true, exif: { 0x829a: { rational: [1, 0] }, 0x8827: { short: 0 } } }));
    expect(broken.exposureTime).toBeNull();
    expect(broken.iso).toBeNull();
  });

  it('formats like the design ("1/125 s at f/8", "35 mm")', () => {
    expect(formatExposure(1 / 125, 8)).toBe('1/125 s at f/8');
    expect(formatExposure(null, 2.8)).toBe('f/2.8');
    expect(formatExposure(null, null)).toBeNull();
    expect(formatExposureTime(2.5)).toBe('2.5 s');
    expect(formatExposureTime(1 / 3.2)).toBe('1/3 s');
    expect(formatExposureTime(0.77)).toBe('0.8 s');
    expect(formatFocalLength(4.25)).toBe('4.3 mm');
  });
});
