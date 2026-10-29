import type { BasicSettings, EditSettings, Geometry } from '../../src/model/editSettings';

export interface GpuCheckResult {
  width: number;
  height: number;
  /** Largest per-channel difference between GPU and CPU, in 8-bit steps. */
  maxDiff: number;
  /** Where the largest difference occurred. */
  worst: { pixel: number; channel: number; gpu: number; cpu: number };
  /** Largest per-channel difference between the GPU output and the source (if same size). */
  maxChangeFromSource: number;
  /** True if GPU and CPU outputs had the same dimensions. */
  sameSize: boolean;
}

export interface GpuHarness {
  runGpuCheck: (basic: Partial<BasicSettings>, geometry?: Partial<Geometry>, extra?: Partial<Pick<EditSettings, 'curve' | 'hsl'>>) => GpuCheckResult;
}
