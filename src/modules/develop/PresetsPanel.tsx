import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { PanelSection } from '../../components/PanelSection';
import controls from '../../components/controls.module.css';
import { PRESET_GROUP_LABELS, type PresetGroup } from '../../model/presets';
import { useDevelopStore } from '../../state/developStore';
import { usePresetStore } from '../../state/presetStore';
import styles from './PresetsPanel.module.css';

const GROUP_ORDER: readonly PresetGroup[] = ['user', 'builtin'];

function SavePresetForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const savePreset = usePresetStore((s) => s.savePreset);
  const settings = useDevelopStore((s) => s.settings);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    savePreset(name, settings);
    onDone();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onDone();
  };

  return (
    <form className={styles.form} onSubmit={submit} onKeyDown={onKeyDown} aria-label="Save preset">
      <input
        className={styles.nameInput}
        type="text"
        aria-label="Preset name"
        placeholder="Preset name"
        value={name}
        maxLength={60}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className={styles.formButtons}>
        <button type="button" className={controls.button} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={`${controls.primary} ${styles.saveButton}`} disabled={!name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

/** Preset list with groups, plus "+" to save the current settings as a preset. */
export function PresetsPanel() {
  const presets = usePresetStore((s) => s.presets);
  const applyPreset = useDevelopStore((s) => s.applyPreset);
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const [saving, setSaving] = useState(false);

  return (
    <PanelSection
      title="Presets"
      defaultOpen
      variant="list"
      actions={
        <button
          type="button"
          className={styles.addButton}
          aria-label="Save settings as preset"
          title="Save current settings as a preset"
          disabled={!hasPhoto || saving}
          onClick={() => setSaving(true)}
        >
          +
        </button>
      }
    >
      {saving && <SavePresetForm onDone={() => setSaving(false)} />}
      {GROUP_ORDER.map((group) => {
        const items = presets.filter((p) => p.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} role="group" aria-label={PRESET_GROUP_LABELS[group]}>
            <div className={`group-label ${styles.groupLabel}`}>{PRESET_GROUP_LABELS[group]}</div>
            {items.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={styles.preset}
                disabled={!hasPhoto}
                onClick={() => applyPreset(preset)}
              >
                {preset.name}
              </button>
            ))}
          </div>
        );
      })}
    </PanelSection>
  );
}
