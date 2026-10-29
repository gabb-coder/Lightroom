import type { DisplayOptions } from '../engine/display';
import { computeHistogram } from '../engine/histogram';
import { maskShape } from '../engine/masks';
import { pipelineParams, type PipelineParams } from '../engine/pipeline';
import { jsonEqual } from '../model/compare';
import { displayGeometry } from '../model/crop';
import { defaultEditSettings } from '../model/editSettings';
import { selectShowingBefore, useDevelopStore, type LoadedPhoto } from '../state/developStore';
import { useHistogramStore } from '../state/histogramStore';
import { usePreviewStore } from '../state/previewStore';
import { displayOptions, useViewStore } from '../state/viewStore';
import { Renderer } from './Renderer';
import { fitLongEdge, HISTOGRAM_LONG_EDGE, PROXY_LONG_EDGE, resizeBitmap } from './proxy';

/** The original look: identity settings ("Before"). */
const BEFORE_PARAMS = pipelineParams(defaultEditSettings());

/**
 * The single module that connects the edit store to WebGL. React hands it a
 * canvas; it subscribes to the store and coalesces changes into at most one
 * render per animation frame. Proxy while dragging, full resolution otherwise.
 * After each render it reads back a small rendered copy for the histogram.
 *
 * Clipping warnings and the split view (viewStore) go to the renderer's
 * display pass; they never reach the histogram or the preview.
 *
 * After each draw it sets data-render-mode ("proxy" | "full"), data-view
 * ("before" | "after" | "split"), data-clipping and data-render-count on the
 * canvas, which tests use to wait for frames.
 */
export function attachRenderer(canvas: HTMLCanvasElement, onError: (message: string) => void): () => void {
  let renderer: Renderer;
  try {
    renderer = Renderer.create(canvas);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return () => undefined;
  }

  let frame = 0;
  let renderCount = 0;
  /** What is on screen now, to skip redraws that would produce the same image. */
  let shown: { params: PipelineParams; kind: string; display: DisplayOptions } | null = null;
  let loadedPhoto: LoadedPhoto | null = null;
  let disposed = false;

  const drawNow = () => {
    frame = 0;
    if (disposed || !renderer.hasImage) return;
    const state = useDevelopStore.getState();
    const before = selectShowingBefore(state);
    const geometry = displayGeometry(state.settings.geometry, { before, cropping: state.cropping });
    let params = before ? BEFORE_PARAMS : { ...pipelineParams(state.settings), geometry };
    const kind = state.interacting ? 'proxy' : 'full';
    const view = useViewStore.getState();
    const display = displayOptions(view, !before && !state.cropping, overlayShape(state, view.showMaskOverlay && !before));
    // E.g. moving the crop box while cropping changes settings, not pixels.
    const sameParams = shown !== null && shown.kind === kind && jsonEqual(shown.params, params);
    if (shown && sameParams && jsonEqual(shown.display, display)) return;
    // Same object when unchanged: the renderer then reuses its After/Before images (split moves, clipping toggles).
    if (shown && sameParams) params = shown.params;
    shown = { params, kind, display };
    renderer.draw(params, kind, { options: display, before: BEFORE_PARAMS });
    const small = renderer.readPixels(params, 'histogram');
    useHistogramStore.getState().setHistogram(computeHistogram(small.data));
    if (!before && !state.interacting && !state.cropping && state.photo) {
      usePreviewStore.getState().setPreview({ photoId: state.photo.id, settings: state.settings, image: small });
    }
    canvas.dataset.renderMode = kind;
    canvas.dataset.cropping = String(state.cropping);
    canvas.dataset.view = before ? 'before' : display.split !== null ? 'split' : 'after';
    canvas.dataset.clipping = [display.shadows && 'shadows', display.highlights && 'highlights'].filter(Boolean).join(' ') || 'off';
    canvas.dataset.renderCount = String(++renderCount);
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(drawNow);
  };

  const loadPhoto = async (photo: LoadedPhoto | null) => {
    loadedPhoto = photo;
    if (!photo) {
      renderer.clearImage();
      useHistogramStore.getState().setHistogram(null);
      return;
    }
    try {
      const textures = await prepareTextures(photo.bitmap, renderer.maxTextureSize);
      if (disposed || loadedPhoto !== photo) return;
      renderer.setImage(textures);
      shown = null;
      schedule();
    } catch (error) {
      // A newer photo replaced this one mid-load (its bitmap may be closed): not an error.
      if (disposed || loadedPhoto !== photo) return;
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  void loadPhoto(useDevelopStore.getState().photo);
  const unsubscribe = useDevelopStore.subscribe((state, prev) => {
    if (state.photo !== prev.photo) void loadPhoto(state.photo);
    else if (
      state.settings !== prev.settings ||
      state.interacting !== prev.interacting ||
      state.cropping !== prev.cropping ||
      state.selectedMaskId !== prev.selectedMaskId ||
      state.masksOpen !== prev.masksOpen ||
      selectShowingBefore(state) !== selectShowingBefore(prev)
    )
      schedule();
  });

  const unsubscribeView = useViewStore.subscribe((view, prev) => {
    if (
      view.clipShadows !== prev.clipShadows ||
      view.clipHighlights !== prev.clipHighlights ||
      view.split !== prev.split ||
      view.splitAt !== prev.splitAt ||
      view.showMaskOverlay !== prev.showMaskOverlay
    )
      schedule();
  });

  return () => {
    disposed = true;
    unsubscribe();
    unsubscribeView();
    if (frame) cancelAnimationFrame(frame);
    renderer.dispose();
    useHistogramStore.getState().setHistogram(null);
  };
}

/** The selected mask's shape for the overlay (Masks panel open, overlay on, not cropping), or null. */
function overlayShape(state: ReturnType<typeof useDevelopStore.getState>, show: boolean) {
  if (!show || !state.masksOpen || state.cropping) return null;
  const mask = state.settings.masks.find((m) => m.id === state.selectedMaskId);
  return mask ? maskShape(mask) : null;
}

/** Downscaled copy of `bitmap` with the given long edge, or null if it is already that small. */
async function downscaled(bitmap: ImageBitmap, longEdge: number): Promise<ImageBitmap | null> {
  const size = fitLongEdge(bitmap, longEdge);
  return size.width === bitmap.width ? null : resizeBitmap(bitmap, size);
}

/** Full-res texture (downscaled only if the GPU can't hold it), the drag proxy and the histogram copy. */
async function prepareTextures(bitmap: ImageBitmap, maxTextureSize: number) {
  const full = (await downscaled(bitmap, maxTextureSize)) ?? bitmap;
  const [proxy, histogram] = await Promise.all([downscaled(bitmap, PROXY_LONG_EDGE), downscaled(bitmap, HISTOGRAM_LONG_EDGE)]);
  return { full, proxy, histogram };
}
