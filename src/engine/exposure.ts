import { mapRgb, type Rgb } from './color';

/** Linear gain for an exposure change in stops (EV). */
export function exposureGain(ev: number): number {
  return Math.pow(2, ev);
}

/** Exposure stage: scales linear light by 2^EV. */
export function applyExposure(c: Rgb, gain: number): Rgb {
  return mapRgb(c, (v) => v * gain);
}
