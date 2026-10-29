import Dexie, { type Table } from 'dexie';
import type { History } from '../model/history';
import type { EditSettings } from '../model/editSettings';
import { migrateHistorySharpenDefault, migrateSharpenDefault } from '../model/migrate';
import type { ExportPreset } from '../model/exportOptions';
import type { Preset } from '../model/presets';
import type { CollectionRecord } from '../model/collections';

export type Flag = 'pick' | 'reject';

/** Camera fields from the original's EXIF (io/exif.ts); null when the file doesn't say. */
export interface PhotoExif {
  camera: string | null;
  lens: string | null;
  iso: number | null;
  /** Seconds. */
  exposureTime: number | null;
  fNumber: number | null;
  /** Millimetres. */
  focalLength: number | null;
}
export type ColorLabel = 'red' | 'yellow' | 'green' | 'blue' | 'purple';

/** Catalog row: small, so the whole table can be loaded and filtered in memory. */
export interface PhotoRecord {
  id: string;
  fileName: string;
  fileType: string;
  /** Original file size in bytes. */
  size: number;
  /** Pixel size after EXIF orientation. */
  width: number;
  height: number;
  /** EXIF capture time (local, epoch ms), or the file's last-modified time. */
  captureDate: number;
  captureDateFromExif: boolean;
  /** Undefined only for photos imported before EXIF fields were read (state/exifBackfill.ts fills them). */
  exif?: PhotoExif;
  /** Keywords (model/keywords.ts normalizes them); undefined = none. */
  keywords?: string[];
  /** Virtual copy (M13): the photo whose stored original this one shares. */
  masterId?: string;
  /** Virtual copy label, e.g. "Copy 1". */
  copyName?: string;
  rating: number;
  flag: Flag | null;
  colorLabel: ColorLabel | null;
  importedAt: number;
  /** Global import sequence; stable sort order. */
  importIndex: number;
  /** Photos imported together share a batch ("Previous import"). */
  batchId: string;
  /** Any adjustment differs from defaults (the "edited" badge). */
  edited: boolean;
  /** Bumped when the thumbnail changes, so cached object URLs refresh. */
  thumbVersion: number;
}

/** The original file, stored once and never modified. */
export interface OriginalRecord {
  photoId: string;
  blob: Blob;
}

export interface ThumbnailRecord {
  photoId: string;
  /** From the original, made at import. */
  base: Blob;
  /** Rendered with the photo's current edits, or null if unedited. */
  edited: Blob | null;
}

/** A named, saved state of one photo's settings (M13). */
export interface SnapshotRecord {
  id: string;
  photoId: string;
  name: string;
  settings: EditSettings;
  createdAt: number;
}

/** Current settings and full undo history of one photo. */
export interface EditRecord {
  photoId: string;
  history: History;
  updatedAt: number;
}

/** A logo for export watermarks (M23). The file is kept as added. */
export interface LogoRecord {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  addedAt: number;
}

export const DB_NAME = 'photo-editor';

export class CatalogDb extends Dexie {
  photos!: Table<PhotoRecord, string>;
  originals!: Table<OriginalRecord, string>;
  thumbnails!: Table<ThumbnailRecord, string>;
  edits!: Table<EditRecord, string>;
  presets!: Table<Preset, string>;
  exportPresets!: Table<ExportPreset, string>;
  collections!: Table<CollectionRecord, string>;
  snapshots!: Table<SnapshotRecord, string>;
  logos!: Table<LogoRecord, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      photos: 'id, importIndex, captureDate, fileName, batchId',
      originals: 'photoId',
      thumbnails: 'photoId',
      edits: 'photoId',
      presets: 'id',
    });
    // v2 (M7): user export presets.
    this.version(2).stores({ exportPresets: 'id' });
    // v3 (M9): the sharpening default changed from 40 to 0 (model/migrate.ts).
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table<EditRecord>('edits').toCollection().modify((r) => {
          r.history = migrateHistorySharpenDefault(r.history);
        });
        await tx.table<Preset>('presets').toCollection().modify((p) => {
          p.settings = migrateSharpenDefault(p.settings);
        });
      });
    // v4 (M12): collections (lists of photo ids).
    this.version(4).stores({ collections: 'id' });
    // v5 (M13): snapshots per photo.
    this.version(5).stores({ snapshots: 'id, photoId' });
    // v6 (M23): logos for export watermarks.
    this.version(6).stores({ logos: 'id' });
  }
}

/** The app's single catalog database. All data stays on this device. */
export const db = new CatalogDb();

/** The stored original of a photo; a virtual copy reads its master's. */
export async function getOriginal(photoId: string): Promise<OriginalRecord | undefined> {
  const photo = await db.photos.get(photoId);
  return db.originals.get(photo?.masterId ?? photoId);
}
