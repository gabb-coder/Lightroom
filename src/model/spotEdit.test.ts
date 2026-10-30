import { describe, expect, it } from 'vitest';
import { defaultEditSettings, type Spot } from './editSettings';
import { maskView } from './maskEdit';
import { autoSource, createSpot, DEFAULT_SPOT_OPTIONS, moveSource, moveSpot, resizeSpot, spotRadius, spotRadiusFrame, spotSize, type PixelSample } from './spotEdit';
import { parseEditSettings } from './validate';

const SOURCE = { width: 400, height: 200 };
const view = maskView(SOURCE, defaultEditSettings().geometry, { width: 800, height: 400 });
const spot: Spot = { id: 'a', mode: 'heal', x: 0.25, y: 0.5, sx: 0.5, sy: 0.5, radius: 0.025, feather: 50, opacity: 100 };

/** Left third red, the rest a gray ripple. */
function sample(): PixelSample {
  const width = 120;
  const height = 60;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const g = 120 + 20 * Math.sin(x / 2);
      data.set(x < 40 ? [200, 40, 40, 255] : [g, g, g, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

describe('spot editing', () => {
  it('maps the Size slider to a radius and back', () => {
    expect(spotRadius(1)).toBeCloseTo(0.003, 9);
    expect(spotRadius(100)).toBeCloseTo(0.15, 9);
    for (const size of [1, 10, 30, 64, 100]) expect(spotSize(spotRadius(size))).toBe(size);
  });

  it('moves the spot with its source, or only the source; resizes through the rim', () => {
    expect(spotRadiusFrame(spot, view)).toBeCloseTo(20, 9); // 0.025 × 400 px × 2 (frame is twice the source)
    const moved = moveSpot(spot, view, 80, -40);
    expect(moved).toMatchObject({ x: 0.35, y: 0.4, sx: 0.6, sy: 0.4 });
    expect(moveSource(spot, view, -80, 0)).toMatchObject({ x: 0.25, sx: 0.4 });
    // Center at frame (200, 200); a rim point 60 px away → 30 source px → 0.075 of the long edge.
    expect(resizeSpot(spot, view, { x: 260, y: 200 }).radius).toBeCloseTo(0.075, 9);
    expect(resizeSpot(spot, view, { x: 200, y: 200 }).radius).toBeGreaterThan(0);
  });

  it('picks a nearby source that looks like the surroundings and fits in the photo', () => {
    const img = sample();
    // A spot in the gray area, near the red: the source must be gray, not red.
    const s = autoSource(img, 50 / 120, 0.5, 4 / 120);
    expect(s.sx * 120).toBeGreaterThanOrEqual(44); // the disc (radius 4) stays in the gray
    // A spot in the red area takes a red source.
    const r = autoSource(img, 20 / 120, 0.5, 3 / 120);
    expect(r.sx * 120).toBeLessThan(37);
    // Every source keeps its disc inside the photo.
    const corner = autoSource(img, 0.02, 0.03, 4 / 120);
    expect(corner.sx * 120).toBeGreaterThanOrEqual(4);
    expect(corner.sy * 60).toBeGreaterThanOrEqual(4);
  });

  it('creates a spot at a frame point with the current options', () => {
    const created = createSpot('n', view, { x: 400, y: 200 }, { ...DEFAULT_SPOT_OPTIONS, mode: 'clone', size: 40 }, null);
    expect(created).toMatchObject({ id: 'n', mode: 'clone', x: 0.5, y: 0.5, feather: 50, opacity: 100 });
    expect(created.radius).toBeCloseTo(spotRadius(40), 9);
    expect(created.sx).not.toBe(0.5);
  });

  it('validates stored spots', () => {
    const parsed = parseEditSettings({ spots: [{ id: 'x', mode: 'weird', x: 5, y: -1, sx: 0.2, sy: 'a', radius: 9, feather: 300, opacity: -2 }, 'junk', { id: 'x' }] });
    expect(parsed.spots).toHaveLength(2);
    expect(parsed.spots[0]).toEqual({ id: 'x', mode: 'heal', x: 1, y: 0, sx: 0.2, sy: 0.5, radius: 0.25, feather: 100, opacity: 0 });
    expect(parsed.spots[1]?.id).not.toBe('x');
    expect(parseEditSettings({}).spots).toEqual([]);
  });
});
