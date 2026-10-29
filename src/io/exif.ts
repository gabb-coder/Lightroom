import type { PhotoExif } from '../db/db';

/**
 * Minimal EXIF reader for JPEGs: capture date and the camera fields shown
 * in the Library's Metadata panel. Never throws on malformed data; missing
 * or unreadable fields are null.
 *
 * Capture date: DateTimeOriginal (0x9003), then DateTimeDigitized (0x9004)
 * from the Exif sub-IFD, then DateTime (0x0132) from IFD0, as local time in
 * epoch ms.
 */

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME = 0x0132;
const TAG_DATE_ORIGINAL = 0x9003;
const TAG_DATE_DIGITIZED = 0x9004;
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_LENS_MODEL = 0xa434;
const TAG_ISO = 0x8827; // PhotographicSensitivity (ISOSpeedRatings)
const TAG_RECOMMENDED_EXPOSURE_INDEX = 0x8832;
const TAG_ISO_SPEED = 0x8833;
const TAG_EXPOSURE_TIME = 0x829a;
const TAG_F_NUMBER = 0x829d;
const TAG_FOCAL_LENGTH = 0x920a;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

/** Camera fields read from EXIF. */
export interface ExifInfo {
  captureDate: number | null;
  /** "Canon EOS R5": Model, prefixed by Make unless the model already names it. */
  camera: string | null;
  lens: string | null;
  iso: number | null;
  /** Seconds, e.g. 0.008 for 1/125 s. */
  exposureTime: number | null;
  fNumber: number | null;
  /** Millimetres. */
  focalLength: number | null;
}

export const EMPTY_EXIF: ExifInfo = { captureDate: null, camera: null, lens: null, iso: null, exposureTime: null, fNumber: null, focalLength: null };

/** The fields stored on a catalog photo (everything but the date, which has its own column). */
export function photoExif(info: ExifInfo): PhotoExif {
  const { camera, lens, iso, exposureTime, fNumber, focalLength } = info;
  return { camera, lens, iso, exposureTime, fNumber, focalLength };
}

