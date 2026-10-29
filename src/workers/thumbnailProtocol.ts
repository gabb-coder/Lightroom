import type { ExifInfo } from '../io/exif';

/** Messages between the main thread and thumbnail.worker.ts. */

export type ThumbnailRequest =
  | { id: number; kind: 'decode'; blob: Blob; longEdge: number }
  | { id: number; kind: 'encode'; width: number; height: number; pixels: ArrayBuffer };

export interface DecodeResult {
  width: number;
  height: number;
  /** EXIF capture time and camera fields (null where missing). */
  exif: ExifInfo;
  thumbnail: Blob;
}

export type ThumbnailResponse =
  | { id: number; ok: true; kind: 'decode'; result: DecodeResult }
  | { id: number; ok: true; kind: 'encode'; blob: Blob }
  | { id: number; ok: false; error: string };

/** Long edge of grid/filmstrip thumbnails (covers 320px cells on 2x screens at 3:2). */
export const THUMBNAIL_LONG_EDGE = 480;
export const THUMBNAIL_QUALITY = 0.85;
