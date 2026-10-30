import { useAppStore } from './appStore';
import { selectFilmstripList, selectLibraryList, useLibraryStore } from './libraryStore';
import { useViewerStore } from './viewerStore';

/** The photos the viewers go through: the filmstrip in Develop, the grid in Library. */
function currentList(): { ids: string[]; index: number } {
  const library = useLibraryStore.getState();
  const list = useAppStore.getState().module === 'develop' ? selectFilmstripList(library) : selectLibraryList(library);
  const ids = list.map((p) => p.id);
  return { ids, index: Math.max(0, library.selectedId ? ids.indexOf(library.selectedId) : 0) };
}

/** Asks the browser for real full screen (needs a click or key press); viewers work without it too. */
function enterBrowserFullscreen(): void {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
}

export function exitBrowserFullscreen(): void {
  if (document.fullscreenElement && document.exitFullscreen) void document.exitFullscreen().catch(() => undefined);
}

/** F: the focused photo full screen. */
export function openFullscreen(): void {
  const { ids, index } = currentList();
  if (ids.length === 0) return;
  enterBrowserFullscreen();
  useViewerStore.getState().open('fullscreen', ids, index);
}

/** Ctrl/Cmd+Enter: a slideshow of the list, from the focused photo. */
export function openSlideshow(): void {
  const { ids, index } = currentList();
  if (ids.length === 0) return;
  enterBrowserFullscreen();
  useViewerStore.getState().open('slideshow', ids, index);
}

/**
 * C: compare the focused photo (select) with another: the next selected one,
 * or else the next photo in the list.
 */
export function openCompare(): boolean {
  const library = useLibraryStore.getState();
  const { ids } = currentList();
  const select = library.selectedId;
  if (!select || ids.length < 2) return false;
  const others = library.selection.ids.filter((id) => id !== select);
  const at = ids.indexOf(select);
  const candidate = others[0] ?? ids[at + 1] ?? ids[at - 1];
  if (!candidate) return false;
  useViewerStore.getState().openCompare(select, candidate);
  return true;
}

/** The next / previous photo of the list for the compare candidate, skipping the select. */
export function stepCandidate(delta: number): void {
  const viewer = useViewerStore.getState();
  if (!viewer.compare) return;
  const { ids } = currentList();
  const others = ids.filter((id) => id !== viewer.compare?.select);
  if (others.length === 0) return;
  const at = others.indexOf(viewer.compare.candidate);
  viewer.setCandidate(others[(((at + delta) % others.length) + others.length) % others.length] ?? viewer.compare.candidate);
}
