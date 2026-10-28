import { computeHistogram } from '../engine/histogram';
import { pipelineParams } from '../engine/pipeline';
import { defaultEditSettings } from '../model/editSettings';
import { selectShowingBefore, useDevelopStore, type LoadedPhoto } from '../state/developStore';
import { useHistogramStore } from '../state/histogramStore';
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
 * After each draw it sets data-render-mode ("proxy" | "full"), data-view
 * ("before" | "after") and data-render-count on the canvas, which tests use
 * to wait for frames.
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
  let loadedPhoto: LoadedPhoto | null = null;
  let disposed = false;

  const drawNow = () => {
    frame = 0;
    if (disposed || !renderer.hasImage) return;
    const state = useDevelopStore.getState();
    const before = selectShowingBefore(state);
    const params = before ? BEFORE_PARAMS : pipelineParams(state.settings);
    renderer.draw(params, state.interacting ? 'proxy' : 'full');
    useHistogramStore.getState().setHistogram(computeHistogram(renderer.readPixels(params, 'histogram').data));
    canvas.dataset.renderMode = state.interacting ? 'proxy' : 'full';
    canvas.dataset.view = before ? 'before' : 'after';
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
      schedule();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  void loadPhoto(useDevelopStore.getState().photo);
  const unsubscribe = useDevelopStore.subscribe((state, prev) => {
    if (state.photo !== prev.photo) void loadPhoto(state.photo);
    else if (
      state.settings !== prev.settings ||
      state.interacting !== prev.interacting ||
      selectShowingBefore(state) !== selectShowingBefore(prev)
    )
      schedule();
  });

  return () => {
    disposed = true;
    unsubscribe();
    if (frame) cancelAnimationFrame(frame);
    renderer.dispose();
    useHistogramStore.getState().setHistogram(null);
  };
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
