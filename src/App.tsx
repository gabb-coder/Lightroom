import { TopBar } from './components/TopBar';
import { Filmstrip } from './components/Filmstrip';
import { DevelopView } from './modules/develop/DevelopView';
import { LibraryView } from './modules/library/LibraryView';
import { ExportView } from './modules/export/ExportView';
import { useAppStore, type AppModule } from './state/appStore';
import { useGlobalShortcuts } from './shortcuts/useGlobalShortcuts';
import styles from './App.module.css';

function ModuleView({ module }: { module: AppModule }) {
  switch (module) {
    case 'library':
      return <LibraryView />;
    case 'develop':
      return <DevelopView />;
    case 'export':
      return <ExportView />;
  }
}

export function App() {
  const module = useAppStore((s) => s.module);
  useGlobalShortcuts();

  return (
    <div className={styles.app}>
      <TopBar />
      <main
        className={styles.body}
        id={`module-${module}`}
        role="tabpanel"
        aria-labelledby={`tab-${module}`}
      >
        <ModuleView module={module} />
      </main>
      <Filmstrip />
    </div>
  );
}
