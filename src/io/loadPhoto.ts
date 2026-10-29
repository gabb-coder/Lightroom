/**
 * Photo formats Darkroom imports (M19). JPEG, PNG, WebP and AVIF decode in
 * every current browser; HEIC/HEIF only where the browser can (Safari), so
 * those are accepted and reported clearly if decoding fails.
 */

interface ImportFormat {
  type: string;
  /** Other MIME types browsers report for it. */
  aliases: readonly string[];
  extensions: readonly string[];
  label: string;
}

export const IMPORT_FORMATS: readonly ImportFormat[] = [
  { type: 'image/jpeg', aliases: ['image/pjpeg', 'image/jpg'], extensions: ['jpg', 'jpeg', 'jpe', 'jfif'], label: 'JPEG' },
  { type: 'image/png', aliases: [], extensions: ['png'], label: 'PNG' },
  { type: 'image/webp', aliases: [], extensions: ['webp'], label: 'WebP' },
  { type: 'image/avif', aliases: [], extensions: ['avif'], label: 'AVIF' },
  { type: 'image/heic', aliases: ['image/heif', 'image/heic-sequence', 'image/heif-sequence'], extensions: ['heic', 'heif'], label: 'HEIC' },
];

/** Formats only some browsers can decode. */
export const MAYBE_UNSUPPORTED_TYPES: readonly string[] = ['image/heic'];

/** MIME types (kept for older callers and the file picker). */
export const ACCEPTED_TYPES: readonly string[] = IMPORT_FORMATS.flatMap((f) => [f.type, ...f.aliases]);

/** `accept` attribute for the import file picker: types and extensions (some systems give HEIC no type). */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_TYPES, ...IMPORT_FORMATS.flatMap((f) => f.extensions.map((e) => `.${e}`))].join(',');

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** The canonical MIME type of an importable file (by its type, else its extension), or null. */
export function importTypeOf(file: Pick<File, 'type' | 'name'>): string | null {
  const type = file.type.toLowerCase();
  const byType = IMPORT_FORMATS.find((f) => f.type === type || f.aliases.includes(type));
  if (byType) return byType.type;
  // Files without a (known) type: trust the extension.
  if (type && !type.startsWith('application/octet-stream')) return null;
  const ext = extensionOf(file.name);
  return IMPORT_FORMATS.find((f) => f.extensions.includes(ext))?.type ?? null;
}

export function isAcceptedFile(file: Pick<File, 'type'> & Partial<Pick<File, 'name'>>): boolean {
  return importTypeOf({ type: file.type, name: file.name ?? '' }) !== null;
}

/** "JPEG, PNG, WebP, AVIF and HEIC" for messages. */
export function formatList(): string {
  const labels = IMPORT_FORMATS.map((f) => f.label);
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1] ?? ''}`;
}
