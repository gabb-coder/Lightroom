import { useEffect } from 'react';
import { useAppStore, type AppModule } from '../state/appStore';
import { useDevelopStore } from '../state/developStore';
import { createBeforeAfterKeys } from './beforeAfterKeys';
import { matchHistoryShortcut } from './historyShortcuts';
import { isMacPlatform } from './platform';
import { isArrowKeyTarget, isTextEntryTarget, type TargetLike } from './isTextEntryTarget';
import { neighborId, selectFilmstripList, selectLibraryList, useLibraryStore } from '../state/libraryStore';
import { organizeTargets, setFlag, setRating } from '../state/organizeActions';
import { matchOrganizeShortcut } from './organizeShortcuts';

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

    const mac = isMacPlatform();
    const onKeyDown = (event: KeyboardEvent): void => {
      // Text fields keep their own shortcuts (including native Ctrl/Cmd+Z).
      if (isTextEntryTarget(event.target as TargetLike | null)) return;
      // Ctrl/Cmd+Shift+E: Export (design/Kit.dc.html).
      if ((mac ? event.metaKey : event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        useAppStore.getState().setModule('export');
        return;
      }
      const historyAction = matchHistoryShortcut(event, mac);
      if (historyAction) {
        if (!developHasPhoto()) return;
        event.preventDefault();
        useDevelopStore.getState()[historyAction]();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (isArrowKeyTarget(event.target as TargetLike | null)) return;
        const library = useLibraryStore.getState();
        const list = useAppStore.getState().module === 'develop' ? selectFilmstripList(library) : selectLibraryList(library);
        const next = neighborId(list, library.selectedId, event.key === 'ArrowLeft' ? -1 : 1);
        if (!next) return;
        event.preventDefault();
        library.select(next);
        return;
      }
      const organize = matchOrganizeShortcut(event.key);
      if (organize) {
        const targets = organizeTargets();
        if (targets.length === 0) return;
        event.preventDefault();
        void (organize.kind === 'rating' ? setRating(targets, organize.value) : setFlag(targets, organize.value));
        return;
      }
      const develop = useDevelopStore.getState();
      if (event.key.toLowerCase() === 'r' && developHasPhoto()) {
        event.preventDefault();
        develop.setCropping(!develop.cropping);
        return;
      }
      if ((event.key === 'Escape' || event.key === 'Enter') && develop.cropping) {
        // Enter on a focused button activates it instead.
        if (event.key === 'Enter' && (event.target as TargetLike | null)?.tagName?.toLowerCase() === 'button') return;
        event.preventDefault();
        develop.setCropping(false);
        return;
      }
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
