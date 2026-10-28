import { pipelineParams } from '../engine/pipeline';
import { useDevelopStore, type LoadedPhoto } from '../state/developStore';
import { Renderer } from './Renderer';
import { fitLongEdge, PROXY_LONG_EDGE, resizeBitmap } from './proxy';

/**
 * The single module that connects the edit store to WebGL. React hands it a
 * canvas; it subscribes to the store and coalesces changes into at most one
 * render per animation frame. Proxy while dragging, full resolution otherwise.
 *
 * After each draw it sets data-render-mode ("proxy" | "full") and
 * data-render-count on the canvas, which tests use to wait for frames.
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
    const { settings, interacting } = useDevelopStore.getState();
    renderer.draw(pipelineParams(settings), interacting);
    canvas.dataset.renderMode = interacting ? 'proxy' : 'full';
    canvas.dataset.renderCount = String(++renderCount);
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(drawNow);
  };

  const loadPhoto = async (photo: LoadedPhoto | null) => {
    loadedPhoto = photo;
    if (!photo) {
      renderer.clearImage();
      return;
    }
    try {
      const textures = await prepareTextures(photo.bitmap, renderer.maxTextureSize);
      if (disposed || loadedPhoto !== photo) return;
      renderer.setImage(textures.full, textures.proxy);
      schedule();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  void loadPhoto(useDevelopStore.getState().photo);
  const unsubscribe = useDevelopStore.subscribe((state, prev) => {
    if (state.photo !== prev.photo) void loadPhoto(state.photo);
    else if (state.settings !== prev.settings || state.interacting !== prev.interacting) schedule();
  });

  return () => {
    disposed = true;
    unsubscribe();
    if (frame) cancelAnimationFrame(frame);
    renderer.dispose();
  };
}

/** Full-res texture (downscaled only if the GPU can't hold it) plus the drag proxy. */
async function prepareTextures(bitmap: ImageBitmap, maxTextureSize: number) {
  const size = { width: bitmap.width, height: bitmap.height };
  const fullSize = fitLongEdge(size, maxTextureSize);
  const full = fullSize.width === size.width ? bitmap : await resizeBitmap(bitmap, fullSize);
  const proxySize = fitLongEdge(size, PROXY_LONG_EDGE);
  const proxy = proxySize.width === size.width ? null : await resizeBitmap(bitmap, proxySize);
  return { full, proxy };
}
