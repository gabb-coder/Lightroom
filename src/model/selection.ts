/**
 * Multi-selection in the grid. `focusId` is the photo shown in the details
 * panel and opened in Develop; `anchorId` is where Shift-click ranges start.
 */
export interface Selection {
  ids: readonly string[];
  focusId: string | null;
  anchorId: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: [], focusId: null, anchorId: null };

export interface ClickModifiers {
  /** Ctrl (Windows/Linux) or Cmd (macOS): add or remove one photo. */
  toggle: boolean;
  /** Shift: select the range from the anchor. */
  range: boolean;
}

export function selectOnly(id: string): Selection {
  return { ids: [id], focusId: id, anchorId: id };
}

function rangeIds(order: readonly string[], from: string, to: string): string[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** New selection after clicking `id` in a list shown in `order`. */
export function clickSelection(sel: Selection, order: readonly string[], id: string, mods: ClickModifiers): Selection {
  if (mods.range) {
    const anchor = sel.anchorId ?? sel.focusId ?? id;
    const range = rangeIds(order, anchor, id);
    const ids = mods.toggle ? [...sel.ids, ...range.filter((r) => !sel.ids.includes(r))] : range;
    return { ids, focusId: id, anchorId: anchor };
  }
  if (mods.toggle) {
    if (!sel.ids.includes(id)) return { ids: [...sel.ids, id], focusId: id, anchorId: id };
    const ids = sel.ids.filter((x) => x !== id);
    const focusId = sel.focusId === id ? (ids[ids.length - 1] ?? null) : sel.focusId;
    return { ids, focusId, anchorId: id };
  }
  return selectOnly(id);
}

/** Drops photos that are no longer shown (after a filter change). */
export function pruneSelection(sel: Selection, visible: readonly string[]): Selection {
  const shown = new Set(visible);
  const ids = sel.ids.filter((id) => shown.has(id));
  const focusId = sel.focusId && shown.has(sel.focusId) ? sel.focusId : (ids[0] ?? null);
  const anchorId = sel.anchorId && shown.has(sel.anchorId) ? sel.anchorId : focusId;
  return { ids, focusId, anchorId };
}
