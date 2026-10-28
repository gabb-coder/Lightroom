import { APP_MODULES, useAppStore, type AppModule } from '../state/appStore';
import styles from './TopBar.module.css';

const LABELS: Readonly<Record<AppModule, string>> = {
  library: 'Library',
  develop: 'Develop',
  export: 'Export',
};

export function TopBar() {
  const active = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);

  return (
    <header className={styles.topBar} data-testid="top-bar">
      <span className={styles.brand}>Lightroom</span>
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
    </header>
  );
}
