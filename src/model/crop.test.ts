import { describe, expect, it } from 'vitest';
import { applyGeometryRgba8 } from '../engine/geometry';
import {
  aspectRatioFor,
  displayGeometry,
  constrainToward,
  cropForAspect,
  fitCropToAngle,
  flipGeometryH,
  FULL_CROP,
  isCropInside,
  maxCenteredCrop,
  moveCrop,
  resizeCrop,
  rotateGeometry90,
} from './crop';
import { defaultEditSettings, type Geometry } from './editSettings';

const o = { width: 600, height: 400 };
const geo = (patch: Partial<Geometry>): Geometry => ({ ...defaultEditSettings().geometry, ...patch });
const pxRatio = (r: { w: number; h: number }, size = o) => (r.w * size.width) / (r.h * size.height);

describe('crop aspect presets', () => {
  it('follow the crop orientation', () => {
    expect(aspectRatioFor('original', o, FULL_CROP)).toBe(1.5);
    expect(aspectRatioFor('4:5', o, FULL_CROP)).toBe(1.25);
    expect(aspectRatioFor('4:5', o, { x: 0, y: 0, w: 0.2, h: 0.9 })).toBe(0.8);
    expect(aspectRatioFor('16:9', { width: 400, height: 600 }, FULL_CROP)).toBeCloseTo(9 / 16, 12);
    expect(aspectRatioFor('custom', o, FULL_CROP)).toBeNull();
  });

  it('cropForAspect gives the largest crop of that ratio', () => {
    const square = cropForAspect(geo({}), '1:1', o);
    expect(pxRatio(square)).toBeCloseTo(1, 9);
    expect(square.h).toBeCloseTo(1, 9);
    expect(square.x).toBeCloseTo((1 - 400 / 600) / 2, 9);
    const wide = cropForAspect(geo({}), '16:9', o);
    expect(pxRatio(wide)).toBeCloseTo(16 / 9, 9);
    expect(wide.w).toBeCloseTo(1, 9);
  });
});

describe('straighten keeps the crop inside the image', () => {
  it('maxCenteredCrop fits exactly (touches the edge)', () => {
    for (const angle of [3, -12, 30, 45]) {
      const r = maxCenteredCrop(1.5, angle, o);
      expect(isCropInside(r, angle, o)).toBe(true);
      const bigger = { x: r.x - 0.002, y: r.y - 0.002, w: r.w + 0.004, h: r.h + 0.004 };
      expect(isCropInside(bigger, angle, o)).toBe(false);
      expect(pxRatio(r)).toBeCloseTo(1.5, 9);
    }
  });

  it('fitCropToAngle shrinks a full crop and keeps its aspect; small crops are untouched', () => {
    const fitted = fitCropToAngle(FULL_CROP, 10, o);
    expect(isCropInside(fitted, 10, o)).toBe(true);
    expect(fitted.w).toBeLessThan(1);
    expect(pxRatio(fitted)).toBeCloseTo(1.5, 6);
    const small = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
    expect(fitCropToAngle(small, 10, o)).toBe(small);
  });

  it('constrainToward stops at the boundary', () => {
    const valid = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
    const r = constrainToward(valid, { ...valid, x: 0.9 }, 0, o);
    expect(r.x + r.w).toBeCloseTo(1, 6);
  });
});

