import { describe, expect, it } from 'vitest';
import { crc32, createZip, readEntryBytes, readZip, ZipFormatError } from './zip';

const text = (s: string) => new TextEncoder().encode(s);
function nth<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`no entry ${i}`);
  return item;
}

describe('zip', () => {
  it('computes CRC-32 like zlib, also in chunks', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    const whole = crc32(text('hello, darkroom'));
    expect(crc32(text(', darkroom'), crc32(text('hello')))).toBe(whole);
  });

  it('round-trips entries (names in UTF-8, binary data, empty files)', async () => {
    const binary = new Uint8Array(1000).map((_, i) => (i * 37) % 256);
    const zip = await createZip([
      { name: 'catalog.json', data: '{"a":1}' },
      { name: 'originals/fötö 1.jpg', data: binary },
      { name: 'empty.txt', data: new Blob([]) },
    ]);
    const entries = await readZip(zip);
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ['catalog.json', 7],
      ['originals/fötö 1.jpg', 1000],
      ['empty.txt', 0],
    ]);
    expect(new TextDecoder().decode(await readEntryBytes(nth(entries, 0)))).toBe('{"a":1}');
    expect(Array.from(await readEntryBytes(nth(entries, 1)))).toEqual(Array.from(binary));
  });

  it('writes a standard layout: local headers, central directory, end record', async () => {
    const zip = new Uint8Array(await (await createZip([{ name: 'a.txt', data: 'hi', date: new Date(2024, 0, 2, 3, 4, 6).getTime() }])).arrayBuffer());
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // stored
    expect(view.getUint16(10, true)).toBe((3 << 11) | (4 << 5) | 3); // 03:04:06
    expect(view.getUint16(12, true)).toBe(((2024 - 1980) << 9) | (1 << 5) | 2);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 12, true)).toBe(1); // entries
  });

  it('reads and writes ZIP64 records', async () => {
    const zip = await createZip([{ name: 'big.bin', data: text('pretend this is huge') }, { name: 'b', data: 'x' }], { forceZip64: true });
    const entries = await readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['big.bin', 'b']);
    expect(new TextDecoder().decode(await readEntryBytes(nth(entries, 0)))).toBe('pretend this is huge');
  });

  it('rejects files that are not ZIPs and detects damage', async () => {
    await expect(readZip(new Blob(['not a zip at all']))).rejects.toBeInstanceOf(ZipFormatError);
    const bytes = new Uint8Array(await (await createZip([{ name: 'a.txt', data: 'hello' }])).arrayBuffer());
    bytes[35] = (bytes[35] ?? 0) ^ 0xff; // flip a data byte
    const entries = await readZip(new Blob([bytes]));
    await expect(readEntryBytes(nth(entries, 0))).rejects.toThrow('damaged');
  });
});
