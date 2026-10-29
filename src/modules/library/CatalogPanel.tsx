import { useState, type FormEvent } from 'react';
import { CollectionIcon, PhotosIcon, RecentIcon } from '../../components/icons';
import controls from '../../components/controls.module.css';
import { sortCollections, type CollectionRecord } from '../../model/collections';
import { addToCollection, createCollection, deleteCollection, PHOTO_DRAG_TYPE, draggedPhotoIds, renameCollection, showCollection } from '../../state/collectionActions';
import { collectionView, latestBatchId, useLibraryStore, type CatalogView } from '../../state/libraryStore';
import layout from '../layout.module.css';
import styles from './LibraryView.module.css';

function NavItem({ current, label, count, icon, onClick }: { current: boolean; label: string; count: number; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={styles.navItem} aria-current={current ? 'page' : undefined} onClick={onClick}>
      {icon}
      <span className={styles.navLabel}>{label}</span>
      <span className={`num ${styles.navCount}`}>{count}</span>
    </button>
  );
}

/** Name field used for both "New collection" and "Rename". Escape cancels. */
function NameForm({ label, initial, onSubmit, onCancel, children }: { label: string; initial: string; onSubmit: (name: string) => void; onCancel: () => void; children?: React.ReactNode }) {
  const [name, setName] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(name);
  };
  return (
    <form className={styles.nameForm} onSubmit={submit}>
      <input
        className={styles.nameInput}
        aria-label={label}
        placeholder="Collection name"
        value={name}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      {children}
    </form>
  );
}

function NewCollection({ onDone }: { onDone: () => void }) {
  const selected = useLibraryStore((s) => s.selection.ids);
  const [include, setInclude] = useState(true);
  const submit = async (name: string) => {
    const id = await createCollection(name, include ? selected : []);
    if (id) showCollection(id);
    onDone();
  };
  return (
    <NameForm label="New collection name" initial="" onSubmit={(name) => void submit(name)} onCancel={onDone}>
      {selected.length > 0 && (
        <label className={styles.includeCheck}>
          <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
          Include {selected.length} selected {selected.length === 1 ? 'photo' : 'photos'}
        </label>
      )}
    </NameForm>
  );
}

type Mode = { kind: 'idle' } | { kind: 'rename'; id: string } | { kind: 'delete'; id: string };

function CollectionItem({ collection, mode, setMode }: { collection: CollectionRecord; mode: Mode; setMode: (m: Mode) => void }) {
  const view = useLibraryStore((s) => s.view);
  const count = useLibraryStore((s) => {
    const ids = new Set(s.photos.map((p) => p.id));
    return collection.photoIds.filter((id) => ids.has(id)).length;
  });
  const [dropTarget, setDropTarget] = useState(false);
  const idle = () => setMode({ kind: 'idle' });
  if (mode.kind === 'rename' && mode.id === collection.id) {
    return (
      <NameForm
        label={`Rename collection ${collection.name}`}
        initial={collection.name}
        onSubmit={(name) => void renameCollection(collection.id, name).then(idle)}
        onCancel={idle}
      />
    );
  }
  return (
    <div
      className={styles.collectionRow}
      data-drop-target={dropTarget}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PHOTO_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropTarget(false);
        const ids = draggedPhotoIds(e.dataTransfer);
        if (ids) void addToCollection(collection.id, ids);
      }}
    >
      <NavItem current={view === collectionView(collection.id)} label={collection.name} count={count} icon={<CollectionIcon />} onClick={() => showCollection(collection.id)} />
      <div className={styles.collectionActions}>
        <button type="button" className={styles.rowAction} aria-label={`Rename collection ${collection.name}`} onClick={() => setMode({ kind: 'rename', id: collection.id })}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z" />
          </svg>
        </button>
        <button type="button" className={styles.rowAction} aria-label={`Delete collection ${collection.name}`} onClick={() => setMode({ kind: 'delete', id: collection.id })}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      {mode.kind === 'delete' && mode.id === collection.id && (
        <div className={styles.confirm} role="alertdialog" aria-label={`Delete collection ${collection.name}?`}>
          <span>Delete “{collection.name}”? Its photos stay in the catalog.</span>
          <div className={styles.confirmButtons}>
            <button type="button" className={controls.button} onClick={idle}>
              Cancel
            </button>
            <button type="button" className={controls.button} onClick={() => void deleteCollection(collection.id).then(idle)}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Collections() {
  const collections = useLibraryStore((s) => s.collections);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  return (
    <section aria-label="Collections">
      <div className={`group-label ${styles.navGroup} ${styles.groupWithAction}`}>
        Collections
        <button type="button" className={styles.rowAction} aria-label="New collection" onClick={() => setCreating(true)}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
      {creating && <NewCollection onDone={() => setCreating(false)} />}
      {collections.length === 0 && !creating && <p className={styles.collectionsEmpty}>Group photos without moving them. Use + to make a collection.</p>}
      {sortCollections(collections).map((c) => (
        <CollectionItem key={c.id} collection={c} mode={mode} setMode={setMode} />
      ))}
    </section>
  );
}

/** Library left panel: catalog views and collections. */
export function CatalogPanel() {
  const photos = useLibraryStore((s) => s.photos);
  const view = useLibraryStore((s) => s.view);
  const setView = useLibraryStore((s) => s.setView);
  const batch = latestBatchId(photos);
  const items: { id: CatalogView; label: string; Icon: () => React.JSX.Element; count: number }[] = [
    { id: 'all', label: 'All photographs', Icon: PhotosIcon, count: photos.length },
    { id: 'previous', label: 'Previous import', Icon: RecentIcon, count: photos.filter((p) => p.batchId === batch).length },
  ];
  return (
    <aside className={`${layout.side} ${layout.left} ${styles.catalog}`} aria-label="Catalog" data-testid="left-panel">
      <div className={`group-label ${styles.navGroup}`}>Catalog</div>
      {items.map(({ id, label, Icon, count }) => (
        <NavItem key={id} current={view === id} label={label} count={count} icon={<Icon />} onClick={() => setView(id)} />
      ))}
      <Collections />
    </aside>
  );
}
