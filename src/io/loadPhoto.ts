import type { LoadedPhoto } from '../state/developStore';

export const ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

export class UnsupportedFileError extends Error {
  constructor(fileName: string) {
    super(`${fileName} is not a JPEG or PNG file.`);
    this.name = 'UnsupportedFileError';
  }
}

export function isAcceptedFile(file: Pick<File, 'type'>): boolean {
  return ACCEPTED_TYPES.includes(file.type);
}

/**
 * Decodes a JPEG/PNG into an ImageBitmap. EXIF orientation is applied and
 * alpha is left unpremultiplied so color values are untouched.
 */
export async function loadPhotoFile(file: File): Promise<LoadedPhoto> {
  if (!isAcceptedFile(file)) throw new UnsupportedFileError(file.name);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
  return { name: file.name, width: bitmap.width, height: bitmap.height, bitmap };
}
