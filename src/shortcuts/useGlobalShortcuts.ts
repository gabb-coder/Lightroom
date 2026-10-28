import { useEffect } from 'react';
import { useAppStore, type AppModule } from '../state/appStore';
import { useDevelopStore } from '../state/developStore';
import { createBeforeAfterKeys } from './beforeAfterKeys';
import { isTextEntryTarget, type TargetLike } from './isTextEntryTarget';

const MODULE_KEYS: Readonly<Record<string, AppModule>> = {
  g: 'library',
  d: 'develop',
};

const BEFORE_AFTER_KEY = '\\';

function developHasPhoto(): boolean {
  return useAppStore.getState().module === 'develop' && useDevelopStore.getState().photo !== null;
}

/** App-wide keyboard shortcuts. More are added as their milestones land. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const beforeAfter = createBeforeAfterKeys({
      setPeeking: (p) => useDevelopStore.getState().setPeeking(p),
      toggleBefore: () => useDevelopStore.getState().toggleBefore(),
    });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntryTarget(event.target as TargetLike | null)) return;
      if (event.key === BEFORE_AFTER_KEY) {
        if (!developHasPhoto()) return;
        event.preventDefault();
        beforeAfter.keyDown(event.timeStamp);
        return;
      }
      const module = MODULE_KEYS[event.key.toLowerCase()];
      if (!module) return;
      event.preventDefault();
      beforeAfter.cancel();
      useAppStore.getState().setModule(module);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === BEFORE_AFTER_KEY) beforeAfter.keyUp(event.timeStamp);
    };
    const onBlur = (): void => beforeAfter.cancel();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
