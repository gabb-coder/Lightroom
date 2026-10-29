import { create } from 'zustand';
import type { Histogram } from '../engine/histogram';

interface HistogramState {
  /** Histogram of the latest rendered image (edited, or original while showing Before). */
  histogram: Histogram | null;
  setHistogram: (histogram: Histogram | null) => void;
}

/** Written only by the renderer controller after each render. */
export const useHistogramStore = create<HistogramState>()((set) => ({
  histogram: null,
  setHistogram: (histogram) => set({ histogram }),
}));
