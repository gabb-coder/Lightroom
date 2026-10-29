import { collectionsOf, sortCollections } from '../../model/collections';
import { addToCollection, removeFromCollection, showCollection } from '../../state/collectionActions';
import { useLibraryStore } from '../../state/libraryStore';
import chips from './KeywordsPanel.module.css';
import styles from './LibraryView.module.css';

const NONE = '';

/**
 * Collections of the selected photos (Library right panel): × takes the
 * selection out of a collection, the menu adds it to one.
 */
export function CollectionsPanel() {
  const ids = useLibraryStore((s) => s.selection.ids);
  const collections = useLibraryStore((s) => s.collections);
  const memberships = collectionsOf(sortCollections(collections), ids);
  const n = ids.length;

  return (
    <section className={chips.panel} aria-label="Collections of the selection">
      <div className={chips.title}>Collections</div>
      {memberships.length > 0 && (
        <ul className={chips.chips} aria-label="Collections holding the selected photos">
          {memberships.map(({ collection, count }) => {
            const partial = count < n;
            return (
              <li key={collection.id} className={chips.chip} data-partial={partial} title={partial ? `${count} of ${n} selected photos` : undefined}>
                <button type="button" className={chips.chipLabel} aria-label={`Show collection ${collection.name}`} onClick={() => showCollection(collection.id)}>
                  {collection.name}
                  {partial && <span className="num"> {count}</span>}
                </button>
                <button
                  type="button"
                  className={chips.remove}
                  aria-label={`Remove from collection ${collection.name}`}
                  onClick={() => void removeFromCollection(collection.id, ids)}
                >
                  <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <select
        className={styles.addToCollection}
        aria-label="Add to collection"
        value={NONE}
        disabled={n === 0 || collections.length === 0}
        onChange={(e) => {
          if (e.target.value) void addToCollection(e.target.value, ids);
        }}
      >
        <option value={NONE}>{collections.length === 0 ? 'No collections yet' : n > 1 ? `Add ${n} photos to…` : 'Add to collection…'}</option>
        {sortCollections(collections).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </section>
  );
}
