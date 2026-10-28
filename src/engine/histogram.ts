export const HISTOGRAM_BINS = 256;

export interface Histogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
}

/** Per-channel 256-bin histogram of an RGBA8 buffer. */
export function computeHistogram(rgba: Uint8Array | Uint8ClampedArray): Histogram {
  const r = new Uint32Array(HISTOGRAM_BINS);
  const g = new Uint32Array(HISTOGRAM_BINS);
  const b = new Uint32Array(HISTOGRAM_BINS);
  const count = (bins: Uint32Array, v: number | undefined) => {
    const bin = v ?? 0;
    bins[bin] = (bins[bin] ?? 0) + 1;
  };
  for (let i = 0; i < rgba.length; i += 4) {
    count(r, rgba[i]);
    count(g, rgba[i + 1]);
    count(b, rgba[i + 2]);
  }
  return { r, g, b };
}

/**
 * Display scale: the tallest bin across all channels, ignoring the end bins
 * (0 and 255) so clipped pixels don't flatten the rest of the graph.
 */
export function histogramPeak(h: Histogram): number {
  let peak = 1;
  for (const bins of [h.r, h.g, h.b]) {
    for (let i = 1; i < HISTOGRAM_BINS - 1; i++) peak = Math.max(peak, bins[i] ?? 0);
  }
  return peak;
}

/** Closed SVG area path for one channel in a width × height box. */
export function histogramPath(bins: Uint32Array, peak: number, width: number, height: number): string {
  const step = width / (HISTOGRAM_BINS - 1);
  const parts = [`M0 ${height}`];
  for (let i = 0; i < HISTOGRAM_BINS; i++) {
    const v = Math.min(1, (bins[i] ?? 0) / peak);
    parts.push(`L${(i * step).toFixed(2)} ${(height - v * height).toFixed(2)}`);
  }
  parts.push(`L${width} ${height}Z`);
  return parts.join(' ');
}
