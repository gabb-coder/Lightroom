import type { MetadataPolicy } from '../model/exportOptions';

/**
 * Copies EXIF from an original JPEG into an exported one. Re-encoding drops
 * all metadata, so tags are read from the original, filtered by the chosen
 * policy and written into a fresh APP1 segment.
 *
 * Dropped always: Orientation (already applied to the pixels), MakerNote
 * (vendor data with internal offsets), the embedded thumbnail (IFD1) and
 * pixel-size tags (stale after crop/resize).
 */

export interface ExifEntry {
  tag: number;
  type: number;
  count: number;
  /** Value bytes in the source byte order. */
  bytes: Uint8Array;
}

export interface ExifData {
  little: boolean;
  ifd0: ExifEntry[];
  exif: ExifEntry[];
  gps: ExifEntry[];
}

const TYPE_SIZES: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const TYPE_LONG = 4;

const TAG = {
  exifPointer: 0x8769,
  gpsPointer: 0x8825,
  interopPointer: 0xa005,
  orientation: 0x0112,
  makerNote: 0x927c,
  pixelX: 0xa002,
  pixelY: 0xa003,
  imageWidth: 0x0100,
  imageHeight: 0x0101,
  artist: 0x013b,
  copyright: 0x8298,
} as const;

const POINTERS = new Set<number>([TAG.exifPointer, TAG.gpsPointer, TAG.interopPointer]);
const ALWAYS_DROP = new Set<number>([TAG.orientation, TAG.makerNote, TAG.pixelX, TAG.pixelY, TAG.imageWidth, TAG.imageHeight]);

/** Largest APP1 payload a JPEG segment can hold. */
const MAX_SEGMENT = 0xffff - 2;

interface Tiff {
  view: DataView;
  base: number;
  little: boolean;
}

function findTiff(view: DataView): Tiff | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) return null;
    const length = view.getUint16(offset + 2);
    const start = offset + 4;
    if (marker === 0xe1 && start + 14 <= view.byteLength) {
      const isExif = [0x45, 0x78, 0x69, 0x66, 0, 0].every((b, i) => view.getUint8(start + i) === b);
      if (isExif) {
        const base = start + 6;
        const order = view.getUint16(base);
        if (order === 0x4949 || order === 0x4d4d) return { view, base, little: order === 0x4949 };
      }
    }
    offset = start + length - 2;
  }
  return null;
}

function readIfdEntries(t: Tiff, ifdOffset: number): ExifEntry[] {
  const at = t.base + ifdOffset;
  if (ifdOffset <= 0 || at + 2 > t.view.byteLength) return [];
  const count = t.view.getUint16(at, t.little);
  const entries: ExifEntry[] = [];
  for (let i = 0; i < count; i++) {
    const e = at + 2 + i * 12;
    if (e + 12 > t.view.byteLength) break;
    const tag = t.view.getUint16(e, t.little);
    const type = t.view.getUint16(e + 2, t.little);
    const n = t.view.getUint32(e + 4, t.little);
    const size = (TYPE_SIZES[type] ?? 0) * n;
    if (size === 0 || size > 65536) continue;
    const start = size <= 4 ? e + 8 : t.base + t.view.getUint32(e + 8, t.little);
    if (start + size > t.view.byteLength) continue;
    entries.push({ tag, type, count: n, bytes: new Uint8Array(t.view.buffer, t.view.byteOffset + start, size).slice() });
  }
  return entries;
}

function pointerValue(t: Tiff, entries: ExifEntry[], tag: number): number {
  const e = entries.find((x) => x.tag === tag);
  if (!e || e.bytes.length < 4) return 0;
  return new DataView(e.bytes.buffer, e.bytes.byteOffset, 4).getUint32(0, t.little);
}

/** Reads IFD0, Exif and GPS tags from a JPEG, or null if it has no EXIF. Never throws. */
export function readExifData(buffer: ArrayBuffer): ExifData | null {
  try {
    const t = findTiff(new DataView(buffer));
    if (!t) return null;
    const ifd0 = readIfdEntries(t, t.view.getUint32(t.base + 4, t.little));
    return {
      little: t.little,
      ifd0,
      exif: readIfdEntries(t, pointerValue(t, ifd0, TAG.exifPointer)),
      gps: readIfdEntries(t, pointerValue(t, ifd0, TAG.gpsPointer)),
    };
  } catch {
    return null;
  }
}

const keep = (entries: ExifEntry[], allow: (tag: number) => boolean) => entries.filter((e) => !POINTERS.has(e.tag) && !ALWAYS_DROP.has(e.tag) && allow(e.tag));

