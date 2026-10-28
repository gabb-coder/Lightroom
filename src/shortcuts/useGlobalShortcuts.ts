import { useEffect } from 'react';
import { useAppStore, type AppModule } from '../state/appStore';
import { isTextEntryTarget, type TargetLike } from './isTextEntryTarget';

const MODULE_KEYS: Readonly<Record<string, AppModule>> = {
  g: 'library',
  d: 'develop',
};

/** App-wide single-key shortcuts. More are added as their milestones land. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntryTarget(event.target as TargetLike | null)) return;
      const module = MODULE_KEYS[event.key.toLowerCase()];
      if (!module) return;
      event.preventDefault();
      useAppStore.getState().setModule(module);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
