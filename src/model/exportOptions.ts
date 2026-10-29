/** Export settings (design/Export.dc.html), pure helpers and built-in presets. */

export type ExportFormat = 'jpeg' | 'png';
export type ExportNaming = 'original' | 'custom' | 'date';
export type MetadataPolicy = 'copyright' | 'allExceptLocation' | 'all' | 'none';

export interface ExportOptions {
  format: ExportFormat;
  /** JPEG quality, 1–100. */
  quality: number;
  /** Scale down so the long edge is at most `longEdge` px (never up). */
  resize: boolean;
  longEdge: number;
  naming: ExportNaming;
  /** Base name for "Custom name with sequence". */
  customName: string;
  metadata: MetadataPolicy;
}

export interface ExportPreset {
  id: string;
  name: string;
  options: ExportOptions;
}

const BASE: ExportOptions = {
  format: 'jpeg',
  quality: 85,
  resize: true,
  longEdge: 2048,
  naming: 'original',
  customName: 'Export',
  metadata: 'copyright',
};

export const BUILTIN_EXPORT_PRESETS: readonly ExportPreset[] = [
  { id: 'web-2048', name: 'For web, 2048 px', options: BASE },
  { id: 'full-jpeg', name: 'Full size JPEG', options: { ...BASE, quality: 92, resize: false, metadata: 'allExceptLocation' } },
  { id: 'social-1080', name: 'Social square, 1080 px', options: { ...BASE, longEdge: 1080 } },
  { id: 'png-lossless', name: 'PNG, lossless', options: { ...BASE, format: 'png', resize: false, metadata: 'none' } },
];

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = BASE;

export const QUALITY_RANGE = { min: 1, max: 100 } as const;
export const LONG_EDGE_RANGE = { min: 16, max: 16384 } as const;

export const NAMING_LABELS: Readonly<Record<ExportNaming, string>> = {
  original: 'Original file name',
  custom: 'Custom name with sequence',
  date: 'Date and sequence',
};

export const METADATA_LABELS: Readonly<Record<MetadataPolicy, string>> = {
  copyright: 'Copyright only',
  allExceptLocation: 'All except location',
  all: 'All metadata',
  none: 'None',
};

/** Clamps and fills an options object read from storage or the form. */
export function normalizeExportOptions(raw: Partial<ExportOptions>): ExportOptions {
  const o = { ...BASE, ...raw };
  const clampInt = (v: number, min: number, max: number, fallback: number) => (Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback);
  return {
    format: o.format === 'png' ? 'png' : 'jpeg',
    quality: clampInt(o.quality, QUALITY_RANGE.min, QUALITY_RANGE.max, BASE.quality),
    resize: Boolean(o.resize),
    longEdge: clampInt(o.longEdge, LONG_EDGE_RANGE.min, LONG_EDGE_RANGE.max, BASE.longEdge),
    naming: o.naming === 'custom' || o.naming === 'date' ? o.naming : 'original',
    customName: typeof o.customName === 'string' ? o.customName : BASE.customName,
    metadata: (['copyright', 'allExceptLocation', 'all', 'none'] as const).includes(o.metadata) ? o.metadata : BASE.metadata,
  };
}

/** Size of the exported image for a rendered output of `width × height`. */
export function exportSize(width: number, height: number, o: Pick<ExportOptions, 'resize' | 'longEdge'>): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!o.resize || long <= o.longEdge) return { width, height };
  const scale = o.longEdge / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const extensionFor = (format: ExportFormat) => (format === 'png' ? 'png' : 'jpg');

/** Characters that are unsafe in file names on common systems. */
function safeName(name: string): string {
  const cleaned = Array.from(name, (ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch))
    .join('')
    .trim();
  return cleaned || 'photo';
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function localDate(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** File name for the `sequence`-th exported photo (1-based). */
export function exportFileName(o: Pick<ExportOptions, 'format' | 'naming' | 'customName'>, photo: { fileName: string; captureDate: number }, sequence = 1): string {
  const ext = extensionFor(o.format);
  switch (o.naming) {
    case 'original':
      return `${safeName(stripExtension(photo.fileName))}.${ext}`;
    case 'custom':
      return `${safeName(o.customName)}-${sequence}.${ext}`;
    case 'date':
      return `${localDate(photo.captureDate)}-${sequence}.${ext}`;
  }
}

/**
 * Makes a batch's file names unique (case-insensitively, as on most file
 * systems) by adding -2, -3, … before the extension of later duplicates.
 */
export function uniqueFileNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
