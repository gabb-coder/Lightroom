import type { ReactNode } from 'react';
import { APP_NAME } from '../appName';
import { APP_MODULES, useAppStore, type AppModule } from '../state/appStore';
import { ImportIcon, LogoIcon, RedoIcon, UndoIcon } from './icons';
import controls from './controls.module.css';
import styles from './TopBar.module.css';

const LABELS: Readonly<Record<AppModule, string>> = {
  library: 'Library',
  develop: 'Develop',
  export: 'Export',
};

/** Module-specific actions on the right of the top bar. Enabled by later milestones. */
function ModuleActions({ module }: { module: AppModule }): ReactNode {
  if (module === 'develop') {
    return (
      <>
        <button type="button" className={controls.iconButton} aria-label="Undo" disabled>
          <UndoIcon />
        </button>
        <button type="button" className={controls.iconButton} aria-label="Redo" disabled>
          <RedoIcon />
        </button>
      </>
    );
  }
  if (module === 'library') {
    return (
      <button type="button" className={controls.primary} disabled>
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
      </div>
    </header>
  );
}
