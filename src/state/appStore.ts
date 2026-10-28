import { create } from 'zustand';

export type AppModule = 'library' | 'develop' | 'export';

export const APP_MODULES: readonly AppModule[] = ['library', 'develop', 'export'];

interface AppState {
  module: AppModule;
  setModule: (module: AppModule) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  module: 'develop',
  setModule: (module) => set({ module }),
}));
