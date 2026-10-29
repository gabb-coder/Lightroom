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
