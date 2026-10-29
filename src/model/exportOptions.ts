/** Export settings (design/Export.dc.html), pure helpers and built-in presets. */
import { WATERMARK_POSITIONS, type WatermarkPosition } from '../engine/watermark';

export type ExportFormat = 'jpeg' | 'png';
export type ExportNaming = 'original' | 'custom' | 'date';
export type MetadataPolicy = 'copyright' | 'allExceptLocation' | 'all' | 'none';
/** Where files go (M19): browser downloads one by one, one ZIP download, or a folder the user picks. */
export type ExportDestination = 'downloads' | 'zip' | 'folder';

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
  destination: ExportDestination;
  /** Put the files in a subfolder (inside the ZIP or the picked folder). */
  useSubfolder: boolean;
  subfolder: string;
  /** A logo laid on every exported photo (M23). */
  watermark: WatermarkOptions;
}

export type WatermarkKind = 'logo' | 'text';

export interface WatermarkOptions {
  enabled: boolean;
  /** A stored logo image (M23) or a line of text (M24). */
  kind: WatermarkKind;
  /** Stored logo (db `logos`), or null before one is added. */
  logoId: string | null;
  /** Text watermark, e.g. "© Your Name" (one line). */
  text: string;
  /** Text color, #rrggbb. */
  textColor: string;
  /** A soft shadow behind the text, so it reads on any photo. */
  textShadow: boolean;
  position: WatermarkPosition;
  /** Logo width, % of the photo's width. */
  size: number;
  /** 0–100. */
  opacity: number;
  /** Gap to the edges, % of the photo's shorter side. */
  inset: number;
}

export const WATERMARK_RANGES = { size: { min: 2, max: 100 }, opacity: { min: 5, max: 100 }, inset: { min: 0, max: 25 } } as const;

export const MAX_WATERMARK_TEXT = 200;

export const DEFAULT_WATERMARK: WatermarkOptions = {
  enabled: false,
  kind: 'logo',
  logoId: null,
  text: '',
  textColor: '#ffffff',
  textShadow: true,
  position: 'bottom-right',
  size: 15,
  opacity: 85,
  inset: 3,
};

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
  destination: 'zip',
  useSubfolder: true,
  subfolder: 'Exports',
  watermark: DEFAULT_WATERMARK,
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
    destination: o.destination === 'downloads' || o.destination === 'folder' ? o.destination : 'zip',
    useSubfolder: typeof o.useSubfolder === 'boolean' ? o.useSubfolder : BASE.useSubfolder,
    subfolder: typeof o.subfolder === 'string' ? safeFolderName(o.subfolder) : BASE.subfolder,
    watermark: normalizeWatermark(o.watermark),
  };
}

/** Clamps watermark settings read from storage or the form. */
export function normalizeWatermark(raw: unknown): WatermarkOptions {
  const w = typeof raw === 'object' && raw !== null ? (raw as Partial<WatermarkOptions>) : {};
  const d = DEFAULT_WATERMARK;
  const num = (v: unknown, r: { min: number; max: number }, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(r.max, Math.max(r.min, v))) : fallback;
  return {
    enabled: w.enabled === true,
    kind: w.kind === 'text' ? 'text' : 'logo',
    logoId: typeof w.logoId === 'string' && w.logoId ? w.logoId : null,
    // One line: line breaks become spaces.
    text: typeof w.text === 'string' ? w.text.replace(/[\r\n\t]+/g, ' ').slice(0, MAX_WATERMARK_TEXT) : d.text,
    textColor: typeof w.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(w.textColor) ? w.textColor.toLowerCase() : d.textColor,
    textShadow: typeof w.textShadow === 'boolean' ? w.textShadow : d.textShadow,
    position: WATERMARK_POSITIONS.includes(w.position as WatermarkPosition) ? (w.position as WatermarkPosition) : d.position,
    size: num(w.size, WATERMARK_RANGES.size, d.size),
    opacity: num(w.opacity, WATERMARK_RANGES.opacity, d.opacity),
    inset: num(w.inset, WATERMARK_RANGES.inset, d.inset),
  };
}

/** True when exports get a watermark: switched on, with a logo chosen or some text. */
export function hasWatermark(o: Pick<ExportOptions, 'watermark'>): boolean {
  const w = o.watermark;
  if (!w.enabled) return false;
  return w.kind === 'text' ? w.text.trim() !== '' : w.logoId !== null;
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

/** Settings an export preset leaves alone: where files go (M19) and the logo (M23). */
export const KEPT_KEYS = ['destination', 'useSubfolder', 'subfolder', 'watermark'] as const;

export const DESTINATION_LABELS: Readonly<Record<ExportDestination, string>> = {
  downloads: 'Downloads, one file each',
  zip: 'Downloads, as one ZIP',
  folder: 'A folder you choose…',
};

/**
 * A folder name as typed: no path separators or control characters, at most
 * 60 characters. Spaces stay (the field is edited live); `subfolderOf` trims.
 */
export function safeFolderName(name: string): string {
  return Array.from(name, (ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch))
    .join('')
    .slice(0, 60);
}

/** `options` with the kept settings of `from` (applying a preset keeps where files go and the logo). */
export function withKept(options: ExportOptions, from: Pick<ExportOptions, (typeof KEPT_KEYS)[number]>): ExportOptions {
  return { ...options, destination: from.destination, useSubfolder: from.useSubfolder, subfolder: from.subfolder, watermark: from.watermark };
}

/** Same export look, wherever the files go and whatever the logo. */
export function sameLook(a: ExportOptions, b: ExportOptions): boolean {
  return JSON.stringify(withKept(a, BASE)) === JSON.stringify(withKept(b, BASE));
}

/** The subfolder in use, or '' for none. */
export function subfolderOf(o: Pick<ExportOptions, 'useSubfolder' | 'subfolder'>): string {
  const name = o.useSubfolder ? o.subfolder.trim() : '';
  return /^\.+$/.test(name) ? '' : name; // "." and ".." aren't folders of their own
}

/** Name of the ZIP download for a batch. */
export function zipFileName(o: Pick<ExportOptions, 'useSubfolder' | 'subfolder'>): string {
  return `${subfolderOf(o) || 'Darkroom export'}.zip`;
}

/** Path of a file inside the ZIP. */
export function zipEntryPath(o: Pick<ExportOptions, 'useSubfolder' | 'subfolder'>, fileName: string): string {
  const folder = subfolderOf(o);
  return folder ? `${folder}/${fileName}` : fileName;
}
