import { mapRgb, type Rgb } from './color';
import { contrastAmount, contrastCurve } from './contrast';

/**
 * Tone stage: contrast, highlights, shadows, whites, blacks. Works per channel
 * on the perceptual value q = x^(1/2.2) (pivot near middle gray). Each part is
 * monotonic on its own, so their composition can never invert tones.
 */
export const TONE_GAMMA = 2.2;

/** Max shift of the shadows / highlights bumps, in q units. Keeps slopes > 0. */
export const SHADOWS_STRENGTH = 0.14;
export const HIGHLIGHTS_STRENGTH = 0.14;
/** Whites move the white end by up to ±0.25 in q; Blacks the black end by ±0.15. */
export const WHITES_STRENGTH = 0.25;
export const BLACKS_STRENGTH = 0.15;

export interface ToneParams {
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

/** Curve amounts for slider values in [-100, 100]. */
export function toneParams(s: { contrast: number; highlights: number; shadows: number; whites: number; blacks: number }): ToneParams {
  return {
    contrast: contrastAmount(s.contrast),
    highlights: (HIGHLIGHTS_STRENGTH * s.highlights) / 100,
    shadows: (SHADOWS_STRENGTH * s.shadows) / 100,
    whites: (WHITES_STRENGTH * s.whites) / 100,
    blacks: (BLACKS_STRENGTH * s.blacks) / 100,
  };
}

export function isIdentityTone(p: ToneParams): boolean {
  return p.contrast === 0 && p.highlights === 0 && p.shadows === 0 && p.whites === 0 && p.blacks === 0;
}

/** Bump peaking at q = 2/3 with value `amount`: (27/4) q² (1 - q). Identity above 1. */
export function highlightsCurve(q: number, amount: number): number {
  if (amount === 0 || q >= 1) return q;
  return q + amount * 6.75 * q * q * (1 - q);
}

/** Bump peaking at q = 1/3 with value `amount`: (27/4) q (1 - q)². Identity above 1. */
export function shadowsCurve(q: number, amount: number): number {
  if (amount === 0 || q >= 1) return q;
  return q + amount * 6.75 * q * (1 - q) * (1 - q);
}

/** Moves the white end: q + w q³ on [0, 1], continued linearly (slope 1 + 3w). */
export function whitesCurve(q: number, amount: number): number {
  if (amount === 0) return q;
  if (q >= 1) return 1 + amount + (1 + 3 * amount) * (q - 1);
  return q + amount * q * q * q;
}

/** Moves the black end: q + b (1 - q)³ on [0, 1], identity above 1. */
export function blacksCurve(q: number, amount: number): number {
  if (amount === 0 || q >= 1) return q;
  const r = 1 - q;
  return q + amount * r * r * r;
}

export function toneCurve(q: number, p: ToneParams): number {
  let v = contrastCurve(q, p.contrast);
  v = highlightsCurve(v, p.highlights);
  v = shadowsCurve(v, p.shadows);
  v = whitesCurve(v, p.whites);
  v = blacksCurve(v, p.blacks);
  return v;
}

export function applyTone(c: Rgb, p: ToneParams): Rgb {
  if (isIdentityTone(p)) return c;
  return mapRgb(c, (x) => {
    const q = Math.pow(Math.max(x, 0), 1 / TONE_GAMMA);
    return Math.pow(Math.max(toneCurve(q, p), 0), TONE_GAMMA);
  });
}
