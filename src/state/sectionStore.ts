import { create } from 'zustand';
import { readUiPrefs, writeUiPrefs } from './uiPrefs';

/**
 * Which collapsible Library panel sections are closed (M22). Open by
 * default; remembered per browser.
 */
interface SectionState {
  closed: string[];
  toggle: (id: string) => void;
}

function initialClosed(): string[] {
  const raw = readUiPrefs().closedSections;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

export const useSectionStore = create<SectionState>()((set) => ({
  closed: initialClosed(),
  toggle: (id) =>
    set((s) => {
      const closed = s.closed.includes(id) ? s.closed.filter((c) => c !== id) : [...s.closed, id];
      writeUiPrefs({ closedSections: closed });
      return { closed };
    }),
}));

/** [open, toggle] for one section. */
export function useSectionOpen(id: string): [boolean, () => void] {
  const open = useSectionStore((s) => !s.closed.includes(id));
  const toggle = useSectionStore((s) => s.toggle);
  return [open, () => toggle(id)];
}
