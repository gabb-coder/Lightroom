import { describe, expect, it } from 'vitest';
import { defaultEditSettings, type Geometry } from '../model/editSettings';
import { applyGeometryRgba8, geometryMap, isIdentityGeometry, lensMap, lensParams, outputToSource, sourceToOutput } from './geometry';

const SRC = { width: 300, height: 200 };
const geometry = (patch: Partial<Geometry>): Geometry => ({ ...defaultEditSettings().geometry, ...patch });

describe('lens and perspective (M29)', () => {
  it('is off at defaults, and anything else turns off the identity fast path', () => {
    expect(lensParams(geometry({}))).toBeNull();
    expect(isIdentityGeometry(geometry({}))).toBe(true);
    for (const patch of [{ distortion: 10 }, { vertical: -5 }, { horizontal: 1 }, { scale: 101 }, { fringeRed: 3 }, { fringeBlue: -3 }]) {
      expect(isIdentityGeometry(geometry(patch)), JSON.stringify(patch)).toBe(false);
    }
  });

  it('keeps straight lines straight under perspective', () => {
    const lens = lensParams(geometry({ vertical: 70, horizontal: -40 }));
    if (!lens) throw new Error('lens expected');
    const points = [0, 0.3, 0.7, 1].map((t) => lensMap(lens, SRC, 20 + 250 * t, 30 + 120 * t));
    const [a, b, c, d] = points.map((p) => p ?? [NaN, NaN]);
    const cross = (p: number[], q: number[], r: number[]) => ((q[0] ?? 0) - (p[0] ?? 0)) * ((r[1] ?? 0) - (p[1] ?? 0)) - ((q[1] ?? 0) - (p[1] ?? 0)) * ((r[0] ?? 0) - (p[0] ?? 0));
    expect(Math.abs(cross(a ?? [], b ?? [], c ?? []))).toBeLessThan(1e-6);
    expect(Math.abs(cross(a ?? [], b ?? [], d ?? []))).toBeLessThan(1e-6);
  });

  it('positive Vertical takes the top row from a narrower span than the bottom (fixes converging verticals)', () => {
    const lens = lensParams(geometry({ vertical: 60 }));
    if (!lens) throw new Error('lens expected');
    const span = (y: number) => {
      const l = lensMap(lens, SRC, 0, y);
      const r = lensMap(lens, SRC, 300, y);
      return (r?.[0] ?? 0) - (l?.[0] ?? 0);
    };
    expect(span(0)).toBeLessThan(span(200));
    // The center stays put.
    expect(lensMap(lens, SRC, 150, 100)).toEqual([150, 100]);
  });

  it('positive Distortion pulls the corners in, keeps the center, and grows with the radius', () => {
    const lens = lensParams(geometry({ distortion: 80 }));
    if (!lens) throw new Error('lens expected');
    let last = 0;
    for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
      const q = lensMap(lens, SRC, 150 + 150 * t, 100 + 100 * t) ?? [0, 0];
      const r = Math.hypot(q[0] - 150, q[1] - 100);
      expect(r).toBeLessThan(Math.hypot(150 * t, 100 * t));
      expect(r).toBeGreaterThan(last);
      last = r;
    }
    // Scale 150 % takes everything from 2/3 of the way out.
    const zoom = lensParams(geometry({ scale: 150 }));
    if (!zoom) throw new Error('lens expected');
    expect(lensMap(zoom, SRC, 300, 100)?.[0]).toBeCloseTo(250, 9);
  });

  it('maps source → output back exactly (overlays line up), with rotation, crop and every lens setting', () => {
    const g = geometry({ rotation: 1, flipH: true, angle: 4, cropRect: { x: 0.1, y: 0.05, w: 0.8, h: 0.85 }, distortion: -40, vertical: 35, horizontal: -25, scale: 115, fringeRed: 20 });
    const map = geometryMap(SRC, g);
    for (const [x, y] of [
      [40, 30],
      [150, 100],
      [250, 170],
      [10, 190],
    ] as const) {
      const out = sourceToOutput(map, x, y);
      if (!out) throw new Error('no inverse');
      const back = outputToSource(map, out[0], out[1]);
      expect(back?.[0]).toBeCloseTo(x, 4);
      expect(back?.[1]).toBeCloseTo(y, 4);
    }
  });

  it('negative Distortion leaves the corners transparent; Fringe moves only red / blue, clamped at the edges', () => {
    const data = new Uint8ClampedArray(SRC.width * SRC.height * 4);
    for (let y = 0; y < SRC.height; y++) {
      for (let x = 0; x < SRC.width; x++) data.set(x < 200 ? [40, 40, 40, 255] : [220, 220, 220, 255], (y * SRC.width + x) * 4);
    }
    const pin = applyGeometryRgba8(data, SRC, geometry({ distortion: -100 }));
    expect(pin.data[3]).toBe(0); // top-left corner
    expect(pin.data[(100 * 300 + 150) * 4 + 3]).toBe(255);

    const fringe = applyGeometryRgba8(data, SRC, geometry({ fringeRed: 100 }));
    // Just left of the edge (50 px right of center), red is sampled 0.4 % further out: 0.2 px into the bright side.
    const i = (100 * 300 + 199) * 4;
    expect(fringe.data[i]).toBe(Math.round(40 + 0.2 * 180));
    expect(fringe.data[i + 1]).toBe(40);
    expect(fringe.data[i + 2]).toBe(40);
    // Nothing turns transparent at the borders.
    expect(Math.min(...[0, 299].map((x) => fringe.data[(100 * 300 + x) * 4 + 3] ?? 0))).toBe(255);
  });
});
