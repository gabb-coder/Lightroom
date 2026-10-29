import controls from '../../components/controls.module.css';
import { allKeywords, distinctValues, EMPTY_METADATA_FILTER } from '../../model/organize';
import { useLibraryStore } from '../../state/libraryStore';
import styles from './LibraryFilterBar.module.css';

const ANY = '';

function ValueSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string | null; options: readonly string[]; onChange: (v: string | null) => void }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <select id={id} className={`${styles.select} ${styles.metaSelect}`} value={value ?? ANY} onChange={(e) => onChange(e.target.value === ANY ? null : e.target.value)}>
        <option value={ANY}>Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

const toNumber = (text: string): number | null => {
  const n = Number(text);
  return text.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n);
};

/**
 * Second filter row (M11): camera, lens, ISO and capture date ranges and
 * keyword. Menus list only values present in the catalog.
 */
export function MetadataFilters() {
  const photos = useLibraryStore((s) => s.photos);
  const filter = useLibraryStore((s) => s.filter);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const cameras = distinctValues(photos, (p) => p.exif?.camera);
  const lenses = distinctValues(photos, (p) => p.exif?.lens);
  const keywords = allKeywords(photos);

  return (
    <div id="metadata-filters" className={`${styles.bar} ${styles.metaBar}`} role="group" aria-label="Metadata filters" data-testid="metadata-filters">
      <ValueSelect id="mf-camera" label="Camera" value={filter.camera} options={cameras} onChange={(camera) => setFilter({ camera })} />
      <ValueSelect id="mf-lens" label="Lens" value={filter.lens} options={lenses} onChange={(lens) => setFilter({ lens })} />
      <div className={styles.field} role="group" aria-label="ISO range">
        <span className={styles.fieldLabel}>ISO</span>
        <input
          className={`num ${styles.numberInput}`}
          type="number"
          min={0}
          aria-label="Minimum ISO"
          placeholder="Min"
          value={filter.isoMin ?? ''}
          onChange={(e) => setFilter({ isoMin: toNumber(e.target.value) })}
        />
        <span className={styles.fieldLabel}>to</span>
        <input
          className={`num ${styles.numberInput}`}
          type="number"
          min={0}
          aria-label="Maximum ISO"
          placeholder="Max"
          value={filter.isoMax ?? ''}
          onChange={(e) => setFilter({ isoMax: toNumber(e.target.value) })}
        />
      </div>
      <div className={styles.field} role="group" aria-label="Capture date range">
        <span className={styles.fieldLabel}>Captured</span>
        <input className={styles.dateInput} type="date" aria-label="Captured from" value={filter.dateFrom ?? ''} onChange={(e) => setFilter({ dateFrom: e.target.value || null })} />
        <span className={styles.fieldLabel}>to</span>
        <input className={styles.dateInput} type="date" aria-label="Captured to" value={filter.dateTo ?? ''} onChange={(e) => setFilter({ dateTo: e.target.value || null })} />
      </div>
      <ValueSelect id="mf-keyword" label="Keyword" value={filter.keyword} options={keywords} onChange={(keyword) => setFilter({ keyword })} />
      <div className={styles.spacer} />
      <button type="button" className={controls.button} onClick={() => setFilter(EMPTY_METADATA_FILTER)}>
        Clear
      </button>
    </div>
  );
}
