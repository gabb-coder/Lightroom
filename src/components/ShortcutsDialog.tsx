import { useEffect, useRef } from 'react';
import { isMacPlatform } from '../shortcuts/platform';
import { keyLabel, SHORTCUT_GROUPS, type Shortcut } from '../shortcuts/shortcutList';
import { useShortcutsHelpStore } from '../state/shortcutsHelpStore';
import controls from './controls.module.css';
import dialog from './SettingsDialog.module.css';
import styles from './ShortcutsDialog.module.css';

function Keys({ keys, mac }: { keys: string[]; mac: boolean }) {
  return (
    <span className={styles.combo}>
      {keys.map((k) => (
        <kbd key={k} className={styles.key}>
          {keyLabel(k, mac)}
        </kbd>
      ))}
    </span>
  );
}

function Row({ shortcut, mac }: { shortcut: Shortcut; mac: boolean }) {
  return (
    <div className={styles.row}>
      <dt>{shortcut.action}</dt>
      <dd>
        {[shortcut.keys, ...(shortcut.alternatives ?? [])].map((keys) => (
          <Keys key={keys.join('+')} keys={keys} mac={mac} />
        ))}
      </dd>
    </div>
  );
}

/** Every keyboard shortcut, grouped (design/Kit.dc.html "Keyboard shortcuts"). */
export function ShortcutsDialog() {
  const open = useShortcutsHelpStore((s) => s.open);
  const setOpen = useShortcutsHelpStore((s) => s.setOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mac = isMacPlatform();

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className={dialog.scrim} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div
        className={`${dialog.dialog} ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        data-testid="shortcuts-dialog"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || e.key === '?') setOpen(false);
        }}
      >
        <div className={styles.header}>
          <h2 id="shortcuts-title" className={dialog.title}>
            Keyboard shortcuts
          </h2>
          <button ref={closeRef} type="button" className={controls.iconButton} aria-label="Close" onClick={() => setOpen(false)}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className={styles.groups}>
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={`ks-${group.title}`}>
              <h3 id={`ks-${group.title}`} className={styles.groupTitle}>
                {group.title}
              </h3>
              <dl className={styles.list}>
                {group.shortcuts.map((s) => (
                  <Row key={s.action} shortcut={s} mac={mac} />
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
