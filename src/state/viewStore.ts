import { create } from 'zustand';
import { FULL_VIEW, toggledZoom, type ViewRect, type ZoomMode } from '../model/zoom';

/**
 * How the Develop photo is viewed (M16): zoom mode and the visible part.
 * View state only, never edit history.
 */
interface ViewState {
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
