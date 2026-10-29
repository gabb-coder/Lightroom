import { create } from 'zustand';

/** The "Remove from catalog" confirmation (M17): which photos it is about. */
interface DeleteDialogState {
  ids: readonly string[] | null;
  open: (ids: readonly string[]) => void;
  close: () => void;
}

export const useDeleteDialogStore = create<DeleteDialogState>()((set) => ({
  ids: null,
  open: (ids) => set({ ids: ids.length ? ids : null }),
  close: () => set({ ids: null }),
}));
