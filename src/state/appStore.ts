import { create } from 'zustand';

export type AppModule = 'library' | 'develop' | 'export';

export const APP_MODULES: readonly AppModule[] = ['library', 'develop', 'export'];

interface AppState {
  module: AppModule;
  /** Where closing the Export dialog returns to. */
  returnModule: Exclude<AppModule, 'export'>;
  setModule: (module: AppModule) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  module: 'develop',
  returnModule: 'library',
  setModule: (module) => set((s) => (s.module === 'export' || module !== 'export' ? { module } : { module, returnModule: s.module })),
}));
