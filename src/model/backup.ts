import type { ColorLabel, Flag, PhotoExif, PhotoRecord, SnapshotRecord } from '../db/db';
import { normalizeCollectionName, withPhotos, type CollectionRecord } from './collections';
import { normalizeExportOptions, type ExportPreset } from './exportOptions';
import { parseStoredHistory, type History } from './history';
import { normalizeKeyword } from './keywords';
import { presetSettingsOf, type Preset } from './presets';
import { normalizeSnapshotName } from './snapshots';
import { parseEditSettings } from './validate';

/**
 * Catalog backups (M17): one ZIP with a JSON manifest plus the stored files.
 * The manifest is untrusted input on restore, so everything goes through the
 * same validators as the database (and invalid rows are dropped).
 */

export const BACKUP_FORMAT = 'darkroom-backup';
export const BACKUP_VERSION = 1;
export const MANIFEST_NAME = 'darkroom-backup.json';

export interface BackupPhoto {
  photo: PhotoRecord;
  /** Null when the photo was never edited (no stored history). */
  history: History | null;
  /** Paths inside the archive. Virtual copies have no original of their own. */
  original: string | null;
  thumbnail: string | null;
  editedThumbnail: string | null;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  photos: BackupPhoto[];
  collections: CollectionRecord[];
  snapshots: SnapshotRecord[];
  presets: Preset[];
  exportPresets: ExportPreset[];
  /** Watermark logos (M23); older backups have none. */
  logos: BackupLogo[];
}

export interface BackupLogo {
  id: string;
  name: string;
  /** Path inside the archive. */
  file: string;
  type: string;
  width: number;
  height: number;
  addedAt: number;
}

const LOGO_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** File extension for a stored original. */
export function extensionForType(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/avif') return 'avif';
  if (type === 'image/heic' || type === 'image/heif') return 'heic';
  return 'jpg';
}

function exif(raw: unknown): PhotoExif | undefined {
  if (!isObject(raw)) return undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const t = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 80) : null);
  return { camera: t(raw.camera), lens: t(raw.lens), iso: n(raw.iso), exposureTime: n(raw.exposureTime), fNumber: n(raw.fNumber), focalLength: n(raw.focalLength) };
}

const FLAGS: readonly Flag[] = ['pick', 'reject'];
const LABELS: readonly ColorLabel[] = ['red', 'yellow', 'green', 'blue', 'purple'];

/** A catalog row from untrusted JSON, or null if it lacks what's needed to show it. */
export function parseBackupPhoto(raw: unknown): PhotoRecord | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const fileName = str(raw.fileName);
  const width = num(raw.width, 0);
  const height = num(raw.height, 0);
  if (!id || !fileName || width <= 0 || height <= 0) return null;
  const keywords = list(raw.keywords)
    .map((k) => (typeof k === 'string' ? normalizeKeyword(k) : null))
    .filter((k): k is string => k !== null);
  const photo: PhotoRecord = {
    id,
    fileName,
    fileType: str(raw.fileType) ?? 'image/jpeg',
    size: num(raw.size, 0),
    width,
    height,
    captureDate: num(raw.captureDate, 0),
    captureDateFromExif: raw.captureDateFromExif === true,
    rating: Math.min(5, Math.max(0, Math.round(num(raw.rating, 0)))),
    flag: FLAGS.includes(raw.flag as Flag) ? (raw.flag as Flag) : null,
    colorLabel: LABELS.includes(raw.colorLabel as ColorLabel) ? (raw.colorLabel as ColorLabel) : null,
    importedAt: num(raw.importedAt, 0),
    importIndex: num(raw.importIndex, 0),
    batchId: str(raw.batchId) ?? 'restored',
    edited: raw.edited === true,
    thumbVersion: 0,
  };
  // Optional fields are left out (not set to undefined), like rows written by import.
  const photoExif = exif(raw.exif);
  if (photoExif) photo.exif = photoExif;
  if (keywords.length) photo.keywords = keywords;
  else if (Array.isArray(raw.keywords)) photo.keywords = [];
  const masterId = str(raw.masterId);
  if (masterId) {
    photo.masterId = masterId;
    photo.copyName = str(raw.copyName) ?? 'Copy';
  }
  return photo;
}

