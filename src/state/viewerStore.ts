import { create } from 'zustand';

/**
 * Full screen, slideshow and compare (M31). The viewers show photos with
 * their edits, rendered by the export worker (state/previewCache.ts).
 */
export type ViewerMode = 'fullscreen' | 'slideshow';

export const SLIDE_SECONDS = [2, 4, 8] as const;

interface ViewerState {
  /** Full screen or slideshow over `ids` (null = closed). */
  mode: ViewerMode | null;
  ids: string[];
  index: number;
  playing: boolean;
  seconds: number;
  /** Compare view: the photo to beat (select) and the one it is compared with (candidate). */
  compare: { select: string; candidate: string } | null;
  open: (mode: ViewerMode, ids: string[], index: number) => void;
  close: () => void;
  /** Moves by `delta` photos, wrapping around. */
  step: (delta: number) => void;
  setPlaying: (playing: boolean) => void;
  setSeconds: (seconds: number) => void;
  openCompare: (select: string, candidate: string) => void;
  setCandidate: (id: string) => void;
  swap: () => void;
  closeCompare: () => void;
}

export const useViewerStore = create<ViewerState>()((set) => ({
  mode: null,
  ids: [],
  index: 0,
  playing: false,
  seconds: 4,
  compare: null,
  open: (mode, ids, index) => set(ids.length === 0 ? {} : { mode, ids, index: Math.min(ids.length - 1, Math.max(0, index)), playing: mode === 'slideshow', compare: null }),
  close: () => set({ mode: null, playing: false }),
  step: (delta) => set((s) => (s.ids.length === 0 ? s : { index: (((s.index + delta) % s.ids.length) + s.ids.length) % s.ids.length })),
  setPlaying: (playing) => set({ playing }),
  setSeconds: (seconds) => set({ seconds }),
  openCompare: (select, candidate) => set({ compare: { select, candidate }, mode: null }),
  setCandidate: (candidate) => set((s) => (s.compare ? { compare: { ...s.compare, candidate } } : s)),
  swap: () => set((s) => (s.compare ? { compare: { select: s.compare.candidate, candidate: s.compare.select } } : s)),
  closeCompare: () => set({ compare: null }),
}));
