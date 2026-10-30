// Draws the app icons (the aperture logo of src/components/icons.tsx LogoIcon,
// light on the app's dark background) as PNGs for the web app manifest.
// Run: node scripts/make-icons.mjs  →  public/icons/icon-{192,512}.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [27, 27, 27];
const FG = [232, 232, 232];
/** LogoIcon's blades, in its 18-unit box (circle r 7.25 around 9, 9). */
const BLADES = [
  [9, 1.75, 12.4, 7.9],
  [16.2, 9.2, 9.6, 12.5],
  [12.3, 15.6, 5.6, 12],
  [1.8, 9.6, 6.2, 4.4],
  [4.9, 3, 12.6, 3.4],
];

function segmentDistance(px, py, [x0, y0, x1, y1]) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/** Coverage of the logo at a point in 18-unit coordinates (stroke 1.0, a little lighter than the 18 px SVG). */
function inLogo(x, y) {
  const half = 0.5;
  if (Math.abs(Math.hypot(x - 9, y - 9) - 7.25) < half) return true;
  return BLADES.some((b) => segmentDistance(x, y, b) < half);
}

function draw(size) {
  // The logo fills the central 62 %, inside the maskable safe zone.
  const scale = 18 / (size * 0.62);
  const offset = (size - 18 / scale) / 2;
  const rgba = Buffer.alloc(size * size * 4);
  const N = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (inLogo((x + (i + 0.5) / N - offset) * scale, (y + (j + 0.5) / N - offset) * scale)) hits++;
      const a = hits / (N * N);
      const k = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[k + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
      rgba[k + 3] = 255;
    }
  }
  return png(size, size, rgba);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [192, 512]) writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), draw(size));
