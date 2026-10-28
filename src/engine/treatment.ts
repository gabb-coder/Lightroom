import { luminance, type Rgb } from './color';

/** Treatment stage: B&W replaces each pixel with its linear luminance. */
export function applyTreatment(c: Rgb, bw: boolean): Rgb {
  if (!bw) return c;
  const y = luminance(c);
  return [y, y, y];
}