/** Tags to write for a metadata policy (pointer tags are rebuilt by the writer). */
export function filterExif(data: ExifData, policy: MetadataPolicy): ExifData | null {
  if (policy === 'none') return null;
  if (policy === 'copyright') {
    const ifd0 = keep(data.ifd0, (tag) => tag === TAG.copyright || tag === TAG.artist);
    return ifd0.length ? { little: data.little, ifd0, exif: [], gps: [] } : null;
  }
  const all = () => true;
  return {
    little: data.little,
    ifd0: keep(data.ifd0, all),
    exif: keep(data.exif, all),
    gps: policy === 'all' ? keep(data.gps, all) : [],
  };
}

/** Builds an APP1 EXIF segment (marker included), or null if it would not fit. */
export function buildExifApp1(data: ExifData): Uint8Array | null {
  const ifd0 = [...data.ifd0];
  const exif = [...data.exif].sort((a, b) => a.tag - b.tag);
  const gps = [...data.gps].sort((a, b) => a.tag - b.tag);
  // Placeholder pointer entries; their values are patched once offsets are known.
  const pointer = (tag: number): ExifEntry => ({ tag, type: TYPE_LONG, count: 1, bytes: new Uint8Array(4) });
  if (exif.length) ifd0.push(pointer(TAG.exifPointer));
  if (gps.length) ifd0.push(pointer(TAG.gpsPointer));
  ifd0.sort((a, b) => a.tag - b.tag);
  if (ifd0.length === 0) return null;

  const ifdSize = (entries: ExifEntry[]) => 2 + entries.length * 12 + 4;
  const dataSize = (entries: ExifEntry[]) => entries.reduce((n, e) => n + (e.bytes.length > 4 ? e.bytes.length + (e.bytes.length % 2) : 0), 0);
  const ifd0At = 8;
  const exifAt = ifd0At + ifdSize(ifd0) + dataSize(ifd0);
  const gpsAt = exifAt + (exif.length ? ifdSize(exif) + dataSize(exif) : 0);
  const tiffSize = gpsAt + (gps.length ? ifdSize(gps) + dataSize(gps) : 0);
  if (tiffSize + 6 > MAX_SEGMENT) return null;

  const out = new Uint8Array(4 + 6 + tiffSize);
  const view = new DataView(out.buffer);
  const le = data.little;
  out.set([0xff, 0xe1], 0);
  view.setUint16(2, 2 + 6 + tiffSize);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  const T = 10; // TIFF header offset in `out`
  view.setUint16(T, le ? 0x4949 : 0x4d4d);
  view.setUint16(T + 2, 42, le);
  view.setUint32(T + 4, ifd0At, le);

  const writeIfd = (at: number, entries: ExifEntry[]) => {
    view.setUint16(T + at, entries.length, le);
    let dataAt = at + ifdSize(entries);
    entries.forEach((e, i) => {
      const p = T + at + 2 + i * 12;
      view.setUint16(p, e.tag, le);
      view.setUint16(p + 2, e.type, le);
      view.setUint32(p + 4, e.count, le);
      if (e.tag === TAG.exifPointer) view.setUint32(p + 8, exifAt, le);
      else if (e.tag === TAG.gpsPointer) view.setUint32(p + 8, gpsAt, le);
      else if (e.bytes.length <= 4) out.set(e.bytes, p + 8);
      else {
        view.setUint32(p + 8, dataAt, le);
        out.set(e.bytes, T + dataAt);
        dataAt += e.bytes.length + (e.bytes.length % 2);
      }
    });
    view.setUint32(T + at + 2 + entries.length * 12, 0, le); // no next IFD
  };
  writeIfd(ifd0At, ifd0);
  if (exif.length) writeIfd(exifAt, exif);
  if (gps.length) writeIfd(gpsAt, gps);
  return out;
}

/** Inserts a segment right after SOI (and after a JFIF APP0 if present). */
export function insertSegment(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + (((jpeg[4] ?? 0) << 8) | (jpeg[5] ?? 0));
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, at), 0);
  out.set(segment, at);
  out.set(jpeg.subarray(at), at + segment.length);
  return out;
}

/** The exported JPEG with the original's metadata copied per policy (unchanged if none applies). */
export function copyExif(original: ArrayBuffer, exported: Uint8Array, policy: MetadataPolicy): Uint8Array {
  const data = readExifData(original);
  const filtered = data ? filterExif(data, policy) : null;
  const app1 = filtered ? buildExifApp1(filtered) : null;
  return app1 ? insertSegment(exported, app1) : exported;
}
