/** Long edge of the interactive preview used while a slider is dragged. */
export const PROXY_LONG_EDGE = 1500;

export interface Size {
  width: number;
  height: number;
}

/** Scales a size down (never up) so its long edge is at most `longEdge`. */
export function fitLongEdge({ width, height }: Size, longEdge: number): Size {
  const scale = longEdge / Math.max(width, height);
  if (scale >= 1) return { width, height };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Resizes a bitmap with the browser's high-quality scaler (not an edit). */
export function resizeBitmap(bitmap: ImageBitmap, size: Size): Promise<ImageBitmap> {
  return createImageBitmap(bitmap, {
    resizeWidth: size.width,
    resizeHeight: size.height,
    resizeQuality: 'high',
    premultiplyAlpha: 'none',
  });
}
