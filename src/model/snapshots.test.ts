import { describe, expect, it } from 'vitest';
import { MAX_SNAPSHOT_NAME, nextSnapshotName, normalizeSnapshotName } from './snapshots';

describe('snapshot names', () => {
  it('suggests the next free "Snapshot N"', () => {
    expect(nextSnapshotName([])).toBe('Snapshot 1');
    expect(nextSnapshotName([{ name: 'Before' }, { name: 'snapshot 2' }])).toBe('Snapshot 3');
  });

  it('normalizes typed names', () => {
    expect(normalizeSnapshotName('  Warm   version ')).toBe('Warm version');
    expect(normalizeSnapshotName('   ')).toBe('');
    expect(normalizeSnapshotName('x'.repeat(99))).toHaveLength(MAX_SNAPSHOT_NAME);
  });
});