/** Longest text kept from a tag (guards against garbage). */
const MAX_TEXT = 80;

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
function readIfd(t: Tiff, ifdOffset: number): Map<number, Entry> {
  const entries = new Map<number, Entry>();
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

type Entry = { type: number; count: number; valueOffset: number };

/** Where a tag's value starts: inline when it fits in 4 bytes, else at the stored offset. */
function valueStart(t: Tiff, entry: Entry, size: number): number {
  return entry.count * size > 4 ? t.base + t.view.getUint32(entry.valueOffset, t.little) : entry.valueOffset;
}

function readAsciiTag(t: Tiff, entry: Entry | undefined): string | null {
  if (!entry || entry.type !== TYPE_ASCII || entry.count < 19) return null;
  const start = valueStart(t, entry, 1);
  if (start + 19 > t.view.byteLength) return null;
  return readAscii(t.view, start, 19);
}

/** A text tag, without trailing NULs/padding and control characters; null if empty. */
function readText(t: Tiff, entry: Entry | undefined): string | null {
  if (!entry || entry.type !== TYPE_ASCII || entry.count === 0) return null;
  const start = valueStart(t, entry, 1);
  const length = Math.min(entry.count, MAX_TEXT, t.view.byteLength - start);
  if (length <= 0) return null;
  const raw = readAscii(t.view, start, length);
  const end = raw.indexOf('\0');
  const text = Array.from(end >= 0 ? raw.slice(0, end) : raw)
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/** First value of a SHORT or LONG tag. */
function readUint(t: Tiff, entry: Entry | undefined): number | null {
  if (!entry || entry.count < 1) return null;
  if (entry.type === TYPE_SHORT) return t.view.getUint16(entry.valueOffset, t.little);
  if (entry.type === TYPE_LONG) return t.view.getUint32(entry.valueOffset, t.little);
  return null;
}

/** An unsigned RATIONAL tag as a number; null for 0/0 or out of range. */
function readRational(t: Tiff, entry: Entry | undefined): number | null {
  if (!entry || entry.type !== TYPE_RATIONAL || entry.count < 1) return null;
  const start = valueStart(t, entry, 8);
  if (start + 8 > t.view.byteLength) return null;
  const num = t.view.getUint32(start, t.little);
  const den = t.view.getUint32(start + 4, t.little);
  return den === 0 ? null : num / den;
}

/** "Canon" + "Canon EOS R5" → "Canon EOS R5"; "SONY" + "ILCE-7M3" → "SONY ILCE-7M3". */
export function cameraName(make: string | null, model: string | null): string | null {
  if (!model) return make;
  if (!make) return model;
  const brand = make.split(' ')[0]?.toLowerCase() ?? '';
  return model.toLowerCase().includes(brand) ? model : `${make} ${model}`;
}

/** ISO: PhotographicSensitivity, unless missing or saturated (65535), then ISOSpeed / RecommendedExposureIndex. */
function readIso(t: Tiff, exif: Map<number, Entry>): number | null {
  for (const tag of [TAG_ISO, TAG_ISO_SPEED, TAG_RECOMMENDED_EXPOSURE_INDEX]) {
    const v = readUint(t, exif.get(tag));
    if (v !== null && v > 0 && v !== 65535) return v;
  }
  return null;
}

const positive = (v: number | null) => (v !== null && v > 0 && Number.isFinite(v) ? v : null);

/** Parses "YYYY:MM:DD HH:MM:SS" as local time. */
export function parseExifDateTime(text: string): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

function readCaptureDate(t: Tiff, ifd0: Map<number, Entry>, exif: Map<number, Entry>): number | null {
  for (const entry of [exif.get(TAG_DATE_ORIGINAL), exif.get(TAG_DATE_DIGITIZED), ifd0.get(TAG_DATE_TIME)]) {
    const text = readAsciiTag(t, entry);
    const date = text ? parseExifDateTime(text) : null;
    if (date !== null) return date;
  }
  return null;
}

/** Reads every supported field from the start of a JPEG file (EXIF_SCAN_BYTES is enough). */
export function readExif(buffer: ArrayBuffer): ExifInfo {
  try {
    const tiff = findExifTiff(new DataView(buffer));
    if (!tiff) return EMPTY_EXIF;
    const ifd0 = readIfd(tiff, tiff.view.getUint32(tiff.base + 4, tiff.little));
    const exifPointer = ifd0.get(TAG_EXIF_IFD);
    const exif = exifPointer ? readIfd(tiff, tiff.view.getUint32(exifPointer.valueOffset, tiff.little)) : new Map<number, Entry>();
    // Each field on its own, so one malformed tag doesn't hide the others.
    const safe = <T>(read: () => T | null): T | null => {
      try {
        return read();
      } catch {
        return null;
      }
    };
    return {
      captureDate: safe(() => readCaptureDate(tiff, ifd0, exif)),
      camera: safe(() => cameraName(readText(tiff, ifd0.get(TAG_MAKE)), readText(tiff, ifd0.get(TAG_MODEL)))),
      lens: safe(() => readText(tiff, exif.get(TAG_LENS_MODEL))),
      iso: safe(() => readIso(tiff, exif)),
      exposureTime: safe(() => positive(readRational(tiff, exif.get(TAG_EXPOSURE_TIME)))),
      fNumber: safe(() => positive(readRational(tiff, exif.get(TAG_F_NUMBER)))),
      focalLength: safe(() => positive(readRational(tiff, exif.get(TAG_FOCAL_LENGTH)))),
    };
  } catch {
    return EMPTY_EXIF;
  }
}

export function readExifCaptureDate(buffer: ArrayBuffer): number | null {
  return readExif(buffer).captureDate;
}
