import { describe, expect, it } from 'vitest';
import type { BrushMask, BrushStroke } from '../model/editSettings';
import { defaultMaskAdjust } from '../model/editSettings';
import { BRUSH_RASTER_EDGE, brushRaster, dabCenters, rasterizeBrush, rasterSize, sampleBrush } from './brush';

const stroke = (points: number[], extra: Partial<BrushStroke> = {}): BrushStroke => ({ erase: false, radius: 0.05, feather: 0, points, ...extra });
const mask = (strokes: BrushStroke[], aspect = 1.5, id = 'm'): BrushMask => ({ id, kind: 'brush', aspect, strokes, adjust: defaultMaskAdjust() });
/** Byte-identical (toEqual on 700k-element arrays is very slow). */
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const cell = (r: { width: number; data: Uint8Array }, x: number, y: number) => r.data[y * r.width + x] ?? 0;

describe('brush raster', () => {
  it('has the photo aspect with a fixed long edge', () => {
    expect(rasterSize(1.5)).toEqual({ width: BRUSH_RASTER_EDGE, height: 683 });
    expect(rasterSize(0.5)).toEqual({ width: 512, height: BRUSH_RASTER_EDGE });
  });

  it('places dabs a fifth of the radius apart along the path, starting at the first point', () => {
    const dabs = dabCenters(stroke([0.1, 0.5, 0.2, 0.5], { radius: 0.05 }), 1);
    expect(dabs[0]).toEqual([0.1, 0.5]);
    expect(dabs.length).toBe(11); // 0.1 long-edge units / 0.01 spacing, plus the first
    expect(dabs[1]?.[0]).toBeCloseTo(0.11, 9);
    // Spacing continues across segments.
    expect(dabCenters(stroke([0.1, 0.5, 0.105, 0.5, 0.2, 0.5]), 1).length).toBe(11);
  });

  it('paints a hard round dab: full inside the radius, nothing outside, round in pixels on a wide photo', () => {
    const r = rasterizeBrush(mask([stroke([0.5, 0.5], { radius: 0.1 })], 2)); // 1024 × 512
    expect([r.width, r.height]).toEqual([1024, 512]);
    expect(cell(r, 512, 256)).toBe(255);
    // 0.1 of the long edge = 102.4 cells, the same on both axes.
    expect(cell(r, 512 + 100, 256)).toBe(255);
    expect(cell(r, 512, 256 + 100)).toBe(255);
    expect(cell(r, 512 + 104, 256)).toBe(0);
    expect(cell(r, 512, 256 + 104)).toBe(0);
  });

  it('feathers the edge smoothly', () => {
    const r = rasterizeBrush(mask([stroke([0.5, 0.5], { radius: 0.1, feather: 100 })], 1));
    const row = [0, 25, 50, 75, 100].map((d) => cell(r, 512 + d, 512));
    expect(row[0]).toBe(255);
    for (let i = 1; i < row.length; i++) expect(row[i] ?? 0).toBeLessThan(row[i - 1] ?? 0);
    expect(row[4]).toBeLessThan(5);
  });

  it('erases what was painted, in stroke order', () => {
    const painted = stroke([0.2, 0.5, 0.8, 0.5]);
    const erased = stroke([0.5, 0.2, 0.5, 0.8], { erase: true, radius: 0.03 });
    const r = rasterizeBrush(mask([painted, erased], 1));
    expect(cell(r, Math.round(0.3 * 1024), 512)).toBe(255);
    expect(cell(r, 512, 512)).toBe(0);
    const repainted = rasterizeBrush(mask([painted, erased, stroke([0.5, 0.5])], 1));
    expect(cell(repainted, 512, 512)).toBe(255);
  });

  it('the painting cache gives exactly the same bytes as a full rasterization', () => {
    const strokes: BrushStroke[] = [];
    let m = mask(strokes, 1.5, 'cache-test');
    for (let s = 0; s < 3; s++) {
      let current = stroke([0.2 + s * 0.2, 0.3], { radius: 0.04, feather: 60, erase: s === 2 });
      for (let p = 1; p < 6; p++) {
        // A growing stroke: a new stroke object each move, earlier strokes unchanged.
        current = { ...current, points: [...current.points, 0.2 + s * 0.2 + p * 0.03, 0.3 + p * 0.05] };
        m = { ...m, strokes: [...strokes, current] };
        expect(same(brushRaster(m).data, rasterizeBrush(m).data)).toBe(true);
      }
      strokes.push(current);
    }
    // Undo back to an older list (a cache miss) is still right.
    const older = { ...m, strokes: strokes.slice(0, 1) };
    expect(same(brushRaster(older).data, rasterizeBrush(older).data)).toBe(true);
  });

  it('samples bilinearly between cell centers, clamped at the edges', () => {
    const r = rasterizeBrush(mask([], 1));
    r.data[0] = 255;
    r.data[1] = 0;
    // Cell (0, 0) center is at u = 0.5 / 1024.
    expect(sampleBrush(r, 0.5 / 1024, 0.5 / 1024)).toBe(1);
    expect(sampleBrush(r, 1 / 1024, 0.5 / 1024)).toBeCloseTo(0.5, 9);
    expect(sampleBrush(r, 0, 0)).toBe(1); // clamped to the edge cell
    expect(sampleBrush(r, 0.5, 0.5)).toBe(0);
  });

  it('serializes to a short key (params stay cheap to compare)', () => {
    const r = rasterizeBrush(mask([stroke([0.5, 0.5])]));
    expect(JSON.stringify({ r })).toBe(`{"r":"${r.key}"}`);
  });
});
