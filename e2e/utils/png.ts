import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** Minimal PNG encode/decode for tests: 8-bit RGB/RGBA, non-interlaced. */

export interface RgbaPixels {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng({ width, height, data }: RgbaPixels): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // filter: none
    rows.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(raw: Buffer, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] ?? 0;
      const a = x >= bpp ? (out[y * stride + x - bpp] ?? 0) : 0;
      const b = y > 0 ? (out[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= bpp && y > 0 ? (out[(y - 1) * stride + x - bpp] ?? 0) : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter] ?? 0;
      out[y * stride + x] = (v + pred) & 0xff;
    }
  }
  return out;
}

export function decodePng(png: Buffer): RgbaPixels {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9] ?? 0;
      if (body[8] !== 8 || body[12] !== 0) throw new Error('Only 8-bit non-interlaced PNGs are supported');
    } else if (type === 'IDAT') idat.push(body);
    offset += 12 + length;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`Unsupported PNG color type ${colorType}`);
  const pixels = unfilter(inflateSync(Buffer.concat(idat)), width, height, bpp);
  if (bpp === 4) return { width, height, data: pixels };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([pixels[i * 3] ?? 0, pixels[i * 3 + 1] ?? 0, pixels[i * 3 + 2] ?? 0, 255], i * 4);
  return { width, height, data };
}

/** Mean of each channel and of the per-pixel spread max(r,g,b) - min(r,g,b). */
export function imageStats({ data }: RgbaPixels) {
  let r = 0;
  let g = 0;
  let b = 0;
  let spread = 0;
  let lumaSq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i] ?? 0;
    const pg = data[i + 1] ?? 0;
    const pb = data[i + 2] ?? 0;
    r += pr;
    g += pg;
    b += pb;
    spread += Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
    const luma = (pr + pg + pb) / 3;
    lumaSq += luma * luma;
  }
  const mean = (r + g + b) / (3 * n);
  return { mean, meanSpread: spread / n, lumaStdDev: Math.sqrt(lumaSq / n - mean * mean) };
}

/** Colorful test photo: hue sweep across x, brightness ramp down y. */
export function makeTestPhoto(width: number, height: number): RgbaPixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const value = 0.15 + 0.75 * (1 - y / (height - 1));
    for (let x = 0; x < width; x++) {
      const h = (x / width) * 6;
      const f = h - Math.floor(h);
      const sector = Math.floor(h) % 6;
      const rgb = [
        [1, f, 0],
        [1 - f, 1, 0],
        [0, 1, f],
        [0, 1 - f, 1],
        [f, 0, 1],
        [1, 0, 1 - f],
      ][sector] ?? [0, 0, 0];
      const i = (y * width + x) * 4;
      // Mix 40% gray in so saturation can move both ways.
      data.set(rgb.map((c) => Math.round(255 * value * (0.4 + 0.6 * c))), i);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Mean absolute per-channel difference (RGB) between two same-size images. */
export function meanAbsDiff(a: RgbaPixels, b: RgbaPixels): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('Image sizes differ');
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) sum += Math.abs((a.data[i + c] ?? 0) - (b.data[i + c] ?? 0));
  }
  return sum / ((a.data.length / 4) * 3);
}

/** Number of pixels whose RGBA differs at all. */
export function countDifferentPixels(a: RgbaPixels, b: RgbaPixels): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) n++;
  }
  return n;
}
