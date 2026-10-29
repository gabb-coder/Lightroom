export interface Size {
  width: number;
  height: number;
}

/** Largest size with the given aspect ratio that fits inside `box` ("contain"). */
export function containSize(box: Size, aspect: number): Size {
  if (box.width <= 0 || box.height <= 0 || aspect <= 0) return { width: 0, height: 0 };
  const width = Math.min(box.width, box.height * aspect);
  return { width: Math.floor(width), height: Math.floor(width / aspect) };
}
