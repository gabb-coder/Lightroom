import Dexie, { type Table } from 'dexie';
import type { History } from '../model/history';
import { migrateHistorySharpenDefault, migrateSharpenDefault } from '../model/migrate';
import type { ExportPreset } from '../model/exportOptions';
import type { Preset } from '../model/presets';

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

/** Current settings and full undo history of one photo. */
export interface EditRecord {
  photoId: string;
  history: History;
  updatedAt: number;
}

export const DB_NAME = 'photo-editor';

export class CatalogDb extends Dexie {
  photos!: Table<PhotoRecord, string>;
  originals!: Table<OriginalRecord, string>;
  thumbnails!: Table<ThumbnailRecord, string>;
  edits!: Table<EditRecord, string>;
  presets!: Table<Preset, string>;
  exportPresets!: Table<ExportPreset, string>;

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
  }
}

/** The app's single catalog database. All data stays on this device. */
export const db = new CatalogDb();
