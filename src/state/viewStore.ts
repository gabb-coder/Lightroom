import { create } from 'zustand';
import type { DisplayOptions } from '../engine/display';
import { FULL_VIEW, toggledZoom, type ViewRect, type ZoomMode } from '../model/zoom';

/** Default split position (Before on the left half). */
export const DEFAULT_SPLIT = 0.5;

/**
 * How the Develop photo is viewed (M16): zoom mode and the visible part;
 * clipping warnings and the split Before/After view (M20).
 * View state only, never edit history.
 */
interface ViewState {
  clipShadows: boolean;
  clipHighlights: boolean;
  /** Split Before/After view on, and where the divider is (0–1 across the photo). */
  split: boolean;
  splitAt: number;
  toggleClip: (which: 'shadows' | 'highlights') => void;
  /** J: both on, or both off if either is on. */
  toggleClipping: () => void;
  setSplit: (on: boolean) => void;
  setSplitAt: (at: number) => void;
  zoom: ZoomMode;
  /** Mode to return to when Z leaves 1:1. */
  previousZoom: ZoomMode;
  /** Visible part of the photo, normalized (written by the canvas as it scrolls). */
  visible: ViewRect;
  /** A requested view center; `panToken` changes with every request so the canvas scrolls once. */
  panTarget: { x: number; y: number };
  panToken: number;
  setZoom: (zoom: ZoomMode, center?: { x: number; y: number }) => void;
  toggleZoom: (center?: { x: number; y: number }) => void;
  panTo: (center: { x: number; y: number }) => void;
  setVisible: (visible: ViewRect) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  clipShadows: false,
  clipHighlights: false,
  split: false,
  splitAt: DEFAULT_SPLIT,
  toggleClip: (which) => set((s) => (which === 'shadows' ? { clipShadows: !s.clipShadows } : { clipHighlights: !s.clipHighlights })),
  toggleClipping: () =>
    set((s) => {
      const on = !(s.clipShadows || s.clipHighlights);
      return { clipShadows: on, clipHighlights: on };
    }),
  setSplit: (split) => set({ split }),
  setSplitAt: (at) => set({ splitAt: Math.min(1, Math.max(0, at)) }),
  zoom: 'fit',
  previousZoom: 'fit',
  visible: FULL_VIEW,
  panTarget: { x: 0.5, y: 0.5 },
  panToken: 0,
  setZoom: (zoom, center) =>
    set((s) => ({
      zoom,
      previousZoom: s.zoom === zoom ? s.previousZoom : s.zoom,
      ...(center ? { panTarget: center, panToken: s.panToken + 1 } : {}),
    })),
  toggleZoom: (center) =>
    set((s) => {
      const zoom = toggledZoom(s.zoom, s.previousZoom);
      return { zoom, previousZoom: s.zoom, ...(center ? { panTarget: center, panToken: s.panToken + 1 } : {}) };
    }),
  panTo: (center) => set((s) => ({ panTarget: center, panToken: s.panToken + 1 })),
  setVisible: (visible) => set((s) => (sameRect(s.visible, visible) ? s : { visible })),
}));

function sameRect(a: ViewRect, b: ViewRect): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;
}

/** What the display pass should do now (the split only when it applies: not while cropping or showing Before). */
export function displayOptions(view: Pick<ViewState, 'clipShadows' | 'clipHighlights' | 'split' | 'splitAt'>, splitApplies: boolean): DisplayOptions {
  return { shadows: view.clipShadows, highlights: view.clipHighlights, split: view.split && splitApplies ? view.splitAt : null };
}