function parseEntry(raw: unknown): BackupPhoto | null {
  if (!isObject(raw)) return null;
  const photo = parseBackupPhoto(raw.photo);
  if (!photo) return null;
  const original = str(raw.original);
  // A master needs its original; a virtual copy uses its master's.
  if (!photo.masterId && !original) return null;
  return { photo, history: raw.history == null ? null : parseStoredHistory(raw.history), original: photo.masterId ? null : original, thumbnail: str(raw.thumbnail), editedThumbnail: str(raw.editedThumbnail) };
}

/** Validates a manifest read from a backup. Throws BackupFormatError if it isn't one. */
export function parseManifest(raw: unknown): BackupManifest {
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) throw new BackupFormatError('This file is not a Darkroom backup.');
  const version = num(raw.version, 0);
  if (version < 1 || version > BACKUP_VERSION) throw new BackupFormatError('This backup was made by a newer version of Darkroom.');
  const photos = list(raw.photos)
    .map(parseEntry)
    .filter((p): p is BackupPhoto => p !== null);
  const ids = new Set(photos.map((p) => p.photo.id));
  // Copies whose master isn't in the backup can still be restored if the master is already in the catalog.
  const collections = list(raw.collections).flatMap((c): CollectionRecord[] => {
    if (!isObject(c)) return [];
    const id = str(c.id);
    const name = typeof c.name === 'string' ? normalizeCollectionName(c.name) : null;
    if (!id || !name) return [];
    const photoIds = withPhotos([], list(c.photoIds).filter((p): p is string => typeof p === 'string'));
    return [{ id, name, photoIds, createdAt: num(c.createdAt, 0) }];
  });
  const snapshots = list(raw.snapshots).flatMap((s): SnapshotRecord[] => {
    if (!isObject(s)) return [];
    const id = str(s.id);
    const photoId = str(s.photoId);
    const name = typeof s.name === 'string' ? normalizeSnapshotName(s.name) : '';
    if (!id || !photoId || !name || !ids.has(photoId)) return [];
    return [{ id, photoId, name, settings: parseEditSettings(s.settings), createdAt: num(s.createdAt, 0) }];
  });
  const presets = list(raw.presets).flatMap((p): Preset[] => {
    if (!isObject(p)) return [];
    const id = str(p.id);
    const name = str(p.name);
    if (!id || !name) return [];
    return [{ id, name: name.slice(0, 60), group: 'user', settings: presetSettingsOf(parseEditSettings(p.settings)) }];
  });
  const exportPresets = list(raw.exportPresets).flatMap((p): ExportPreset[] => {
    if (!isObject(p)) return [];
    const id = str(p.id);
    const name = str(p.name);
    if (!id || !name) return [];
    return [{ id, name, options: normalizeExportOptions(isObject(p.options) ? p.options : {}) }];
  });
  const logos = list(raw.logos).flatMap((l): BackupLogo[] => {
    if (!isObject(l)) return [];
    const id = str(l.id);
    const file = str(l.file);
    const type = str(l.type);
    const width = num(l.width, 0);
    const height = num(l.height, 0);
    if (!id || !file || !type || !LOGO_FILE_TYPES.includes(type) || width <= 0 || height <= 0) return [];
    return [{ id, name: (str(l.name) ?? 'Logo').slice(0, 120), file, type, width, height, addedAt: num(l.addedAt, 0) }];
  });
  return { format: BACKUP_FORMAT, version, createdAt: num(raw.createdAt, 0), photos, collections, snapshots, presets, exportPresets, logos };
}

/**
 * Sort positions for restored photos: appended after the catalog's last
 * import, in their original order (virtual copies keep their fractional
 * place right after their master). An empty catalog keeps them unchanged.
 */
export function restoredImportIndex(oldIndex: number, restoredMin: number, catalogNext: number): number {
  if (catalogNext === 0) return oldIndex;
  return oldIndex - Math.floor(restoredMin) + catalogNext;
}
