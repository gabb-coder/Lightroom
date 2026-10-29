/** Inserts a minimal EXIF APP1 segment with DateTimeOriginal right after the JPEG SOI marker. */
export function withExifDate(jpeg: Uint8Array, dateTime: string): Buffer {
  const value = Buffer.from(`${dateTime}\0`, 'ascii'); // 20 bytes
  const tiff = Buffer.alloc(8 + 18 + 18 + value.length);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  // IFD0: one entry, the Exif IFD pointer.
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  // Exif IFD: DateTimeOriginal (ASCII, stored after the IFD).
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x9003, 28);
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(value.length, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.writeUInt32LE(0, 40);
  value.copy(tiff, 44);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const header = Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  const src = Buffer.from(jpeg);
  return Buffer.concat([src.subarray(0, 2), header, payload, src.subarray(2)]);
}

/** An EXIF tag value: ASCII text, a SHORT, or an unsigned RATIONAL [numerator, denominator]. */
export type ExifTagValue = string | { short: number } | { rational: [number, number] };

/**
 * Inserts a big-endian EXIF APP1 segment with the given IFD0 and Exif-IFD
 * tags right after the JPEG SOI marker (like a camera's, minus the rest).
 */
export function withExif(jpeg: Uint8Array, tags: { ifd0: Record<number, ExifTagValue>; exif: Record<number, ExifTagValue> }): Buffer {
  const ifd0 = Object.entries(tags.ifd0).map(([t, v]) => [Number(t), v] as const);
  const exif = Object.entries(tags.exif).map(([t, v]) => [Number(t), v] as const);
  const ifd0Size = 2 + (ifd0.length + 1) * 12 + 4; // +1: the Exif IFD pointer
  const exifOffset = 8 + ifd0Size;
  let dataOffset = exifOffset + 2 + exif.length * 12 + 4;
  const data: Buffer[] = [];
  const u16 = (v: number) => Buffer.from([v >> 8, v & 0xff]);
  const u32 = (v: number) => Buffer.from([v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const entry = (tag: number, value: ExifTagValue): Buffer => {
    if (typeof value === 'string') {
      const bytes = Buffer.from(`${value}\0`, 'ascii');
      const at = dataOffset;
      data.push(bytes);
      dataOffset += bytes.length;
      return Buffer.concat([u16(tag), u16(2), u32(bytes.length), u32(at)]);
    }
    if ('short' in value) return Buffer.concat([u16(tag), u16(3), u32(1), u16(value.short), u16(0)]);
    const at = dataOffset;
    data.push(Buffer.concat([u32(value.rational[0]), u32(value.rational[1])]));
    dataOffset += 8;
    return Buffer.concat([u16(tag), u16(5), u32(1), u32(at)]);
  };
  const ifd0Entries = [...ifd0.map(([t, v]) => entry(t, v)), Buffer.concat([u16(0x8769), u16(4), u32(1), u32(exifOffset)])];
  const exifEntries = exif.map(([t, v]) => entry(t, v));
  const tiff = Buffer.concat([
    Buffer.from('MM', 'ascii'),
    u16(42),
    u32(8),
    u16(ifd0Entries.length),
    ...ifd0Entries,
    u32(0),
    u16(exifEntries.length),
    ...exifEntries,
    u32(0),
    ...data,
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const header = Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  const src = Buffer.from(jpeg);
  return Buffer.concat([src.subarray(0, 2), header, payload, src.subarray(2)]);
}