describe('moving and resizing', () => {
  const start = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

  it('moves within the image', () => {
    expect(moveCrop(start, 0.1, -0.05, 0, o)).toEqual({ x: 0.35, y: 0.2, w: 0.5, h: 0.5 });
    expect(moveCrop(start, 1, 1, 0, o)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it('free-resizes from any handle, with a minimum size and within bounds', () => {
    expect(resizeCrop(start, 'se', 0.1, 0.2, geo({ aspect: 'custom' }), o)).toEqual({ x: 0.25, y: 0.25, w: 0.6, h: 0.7 });
    expect(resizeCrop(start, 'w', -0.5, 0, geo({ aspect: 'custom' }), o)).toEqual({ x: 0, y: 0.25, w: 0.75, h: 0.5 });
    const tiny = resizeCrop(start, 'n', 0, 0.9, geo({ aspect: 'custom' }), o);
    expect(tiny.h).toBeCloseTo(0.02, 9);
  });

  it('keeps the aspect with a preset, from corners and edges', () => {
    const g = geo({ aspect: '1:1' });
    const sq = cropForAspect(geo({}), '1:1', o);
    for (const handle of ['se', 'nw', 'e', 'n'] as const) {
      const r = resizeCrop(sq, handle, -0.1, -0.1, g, o);
      expect(pxRatio(r)).toBeCloseTo(1, 9);
      expect(isCropInside(r, 0, o)).toBe(true);
    }
    // The se corner keeps the nw corner fixed.
    const r = resizeCrop(sq, 'se', -0.1, -0.1, g, o);
    expect(r.x).toBeCloseTo(sq.x, 9);
    expect(r.y).toBeCloseTo(sq.y, 9);
  });

  it('never leaves the straightened image', () => {
    const g = geo({ aspect: 'custom', angle: 15 });
    const fitted = fitCropToAngle(FULL_CROP, 15, o);
    expect(isCropInside(resizeCrop(fitted, 'se', 0.5, 0.5, g, o), 15, o)).toBe(true);
    expect(isCropInside(moveCrop({ ...fitted, w: fitted.w / 2 }, 0.5, 0.3, 15, o), 15, o)).toBe(true);
  });
});

describe('rotate 90° and flip', () => {
  /** 4×2 test image with distinct colors. */
  const W = 4;
  const H = 2;
  const image = new Uint8Array(W * H * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));

  function render(g: Geometry) {
    return applyGeometryRgba8(image, { width: W, height: H }, g);
  }

  function rotateImageCw(img: { width: number; height: number; data: Uint8ClampedArray }) {
    const out = new Uint8ClampedArray(img.data.length);
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const nx = img.height - 1 - y;
        const ny = x;
        out.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (ny * img.height + nx) * 4);
      }
    return { width: img.height, height: img.width, data: out };
  }

  function mirror(img: { width: number; height: number; data: Uint8ClampedArray }) {
    const out = new Uint8ClampedArray(img.data.length);
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++)
        out.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (y * img.width + (img.width - 1 - x)) * 4);
    return { ...img, data: out };
  }

  const cases: Geometry[] = [
    geo({}),
    geo({ cropRect: { x: 0.25, y: 0, w: 0.5, h: 1 } }),
    geo({ flipH: true, cropRect: { x: 0, y: 0.5, w: 0.75, h: 0.5 } }),
    geo({ rotation: 3, flipV: true }),
  ];

  it('Rotate 90° turns the rendered result clockwise, with any crop and flips', () => {
    for (const g of cases) {
      const after = render(rotateGeometry90(g));
      const expected = rotateImageCw(render(g));
      expect(after.width).toBe(expected.width);
      expect(Array.from(after.data)).toEqual(Array.from(expected.data));
    }
  });

  it('Flip horizontal mirrors the rendered result', () => {
    for (const g of cases) {
      expect(Array.from(render(flipGeometryH(g)).data)).toEqual(Array.from(mirror(render(g)).data));
    }
  });

  it('four turns or two flips return the original geometry', () => {
    const g = geo({ cropRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, angle: 4 });
    const r4 = rotateGeometry90(rotateGeometry90(rotateGeometry90(rotateGeometry90(g))));
    expect(r4.rotation).toBe(0);
    expect(r4.cropRect.x).toBeCloseTo(0.1, 12);
    expect(r4.cropRect.h).toBeCloseTo(0.4, 12);
    const f2 = flipGeometryH(flipGeometryH(g));
    expect({ ...f2, cropRect: null }).toEqual({ ...g, cropRect: null });
    expect(f2.cropRect.x).toBeCloseTo(g.cropRect.x, 12); // float noise only
  });

  it('flipping a straightened image mirrors the angle', () => {
    expect(flipGeometryH(geo({ angle: 7.5 })).angle).toBe(-7.5);
  });
});

describe('displayGeometry', () => {
  const g = geo({ angle: 5, rotation: 1, cropRect: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } });
  it('shows the stored crop normally, the whole image while cropping, and nothing for Before', () => {
    expect(displayGeometry(g, { before: false, cropping: false })).toBe(g);
    expect(displayGeometry(g, { before: false, cropping: true })).toEqual({ ...g, cropRect: FULL_CROP });
    expect(displayGeometry(g, { before: true, cropping: true })).toEqual(defaultEditSettings().geometry);
  });
});
