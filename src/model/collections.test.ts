import { describe, expect, it } from 'vitest';
import { collectionsOf, normalizeCollectionName, sortCollections, uniqueCollectionName, withoutPhotos, withPhotos, type CollectionRecord } from './collections';

const c = (id: string, name: string, photoIds: string[] = [], createdAt = 0): CollectionRecord => ({ id, name, photoIds, createdAt });

describe('collections', () => {
  it('normalizes names', () => {
    expect(normalizeCollectionName('  Summer   2023 ')).toBe('Summer 2023');
    expect(normalizeCollectionName(' \t')).toBeNull();
  });

  it('makes names unique, ignoring the collection being renamed', () => {
    const existing = [c('1', 'Trip'), c('2', 'trip 2')];
    expect(uniqueCollectionName('Trip', existing)).toBe('Trip 3');
    expect(uniqueCollectionName('TRIP', existing, '1')).toBe('TRIP');
    expect(uniqueCollectionName('Beach', existing)).toBe('Beach');
  });

  it('adds photos once, keeps order, and removes only the given ones', () => {
    expect(withPhotos(['a', 'b'], ['b', 'c', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
    expect(withoutPhotos(['a', 'b', 'c'], ['b', 'x'])).toEqual(['a', 'c']);
  });

  it('lists the collections that hold any of the selected photos', () => {
    const all = [c('1', 'A', ['p1', 'p2']), c('2', 'B', ['p3']), c('3', 'C', ['p2', 'p3'])];
    expect(collectionsOf(all, ['p2', 'p3']).map((x) => [x.collection.name, x.count])).toEqual([
      ['A', 1],
      ['B', 1],
      ['C', 2],
    ]);
  });

  it('sorts by name (numeric-aware)', () => {
    expect(sortCollections([c('1', 'Trip 10'), c('2', 'trip 2'), c('3', 'Album')]).map((x) => x.name)).toEqual(['Album', 'trip 2', 'Trip 10']);
  });
});
