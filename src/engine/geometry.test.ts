import { describe, expect, it } from 'vitest';
import { defaultEditSettings, type Geometry } from '../model/editSettings';
import { applyAffine, applyGeometryRgba8, geometryMatrix, isIdentityGeometry, outputSize, sampleBilinear } from './geometry';

const geo = (patch: Partial<Geometry>): Geometry => ({ ...defaultEditSettings().geometry, ...patch });

/** 3×2 image where pixel (x, y) has red = 10·x + 100·y + 1. */
const W = 3;
const H = 2;
const image = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) image.set([10 * x + 100 * y + 1, 7, 9, 255], (y * W + x) * 4);

/** Red channel as rows, for readable expectations. */
function reds(g: Geometry): number[][] {
  const out = applyGeometryRgba8(image, { width: W, height: H }, g);
  return Array.from({ length: out.height }, (_, y) => Array.from({ length: out.width }, (_, x) => out.data[(y * out.width + x) * 4] ?? -1));
}

describe('geometry', () => {
  it('is an exact copy at defaults', () => {
    expect(isIdentityGeometry(geo({}))).toBe(true);
    expect(geometryMatrix({ width: W, height: H }, geo({}))).toEqual([1, 0, 0, 0, 1, 0]);
    expect(Array.from(applyGeometryRgba8(image, { width: W, height: H }, geo({})).data)).toEqual(Array.from(image));
  });

  it('flips horizontally and vertically', () => {
    expect(reds(geo({ flipH: true }))).toEqual([
      [21, 11, 1],
      [121, 111, 101],
    ]);
    expect(reds(geo({ flipV: true }))).toEqual([
      [101, 111, 121],
      [1, 11, 21],
    ]);
  });

  it('rotates clockwise by quarter turns, swapping the output size', () => {
    expect(reds(geo({ rotation: 1 }))).toEqual([
      [101, 1],
      [111, 11],
      [121, 21],
    ]);
    expect(reds(geo({ rotation: 2 }))).toEqual([
      [121, 111, 101],
      [21, 11, 1],
    ]);
    expect(reds(geo({ rotation: 3 }))).toEqual([
      [21, 121],
      [11, 111],
      [1, 101],
    ]);
  });

  it('crops in oriented coordinates', () => {
    expect(reds(geo({ cropRect: { x: 1 / 3, y: 0.5, w: 2 / 3, h: 0.5 } }))).toEqual([[111, 121]]);
    // Rotated: the crop applies after the turn.
    expect(reds(geo({ rotation: 1, cropRect: { x: 0, y: 0, w: 0.5, h: 1 } }))).toEqual([[101], [111], [121]]);
  });

  it('sizes the output from the crop', () => {
    expect(outputSize({ width: 6000, height: 4000 }, geo({ cropRect: { x: 0.1, y: 0.1, w: 0.5, h: 0.25 } }))).toEqual({ width: 3000, height: 1000 });
    expect(outputSize({ width: 6000, height: 4000 }, geo({ rotation: 3 }))).toEqual({ width: 4000, height: 6000 });
  });

  it('straightens about the center: the center stays put, corners move clockwise', () => {
    const src = { width: 200, height: 100 };
    const m = geometryMatrix(src, geo({ angle: 90 }));
    const [cx, cy] = applyAffine(m, 100, 50);
    expect(cx).toBeCloseTo(100, 9);
    expect(cy).toBeCloseTo(50, 9);
    // A 90° clockwise turn shows, right of center, what was above center.
    const [x, y] = applyAffine(m, 110, 50);
    expect(x).toBeCloseTo(100, 9);
    expect(y).toBeCloseTo(40, 9);
  });

  it('samples bilinearly between texel centers, clamps at edges and is transparent outside', () => {
    expect(sampleBilinear(image, W, H, 1.0, 0.5)[0]).toBeCloseTo(6, 9); // between x=0 (1) and x=1 (11)
    expect(sampleBilinear(image, W, H, 0.5, 1.0)[0]).toBeCloseTo(51, 9); // between rows
    expect(sampleBilinear(image, W, H, 0.1, 0.1)[0]).toBe(1); // clamped edge
    expect(sampleBilinear(image, W, H, -0.1, 1)).toEqual([0, 0, 0, 0]);
    expect(sampleBilinear(image, W, H, 1, 2.1)).toEqual([0, 0, 0, 0]);
  });
});
