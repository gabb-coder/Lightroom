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
import { openCopyDialog, pasteSettings, useCopyPasteStore } from '../state/copyPasteStore';
import { settingsSourceId } from '../state/settingsSync';
import { createVirtualCopy } from '../state/virtualCopyActions';
import { useViewStore } from '../state/viewStore';
import { useDeleteDialogStore } from '../state/deleteDialogStore';
import { autoToneSelection, runAutoTone } from '../state/editingAids';
import { useShortcutsHelpStore } from '../state/shortcutsHelpStore';
import { useContactSheetStore } from '../state/contactSheetStore';
import { openCompare, openFullscreen, openSlideshow } from '../state/viewerActions';
import { useViewerStore } from '../state/viewerStore';

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
      // A modal dialog (Copy / Sync settings, Remove photos) owns the keyboard.
      if (useCopyPasteStore.getState().dialog || useDeleteDialogStore.getState().ids || useShortcutsHelpStore.getState().open || useContactSheetStore.getState().open) return;
      // The viewers (M31) own the keyboard while open.
      if (useViewerStore.getState().mode || useViewerStore.getState().compare) return;
      const command = mac ? event.metaKey : event.ctrlKey;
      // Ctrl/Cmd+': make a virtual copy of the focused photo and switch to it (as in Lightroom).
      if (command && !event.shiftKey && event.key === "'" && useAppStore.getState().module !== 'export') {
        const source = settingsSourceId();
        if (!source) return;
        event.preventDefault();
        void createVirtualCopy(source).then((id) => id && useLibraryStore.getState().select(id));
        return;
      }
      // Ctrl/Cmd+Shift+C / V: copy and paste settings (design/Kit.dc.html).
      if (command && event.shiftKey && useAppStore.getState().module !== 'export') {
        const key = event.key.toLowerCase();
        if (key === 'c' || key === 'v') {
          event.preventDefault();
          if (key === 'c') openCopyDialog();
          else void pasteSettings();
          return;
        }
      }
      // Ctrl/Cmd+Shift+E: Export (design/Kit.dc.html).
      if ((mac ? event.metaKey : event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        useAppStore.getState().setModule('export');
        return;
      }
      // Ctrl/Cmd+U: Auto tone (as in Lightroom); in Library, every selected photo (M32).
      if (command && !event.shiftKey && event.key.toLowerCase() === 'u') {
        if (developHasPhoto()) {
          event.preventDefault();
          runAutoTone();
        } else if (useAppStore.getState().module === 'library' && useLibraryStore.getState().selection.ids.length > 0) {
          event.preventDefault();
          void autoToneSelection();
        }
        return;
      }
      // Ctrl/Cmd+Enter: slideshow (as in Lightroom's impromptu slideshow).
      if (command && !event.shiftKey && event.key === 'Enter' && useAppStore.getState().module !== 'export') {
        event.preventDefault();
        openSlideshow();
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
      // ?: the keyboard shortcuts dialog.
      if (event.key === '?') {
        event.preventDefault();
        useShortcutsHelpStore.getState().setOpen(true);
        return;
      }
      // F: full screen; C: compare (Library), as in Lightroom.
      if (event.key.toLowerCase() === 'f' && !event.shiftKey && useAppStore.getState().module !== 'export') {
        event.preventDefault();
        openFullscreen();
        return;
      }
      if (event.key.toLowerCase() === 'c' && !event.shiftKey && useAppStore.getState().module === 'library') {
        if (openCompare()) event.preventDefault();
        return;
      }
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
      // Delete / Backspace: remove the selected photos (asks first).
      if ((event.key === 'Delete' || event.key === 'Backspace') && useAppStore.getState().module !== 'export') {
        const targets = organizeTargets();
        if (targets.length === 0) return;
        event.preventDefault();
        useDeleteDialogStore.getState().open(targets);
        return;
      }
      const develop = useDevelopStore.getState();
      // M / Shift+M: linear / radial gradient (as in Lightroom); press again to cancel.
      if (event.key.toLowerCase() === 'm' && developHasPhoto()) {
        event.preventDefault();
        const kind = event.shiftKey ? 'radial' : 'linear';
        develop.setMaskTool(develop.maskTool === kind ? null : kind);
        return;
      }
      // Q: spot removal (as in Lightroom); press again to close it.
      if (event.key.toLowerCase() === 'q' && !event.shiftKey && developHasPhoto()) {
        event.preventDefault();
        develop.setSpotsOpen(!develop.spotsOpen);
        return;
      }
      if (event.key === 'Escape' && develop.spotsOpen) {
        event.preventDefault();
        if (develop.selectedSpotId) develop.selectSpot(null);
        else develop.setSpotsOpen(false);
        return;
      }
      // W: white balance eyedropper; J: clipping warnings; Y: split Before/After (as in Lightroom).
      if (event.key.toLowerCase() === 'w' && !event.shiftKey && developHasPhoto()) {
        event.preventDefault();
        develop.setWbPicking(!develop.wbPicking);
        return;
      }
      if (event.key.toLowerCase() === 'j' && !event.shiftKey && developHasPhoto()) {
        event.preventDefault();
        useViewStore.getState().toggleClipping();
        return;
      }
      if (event.key.toLowerCase() === 'y' && !event.shiftKey && developHasPhoto()) {
        event.preventDefault();
        const view = useViewStore.getState();
        view.setSplit(!view.split);
        return;
      }
      if (event.key === 'Escape' && develop.wbPicking) {
        event.preventDefault();
        develop.setWbPicking(false);
        return;
      }
      if (event.key === 'Escape' && develop.rangePicking) {
        event.preventDefault();
        develop.setRangePicking(false);
        return;
      }
      // K: brush (as in Lightroom); O: show the selected mask as an overlay.
      if (event.key.toLowerCase() === 'k' && !event.shiftKey && developHasPhoto()) {
        event.preventDefault();
        develop.setMaskTool(develop.maskTool === 'brush' ? null : 'brush');
        return;
      }
      if (event.key.toLowerCase() === 'o' && !event.shiftKey && developHasPhoto()) {
        event.preventDefault();
        const view = useViewStore.getState();
        view.setShowMaskOverlay(!view.showMaskOverlay);
        if (!develop.masksOpen) develop.setMasksOpen(true);
        return;
      }
      if (event.key === 'Escape' && develop.maskTool) {
        event.preventDefault();
        develop.setMaskTool(null);
        return;
      }
      // Z: zoom 1:1 and back (design/Kit.dc.html).
      if (event.key.toLowerCase() === 'z' && !event.shiftKey && developHasPhoto() && !develop.cropping) {
        event.preventDefault();
        useViewStore.getState().toggleZoom();
        return;
      }
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
