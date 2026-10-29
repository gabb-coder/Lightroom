import { useState, type FormEvent } from 'react';
import { CollapsibleSection } from '../../components/SectionTitle';
import { parseKeywords, selectionKeywords } from '../../model/keywords';
import { useLibraryStore } from '../../state/libraryStore';
import { addKeywordsTo, removeKeywordFrom } from '../../state/organizeActions';
import styles from './KeywordsPanel.module.css';

/**
 * Keywords of the selected photos (Library right panel). Typing adds to every
 * selected photo; × removes from every selected photo. A keyword only some
 * of them have is shown dimmed with its count.
 */
export function KeywordsPanel() {
  const ids = useLibraryStore((s) => s.selection.ids);
  const photos = useLibraryStore((s) => s.photos);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const [draft, setDraft] = useState('');
  const selected = photos.filter((p) => ids.includes(p.id));
  const keywords = selectionKeywords(selected);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const words = parseKeywords(draft);
    if (words.length) void addKeywordsTo(ids, words);
    setDraft('');
  };

  return (
    <CollapsibleSection id="library.keywords" title="Keywords" className={styles.panel} titleClassName={styles.title}>
      {keywords.length > 0 && (
        <ul className={styles.chips} aria-label="Keywords of the selected photos">
          {keywords.map(({ keyword, count }) => {
            const partial = count < selected.length;
            return (
              <li key={keyword.toLowerCase()} className={styles.chip} data-partial={partial} title={partial ? `On ${count} of ${selected.length} selected photos` : undefined}>
                <button type="button" className={styles.chipLabel} aria-label={`Show photos with keyword ${keyword}`} onClick={() => setFilter({ keyword })}>
                  {keyword}
                  {partial && <span className="num"> {count}</span>}
                </button>
                <button type="button" className={styles.remove} aria-label={`Remove keyword ${keyword}`} onClick={() => void removeKeywordFrom(ids, keyword)}>
                  <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={submit}>
        <input
          className={styles.input}
          aria-label="Add keywords"
          placeholder={ids.length > 1 ? `Add keywords to ${ids.length} photos` : 'Add keywords, separated by commas'}
          value={draft}
          disabled={ids.length === 0}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
    </CollapsibleSection>
  );
}
