import { describe, expect, it } from 'vitest';
import { readExifCaptureDate } from './exif';
import { buildExifApp1, copyExif, readExifData, type ExifData, type ExifEntry } from './exifWrite';

const ascii = (tag: number, text: string): ExifEntry => {
  const bytes = new Uint8Array([...text].map((c) => c.charCodeAt(0)).concat(0));
  return { tag, type: 2, count: bytes.length, bytes };
};
const short = (tag: number, value: number, little: boolean): ExifEntry => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, little);
  return { tag, type: 3, count: 1, bytes };
};

function sourceExif(little: boolean): ExifData {
  return {
    little,
    ifd0: [ascii(0x010f, 'Camera Co'), ascii(0x0110, 'Model X'), short(0x0112, 6, little), ascii(0x013b, 'Ana'), ascii(0x8298, '(c) Ana 2023')],
    exif: [ascii(0x9003, '2023:06:14 18:42:07'), short(0x8827, 200, little), short(0xa002, 6000, little), { tag: 0x927c, type: 7, count: 8, bytes: new Uint8Array(8) }],
    gps: [ascii(0x0001, 'N')],
  };
}

/** A minimal JPEG (SOI, APP1 from `data`, SOS, EOI). */
function jpegWith(data: ExifData): ArrayBuffer {
  const app1 = buildExifApp1(data);
  if (!app1) throw new Error('no app1');
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]).buffer;
}

const exported = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
const tags = (entries: ExifEntry[]) => entries.map((e) => e.tag);

describe('EXIF writer', () => {
  it('round-trips tags in both byte orders, readable by the date reader', () => {
    for (const little of [true, false]) {
      const read = readExifData(jpegWith(sourceExif(little)));
      expect(read?.little).toBe(little);
      expect(tags(read?.ifd0 ?? [])).toEqual([0x010f, 0x0110, 0x0112, 0x013b, 0x8298, 0x8769, 0x8825]);
      expect(tags(read?.gps ?? [])).toEqual([0x0001]);
      expect(readExifCaptureDate(jpegWith(sourceExif(little)))).toBe(new Date(2023, 5, 14, 18, 42, 7).getTime());
    }
  });

  it('"All metadata" keeps camera, date and GPS but drops orientation, MakerNote and pixel sizes', () => {
    const out = copyExif(jpegWith(sourceExif(true)), exported, 'all');
    const read = readExifData(out.buffer as ArrayBuffer);
    expect(tags(read?.ifd0 ?? [])).toEqual([0x010f, 0x0110, 0x013b, 0x8298, 0x8769, 0x8825]);
    expect(tags(read?.exif ?? [])).toEqual([0x8827, 0x9003]);
    expect(tags(read?.gps ?? [])).toEqual([0x0001]);
    expect(readExifCaptureDate(out.buffer as ArrayBuffer)).not.toBeNull();
  });

  it('"All except location" drops GPS; "Copyright only" keeps only artist and copyright', () => {
    const noGps = readExifData(copyExif(jpegWith(sourceExif(false)), exported, 'allExceptLocation').buffer as ArrayBuffer);
    expect(noGps?.gps).toEqual([]);
    expect(tags(noGps?.ifd0 ?? [])).not.toContain(0x8825);
    const copyright = readExifData(copyExif(jpegWith(sourceExif(true)), exported, 'copyright').buffer as ArrayBuffer);
    expect(tags(copyright?.ifd0 ?? [])).toEqual([0x013b, 0x8298]);
    expect(copyright?.exif).toEqual([]);
  });

  it('"None", or an original without EXIF, leaves the export untouched', () => {
    expect(copyExif(jpegWith(sourceExif(true)), exported, 'none')).toBe(exported);
    expect(copyExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, exported, 'all')).toBe(exported);
  });

  it('inserts after the JFIF APP0 segment and keeps the image data intact', () => {
    const out = copyExif(jpegWith(sourceExif(true)), exported, 'copyright');
    expect(Array.from(out.subarray(0, 8))).toEqual([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2]);
    expect(Array.from(out.subarray(8, 10))).toEqual([0xff, 0xe1]);
    expect(Array.from(out.subarray(-6))).toEqual([0xff, 0xda, 0, 2, 0xff, 0xd9]);
  });
});
