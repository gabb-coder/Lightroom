import type { ReactNode } from 'react';
import { APP_NAME } from '../appName';
import { APP_MODULES, useAppStore, type AppModule } from '../state/appStore';
import { canRedo, canUndo } from '../model/history';
import { useDevelopStore } from '../state/developStore';
import { modifierLabel } from '../shortcuts/platform';
import { openImportPicker } from '../state/importActions';
import { useShortcutsHelpStore } from '../state/shortcutsHelpStore';
import { ImportIcon, KeyboardIcon, LogoIcon, RedoIcon, UndoIcon } from './icons';
import controls from './controls.module.css';
import styles from './TopBar.module.css';

const LABELS: Readonly<Record<AppModule, string>> = {
  library: 'Library',
  develop: 'Develop',
  export: 'Export',
};

function UndoRedo() {
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const undoable = useDevelopStore((s) => canUndo(s.history));
  const redoable = useDevelopStore((s) => canRedo(s.history));
  const undo = useDevelopStore((s) => s.undo);
  const redo = useDevelopStore((s) => s.redo);
  const mod = modifierLabel();
  return (
    <>
      <button
        type="button"
        className={controls.iconButton}
        aria-label="Undo"
        title={`Undo (${mod}Z)`}
        disabled={!hasPhoto || !undoable}
        onClick={undo}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className={controls.iconButton}
        aria-label="Redo"
        title={`Redo (${mod}Shift+Z)`}
        disabled={!hasPhoto || !redoable}
        onClick={redo}
      >
        <RedoIcon />
      </button>
    </>
  );
}

/** Module-specific actions on the right of the top bar. */
function ModuleActions({ module }: { module: AppModule }): ReactNode {
  if (module === 'develop') return <UndoRedo />;
  if (module === 'library') {
    return (
      <button type="button" className={controls.primary} onClick={openImportPicker}>
        <ImportIcon />
        Import
      </button>
    );
  }
  return null;
}

export function TopBar() {
  const active = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);

  return (
    <header className={styles.topBar} data-testid="top-bar">
      <div className={styles.brand}>
        <LogoIcon />
        <span className={styles.wordmark}>{APP_NAME}</span>
      </div>
      <nav className={styles.tabs} role="tablist" aria-label="Modules">
        {APP_MODULES.map((module) => (
          <button
            key={module}
            id={`tab-${module}`}
            type="button"
            role="tab"
            aria-selected={module === active}
            aria-controls={`module-${module}`}
            className={styles.tab}
            onClick={() => setModule(module)}
          >
            {LABELS[module]}
          </button>
        ))}
      </nav>
      <div className={styles.actions}>
        <ModuleActions module={active} />
        <button
          type="button"
          className={`${controls.iconButton} ${styles.keyboardButton}`}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => useShortcutsHelpStore.getState().setOpen(true)}
        >
          <KeyboardIcon />
        </button>
      </div>
    </header>
  );
}
