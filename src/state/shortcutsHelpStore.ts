import { create } from 'zustand';

/** The keyboard shortcuts dialog (M22): top-bar keyboard button or `?`. */
interface ShortcutsHelpState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useShortcutsHelpStore = create<ShortcutsHelpState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
