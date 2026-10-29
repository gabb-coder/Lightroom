/**
 * Minimal ZIP (store only, no compression) writer and reader, enough for
 * catalog backups and batch exports. Photos are already compressed, so
 * storing them as-is costs nothing and keeps this small. ZIP64 records are
 * written when an archive passes 4 GB or 65 535 entries, and read back.
 *
 * Writing builds a Blob out of the entries' own Blobs (no copy of the photo
 * data in memory beyond computing each CRC); reading slices the file, so a
 * multi-gigabyte backup is never loaded at once.
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_ZIP64_END = 0x06064b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EXTRA = 0x0001;
const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
/** Bit 11: file names are UTF-8. */
const FLAG_UTF8 = 0x0800;
const VERSION = 45; // 4.5: ZIP64-capable

let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

/** CRC-32 (IEEE), continuing from `crc` for data split into chunks. */
export function crc32(data: Uint8Array, crc = 0): number {
  const t = table();
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = (t[(c ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return ~c >>> 0;
}

export interface ZipEntryInput {
  /** Path inside the archive, "/" separated. */
  name: string;
  data: Blob | Uint8Array | string;
  /** Modification time (epoch ms); defaults to now. */
  date?: number;
}

/** MS-DOS date/time fields (local time, 2-second resolution, 1980–2107). */
function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

class Bytes {
  private readonly buf: Uint8Array;
  private readonly view: DataView;
  private pos = 0;
  constructor(size: number) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
  }
  u16(v: number) {
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
    return this;
  }
  u32(v: number) {
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
    return this;
  }
  u64(v: number) {
    this.view.setUint32(this.pos, v % 0x100000000, true);
    this.view.setUint32(this.pos + 4, Math.floor(v / 0x100000000), true);
    this.pos += 8;
    return this;
  }
  bytes(b: Uint8Array) {
    this.buf.set(b, this.pos);
    this.pos += b.length;
    return this;
  }
  get result(): Uint8Array {
    return this.buf;
  }
}

async function toBytesBlob(data: ZipEntryInput['data']): Promise<{ blob: Blob; crc: number; size: number }> {
  const blob = typeof data === 'string' ? new Blob([data]) : data instanceof Blob ? data : new Blob([data.slice().buffer as ArrayBuffer]);
  // CRC in 8 MB chunks so a large photo isn't held twice.
  let crc = 0;
  const CHUNK = 8 * 1024 * 1024;
  for (let at = 0; at < blob.size; at += CHUNK) crc = crc32(new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer()), crc);
  return { blob, crc, size: blob.size };
}

export interface ZipOptions {
  /** Write ZIP64 records even when not needed (tests). */
  forceZip64?: boolean;
}

/** Builds a store-only ZIP archive. */
export async function createZip(entries: readonly ZipEntryInput[], options: ZipOptions = {}): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const { blob, crc, size } = await toBytesBlob(entry.data);
    const { time, date } = dosDateTime(entry.date ?? Date.now());
    const zip64 = options.forceZip64 || size >= MAX32 || offset >= MAX32;
    const localExtra = zip64 ? new Bytes(20).u16(ZIP64_EXTRA).u16(16).u64(size).u64(size).result : new Uint8Array(0);
    const local = new Bytes(30 + name.length + localExtra.length)
      .u32(SIG_LOCAL)
      .u16(VERSION)
      .u16(FLAG_UTF8)
      .u16(0) // stored
      .u16(time)
      .u16(date)
      .u32(crc)
      .u32(zip64 ? MAX32 : size)
      .u32(zip64 ? MAX32 : size)
      .u16(name.length)
      .u16(localExtra.length)
      .bytes(name)
      .bytes(localExtra).result;
    const centralExtra = zip64 ? new Bytes(28).u16(ZIP64_EXTRA).u16(24).u64(size).u64(size).u64(offset).result : new Uint8Array(0);
    central.push(
      new Bytes(46 + name.length + centralExtra.length)
        .u32(SIG_CENTRAL)
        .u16(VERSION)
        .u16(VERSION)
        .u16(FLAG_UTF8)
        .u16(0)
        .u16(time)
        .u16(date)
        .u32(crc)
        .u32(zip64 ? MAX32 : size)
        .u32(zip64 ? MAX32 : size)
        .u16(name.length)
        .u16(centralExtra.length)
        .u16(0) // comment
        .u16(0) // disk
        .u16(0) // internal attributes
        .u32(0) // external attributes
        .u32(zip64 ? MAX32 : offset)
        .bytes(name)
        .bytes(centralExtra).result,
    );
    parts.push(local.slice().buffer as ArrayBuffer, blob);
    offset += local.length + size;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const zip64End = options.forceZip64 || entries.length >= MAX16 || offset >= MAX32 || centralSize >= MAX32;
  for (const c of central) parts.push(c.slice().buffer as ArrayBuffer);
  if (zip64End) {
    const endOffset = offset + centralSize;
    parts.push(
      new Bytes(56)
        .u32(SIG_ZIP64_END)
        .u64(44)
        .u16(VERSION)
        .u16(VERSION)
        .u32(0)
        .u32(0)
        .u64(entries.length)
        .u64(entries.length)
        .u64(centralSize)
        .u64(offset)
        .result.slice().buffer as ArrayBuffer,
      new Bytes(20).u32(SIG_ZIP64_LOCATOR).u32(0).u64(endOffset).u32(1).result.slice().buffer as ArrayBuffer,
    );
  }
  parts.push(
    new Bytes(22)
      .u32(SIG_END)
      .u16(0)
      .u16(0)
      .u16(zip64End ? MAX16 : entries.length)
      .u16(zip64End ? MAX16 : entries.length)
      .u32(zip64End ? MAX32 : centralSize)
      .u32(zip64End ? MAX32 : offset)
      .u16(0)
      .result.slice().buffer as ArrayBuffer,
  );
  return new Blob(parts, { type: 'application/zip' });
}

