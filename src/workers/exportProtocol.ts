import type { EditSettings } from '../model/editSettings';
import type { ExportOptions } from '../model/exportOptions';

export interface ExportRequest {
  id: number;
  /** The stored original, untouched. */
  original: Blob;
  settings: EditSettings;
  options: ExportOptions;
  /** The watermark logo file (M23), when the options use one. */
  logo: Blob | null;
}

export type ExportStage = 'decode' | 'render' | 'encode';

export type ExportResponse =
  | { id: number; kind: 'progress'; stage: ExportStage }
  /** `reducedTo`: the photo was larger than the GPU can hold, so it was rendered at this long edge (M33). */
  | { id: number; kind: 'done'; blob: Blob; width: number; height: number; reducedTo?: number }
  | { id: number; kind: 'error'; error: string };

/** Fraction of the work done when each stage starts (for the progress bar). */
export const STAGE_PROGRESS: Readonly<Record<ExportStage, number>> = { decode: 0.1, render: 0.4, encode: 0.75 };
