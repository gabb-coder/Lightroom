/**
 * Keywords (M11): free-text tags on photos. Stored as typed, compared
 * case-insensitively so "Beach" and "beach" are the same keyword.
 */

export const MAX_KEYWORD_LENGTH = 64;

/** Cleans one keyword: trims, collapses spaces, drops control characters; null if empty. */
export function normalizeKeyword(raw: string): string | null {
  const cleaned = Array.from(raw)
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_KEYWORD_LENGTH)
    .trim();
  return cleaned || null;
}

/** Splits typed text ("beach, sunset; family") into normalized keywords. */
export function parseKeywords(text: string): string[] {
  return dedupe(text.split(/[,;]/).map(normalizeKeyword).filter((k): k is string => k !== null));
}

/** Removes case-insensitive duplicates, keeping the first spelling. */
export function dedupe(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  return keywords.filter((k) => {
    const lower = k.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

/** A photo's keywords with `added` appended (existing spellings win). */
export function addKeywords(current: readonly string[] | undefined, added: readonly string[]): string[] {
  return dedupe([...(current ?? []), ...added]);
}

export function removeKeyword(current: readonly string[] | undefined, keyword: string): string[] {
  const lower = keyword.toLowerCase();
  return (current ?? []).filter((k) => k.toLowerCase() !== lower);
}

/** Keywords across a selection, with how many of the photos have each (case-insensitive). */
export function selectionKeywords(photos: readonly { keywords?: string[] }[]): { keyword: string; count: number }[] {
  const counts = new Map<string, { keyword: string; count: number }>();
  for (const p of photos) {
    for (const k of dedupe(p.keywords ?? [])) {
      const entry = counts.get(k.toLowerCase());
      if (entry) entry.count++;
      else counts.set(k.toLowerCase(), { keyword: k, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.keyword.localeCompare(b.keyword, undefined, { sensitivity: 'base' }));
}