export interface ZipEntry {
  name: string;
  size: number;
  crc: number;
  /** The entry's bytes, sliced from the archive (not read yet). */
  blob: Blob;
}

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipFormatError';
  }
}

const u64 = (v: DataView, at: number) => v.getUint32(at, true) + v.getUint32(at + 4, true) * 0x100000000;

/** Finds the end-of-central-directory record in the last 64 KB + 22 bytes. */
async function readEnd(file: Blob): Promise<{ count: number; centralSize: number; centralOffset: number }> {
  const tailSize = Math.min(file.size, 65557);
  const tailStart = file.size - tailSize;
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) !== SIG_END) continue;
    let count = tail.getUint16(i + 10, true);
    let centralSize = tail.getUint32(i + 12, true);
    let centralOffset = tail.getUint32(i + 16, true);
    if (count === MAX16 || centralSize === MAX32 || centralOffset === MAX32) {
      const locatorAt = i - 20;
      if (locatorAt < 0 || tail.getUint32(locatorAt, true) !== SIG_ZIP64_LOCATOR) throw new ZipFormatError('Missing ZIP64 locator');
      const endAt = u64(tail, locatorAt + 8);
      const end = new DataView(await file.slice(endAt, endAt + 56).arrayBuffer());
      if (end.getUint32(0, true) !== SIG_ZIP64_END) throw new ZipFormatError('Bad ZIP64 end record');
      count = u64(end, 32);
      centralSize = u64(end, 40);
      centralOffset = u64(end, 48);
    }
    return { count, centralSize, centralOffset };
  }
  throw new ZipFormatError('Not a ZIP file');
}

/** Lists the entries of a store-only ZIP (as written by createZip). */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const { count, centralSize, centralOffset } = await readEnd(file);
  if (centralOffset + centralSize > file.size) throw new ZipFormatError('Truncated ZIP file');
  const dir = new DataView(await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer());
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let n = 0; n < count; n++) {
    if (dir.getUint32(at, true) !== SIG_CENTRAL) throw new ZipFormatError('Bad central directory');
    const method = dir.getUint16(at + 10, true);
    const crc = dir.getUint32(at + 16, true);
    let size = dir.getUint32(at + 24, true);
    const nameLength = dir.getUint16(at + 28, true);
    const extraLength = dir.getUint16(at + 30, true);
    const commentLength = dir.getUint16(at + 32, true);
    let localOffset = dir.getUint32(at + 42, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + at + 46, nameLength));
    // ZIP64 extra: the 0xFFFFFFFF fields, in order (uncompressed, compressed, offset).
    let e = at + 46 + nameLength;
    const extraEnd = e + extraLength;
    while (e + 4 <= extraEnd) {
      const id = dir.getUint16(e, true);
      const len = dir.getUint16(e + 2, true);
      if (id === ZIP64_EXTRA) {
        let f = e + 4;
        if (size === MAX32) {
          size = u64(dir, f);
          f += 16; // uncompressed + compressed (equal: stored)
        }
        if (localOffset === MAX32) localOffset = u64(dir, f);
      }
      e += 4 + len;
    }
    if (method !== 0) throw new ZipFormatError(`"${name}" is compressed; only stored entries are supported`);
    const local = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
    if (local.getUint32(0, true) !== SIG_LOCAL) throw new ZipFormatError('Bad local header');
    const dataStart = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    entries.push({ name, size, crc, blob: file.slice(dataStart, dataStart + size) });
    at = extraEnd + commentLength;
  }
  return entries;
}

/** Reads an entry's bytes and checks its CRC. */
export async function readEntryBytes(entry: ZipEntry): Promise<Uint8Array> {
  const bytes = new Uint8Array(await entry.blob.arrayBuffer());
  if (crc32(bytes) !== entry.crc) throw new ZipFormatError(`"${entry.name}" is damaged (CRC mismatch)`);
  return bytes;
}
