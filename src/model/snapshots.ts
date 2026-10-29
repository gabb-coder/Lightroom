/** Snapshot names (M13). */

export const MAX_SNAPSHOT_NAME = 60;

/** Default name for a new snapshot: "Snapshot N", the first N not taken. */
export function nextSnapshotName(existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map((s) => s.name.toLowerCase()));
  let n = existing.length + 1;
  while (taken.has(`snapshot ${n}`)) n++;
  return `Snapshot ${n}`;
}

/** Single-spaced and trimmed, at most MAX_SNAPSHOT_NAME characters; '' if blank. */
export function normalizeSnapshotName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_SNAPSHOT_NAME).trim();
}
