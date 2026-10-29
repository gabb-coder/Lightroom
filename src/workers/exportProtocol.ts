import type { EditSettings } from '../model/editSettings';
import type { ExportOptions } from '../model/exportOptions';

export interface ExportRequest {
  id: number;
  /** The stored original, untouched. */
  original: Blob;
  settings: EditSettings;
  options: ExportOptions;
}

export type ExportStage = 'decode' | 'render' | 'encode';

export type ExportResponse =
  | { id: number; kind: 'progress'; stage: ExportStage }
  | { id: number; kind: 'done'; blob: Blob; width: number; height: number }
  | { id: number; kind: 'error'; error: string };

/** Fraction of the work done when each stage starts (for the progress bar). */
export const STAGE_PROGRESS: Readonly<Record<ExportStage, number>> = { decode: 0.1, render: 0.4, encode: 0.75 };
