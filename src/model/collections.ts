/**
 * Collections (M12): named groups of photos. A collection only lists photo
 * ids; adding, removing or deleting never touches the photos themselves.
 */

export interface CollectionRecord {
  id: string;
  name: string;
  /** Member photo ids, in the order they were added; no duplicates. */
  photoIds: string[];
  createdAt: number;
}

export const MAX_COLLECTION_NAME = 80;

/** Trimmed, single-spaced name without control characters; null if empty. */
export function normalizeCollectionName(raw: string): string | null {
  const name = Array.from(raw)
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_COLLECTION_NAME)
    .trim();
  return name || null;
}

/** `name`, or "name 2", "name 3"… if another collection already uses it (case-insensitive). */
export function uniqueCollectionName(name: string, existing: readonly { id: string; name: string }[], exceptId?: string): string {
  const taken = new Set(existing.filter((c) => c.id !== exceptId).map((c) => c.name.toLowerCase()));
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} ${n}`;
  return candidate;
}

export function withPhotos(photoIds: readonly string[], added: readonly string[]): string[] {
  const set = new Set(photoIds);
  return [...photoIds, ...added.filter((id) => !set.has(id) && set.add(id))];
}

export function withoutPhotos(photoIds: readonly string[], removed: readonly string[]): string[] {
  const drop = new Set(removed);
  return photoIds.filter((id) => !drop.has(id));
}

/** Collections containing any of the given photos, with how many of them each holds. */
export function collectionsOf(collections: readonly CollectionRecord[], ids: readonly string[]): { collection: CollectionRecord; count: number }[] {
  const wanted = new Set(ids);
  return collections
    .map((collection) => ({ collection, count: collection.photoIds.filter((id) => wanted.has(id)).length }))
    .filter((c) => c.count > 0);
}

/** Sorted for the Catalog panel. */
export function sortCollections(collections: readonly CollectionRecord[]): CollectionRecord[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...collections].sort((a, b) => collator.compare(a.name, b.name) || a.createdAt - b.createdAt);
}
