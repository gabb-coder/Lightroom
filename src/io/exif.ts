/**
 * Minimal EXIF reader: just the capture date of a JPEG. Reads
 * DateTimeOriginal (0x9003), then DateTimeDigitized (0x9004) from the Exif
 * sub-IFD, then DateTime (0x0132) from IFD0. Returns local time in epoch ms,
 * or null when there is no usable date. Never throws on malformed data.
 */

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME = 0x0132;
const TAG_DATE_ORIGINAL = 0x9003;
const TAG_DATE_DIGITIZED = 0x9004;
const TYPE_ASCII = 2;

/** Bytes to read from the start of a file; EXIF lives in the first APP1 segment. */
export const EXIF_SCAN_BYTES = 256 * 1024;

interface Tiff {
  view: DataView;
  /** Offset of the TIFF header inside `view`. */
  base: number;
  little: boolean;
}

function findExifTiff(view: DataView): Tiff | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) return null; // image data starts: no EXIF
    const length = view.getUint16(offset + 2);
    const start = offset + 4;
    if (marker === 0xe1 && start + 6 <= view.byteLength && readAscii(view, start, 6) === 'Exif\0\0') {
      const base = start + 6;
      if (base + 8 > view.byteLength) return null;
      const order = view.getUint16(base);
      if (order !== 0x4949 && order !== 0x4d4d) return null;
      return { view, base, little: order === 0x4949 };
    }
    offset = start + length - 2;
  }
  return null;
}

function readAscii(view: DataView, start: number, length: number): string {
  let s = '';
  for (let i = 0; i < length && start + i < view.byteLength; i++) s += String.fromCharCode(view.getUint8(start + i));
  return s;
}

/** Reads the entries of the IFD at `ifdOffset` (relative to the TIFF header). */
function readIfd(t: Tiff, ifdOffset: number): Map<number, { type: number; count: number; valueOffset: number }> {
  const entries = new Map<number, { type: number; count: number; valueOffset: number }>();
  const at = t.base + ifdOffset;
  if (at + 2 > t.view.byteLength) return entries;
  const count = t.view.getUint16(at, t.little);
  for (let i = 0; i < count; i++) {
    const e = at + 2 + i * 12;
    if (e + 12 > t.view.byteLength) break;
    entries.set(t.view.getUint16(e, t.little), {
      type: t.view.getUint16(e + 2, t.little),
      count: t.view.getUint32(e + 4, t.little),
      valueOffset: e + 8,
    });
  }
  return entries;
}

function readAsciiTag(t: Tiff, entry: { type: number; count: number; valueOffset: number } | undefined): string | null {
  if (!entry || entry.type !== TYPE_ASCII || entry.count < 19) return null;
  const start = entry.count > 4 ? t.base + t.view.getUint32(entry.valueOffset, t.little) : entry.valueOffset;
  if (start + 19 > t.view.byteLength) return null;
  return readAscii(t.view, start, 19);
}

/** Parses "YYYY:MM:DD HH:MM:SS" as local time. */
export function parseExifDateTime(text: string): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

export function readExifCaptureDate(buffer: ArrayBuffer): number | null {
  try {
    const tiff = findExifTiff(new DataView(buffer));
    if (!tiff) return null;
    const ifd0 = readIfd(tiff, tiff.view.getUint32(tiff.base + 4, tiff.little));
    const exifPointer = ifd0.get(TAG_EXIF_IFD);
    const exif = exifPointer ? readIfd(tiff, tiff.view.getUint32(exifPointer.valueOffset, tiff.little)) : new Map();
    for (const entry of [exif.get(TAG_DATE_ORIGINAL), exif.get(TAG_DATE_DIGITIZED), ifd0.get(TAG_DATE_TIME)]) {
      const text = readAsciiTag(tiff, entry);
      const date = text ? parseExifDateTime(text) : null;
      if (date !== null) return date;
    }
    return null;
  } catch {
    return null;
  }
}
