import { create } from 'zustand';
import type { Histogram } from '../engine/histogram';
import type { RgbaImage } from '../render/gl';

interface HistogramState {
  /** Histogram of the latest rendered image (edited, or original while showing Before). */
  histogram: Histogram | null;
  /** The small rendered copy it came from (what is on screen, 512 px), for the RGB readout (M32). */
  image: RgbaImage | null;
  setHistogram: (histogram: Histogram | null, image?: RgbaImage | null) => void;
}

/** Written only by the renderer controller after each render. */
export const useHistogramStore = create<HistogramState>()((set) => ({
  histogram: null,
  image: null,
  setHistogram: (histogram, image = null) => set({ histogram, image }),
}));
