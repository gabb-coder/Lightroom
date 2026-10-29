import { useState } from 'react';
import controls from '../../components/controls.module.css';
import { COLOR_LABELS, metadataFilterCount, type FlagFilter, type SortKey } from '../../model/organize';
import { MetadataFilters } from './MetadataFilters';
import { useLibraryStore } from '../../state/libraryStore';
import styles from './LibraryFilterBar.module.css';

const FLAG_FILTERS: readonly { id: FlagFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'picks', label: 'Picks' },
  { id: 'unflagged', label: 'Unflagged' },
  { id: 'rejected', label: 'Rejected' },
];

const RATINGS = [
  { value: 0, label: 'Any' },
  { value: 1, label: '1+ stars' },
  { value: 2, label: '2+ stars' },
  { value: 3, label: '3+ stars' },
  { value: 4, label: '4+ stars' },
  { value: 5, label: '5 stars' },
];

const SORTS: readonly { id: SortKey; label: string }[] = [
  { id: 'captureDate', label: 'Capture time' },
  { id: 'importOrder', label: 'Import order' },
  { id: 'fileName', label: 'File name' },
  { id: 'rating', label: 'Rating' },
];

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#9e9e9e" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

/**
 * Library filter bar (design/Library.dc.html): flag, rating, label, search,
 * sort; "Metadata" opens a second row of metadata filters (M11).
 */
export function LibraryFilterBar() {
  const filter = useLibraryStore((s) => s.filter);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const metadataCount = metadataFilterCount(filter);

  return (
    <>
      <FilterRow metadataOpen={metadataOpen} metadataCount={metadataCount} onToggleMetadata={() => setMetadataOpen(!metadataOpen)} />
      {metadataOpen && <MetadataFilters />}
    </>
  );
}

interface FilterRowProps {
  metadataOpen: boolean;
  metadataCount: number;
  onToggleMetadata: () => void;
}

function FilterRow({ metadataOpen, metadataCount, onToggleMetadata }: FilterRowProps) {
  const filter = useLibraryStore((s) => s.filter);
  const sort = useLibraryStore((s) => s.sort);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const setSort = useLibraryStore((s) => s.setSort);

  return (
    <div className={styles.bar} role="toolbar" aria-label="Filters" data-testid="filter-bar">
      <div className={`${controls.segmented} ${styles.flags}`} role="group" aria-label="Flag filter">
        {FLAG_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`${controls.segment} ${styles.flagButton}`}
            aria-pressed={filter.flag === id}
            onClick={() => setFilter({ flag: id })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.field}>
        <label htmlFor="minrating" className={styles.fieldLabel}>
          Rating
        </label>
        <select id="minrating" className={styles.select} value={filter.minRating} onChange={(e) => setFilter({ minRating: Number(e.target.value) })}>
          {RATINGS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field} role="group" aria-label="Color label filter">
        <span className={styles.fieldLabel}>Label</span>
        {COLOR_LABELS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={styles.labelButton}
            style={{ background: l.color }}
            aria-pressed={filter.label === l.id}
            aria-label={`${l.name} label`}
            onClick={() => setFilter({ label: filter.label === l.id ? null : l.id })}
          />
        ))}
      </div>
      <button
        type="button"
        className={`${controls.iconButton} ${styles.metaToggle}`}
        aria-expanded={metadataOpen}
        aria-controls="metadata-filters"
        aria-label={metadataCount > 0 ? `Metadata filters, ${metadataCount} active` : 'Metadata filters'}
        title="Metadata filters: camera, lens, ISO, date, keyword"
        onClick={onToggleMetadata}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 4h12M4.5 8h7M7 12h2" />
        </svg>
        {metadataCount > 0 && <span className={`num ${styles.metaCount}`}>{metadataCount}</span>}
      </button>
      <div className={styles.spacer} />
      <label className={styles.search}>
        <SearchIcon />
        <span className="visually-hidden">Search photos</span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search"
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
        />
      </label>
      <div className={styles.field}>
        <label htmlFor="sort" className={styles.fieldLabel}>
          Sort
        </label>
        <select id="sort" className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
