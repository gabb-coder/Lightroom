import { SliderRow } from '../../components/SliderRow';
import controls from '../../components/controls.module.css';
import { MAX_MASKS, type Mask, type MaskAdjustKey, type MaskKind, type RadialMask } from '../../model/editSettings';
import { maskNames } from '../../model/maskEdit';
import { MASK_FEATHER_SLIDER, maskSliderDef } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import styles from './MasksPanel.module.css';

const ADJUST_KEYS: readonly MaskAdjustKey[] = ['exposure', 'contrast', 'highlights', 'shadows', 'temp', 'tint', 'saturation'];
const TOOLS: readonly { kind: MaskKind; label: string; shortcut: string }[] = [
  { kind: 'linear', label: 'Linear gradient', shortcut: 'M' },
  { kind: 'radial', label: 'Radial gradient', shortcut: 'Shift+M' },
];

function AdjustSlider({ mask, prop, disabled }: { mask: Mask; prop: MaskAdjustKey; disabled: boolean }) {
  const setMaskAdjust = useDevelopStore((s) => s.setMaskAdjust);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  return (
    <SliderRow
      def={maskSliderDef(prop)}
      value={mask.adjust[prop]}
      disabled={disabled}
      onChange={(v) => setMaskAdjust(mask.id, prop, v)}
      onDragStart={() => setInteracting(true)}
      onDragEnd={() => setInteracting(false)}
    />
  );
}

function RadialOptions({ mask, disabled }: { mask: RadialMask; disabled: boolean }) {
  const updateMask = useDevelopStore((s) => s.updateMask);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  return (
    <>
      <SliderRow
        def={MASK_FEATHER_SLIDER}
        value={mask.feather}
        disabled={disabled}
        onChange={(feather) => updateMask(mask.id, { feather }, 'Mask feather', `masks.${mask.id}.feather`)}
        onDragStart={() => setInteracting(true)}
        onDragEnd={() => setInteracting(false)}
      />
      <label className={styles.check}>
        <input type="checkbox" checked={mask.invert} disabled={disabled} onChange={(e) => updateMask(mask.id, { invert: e.target.checked }, 'Invert mask', null)} />
        Invert (adjust outside)
      </label>
    </>
  );
}

/**
 * Masks (M15): linear and radial gradients with their own adjustments.
 * Pick a tool and drag on the photo; select a mask to edit it.
 */
export function MasksPanel() {
  const disabled = useDevelopStore((s) => s.photo === null);
  const masks = useDevelopStore((s) => s.settings.masks);
  const selectedId = useDevelopStore((s) => s.selectedMaskId);
  const tool = useDevelopStore((s) => s.maskTool);
  const { setMaskTool, selectMask, removeMask } = useDevelopStore.getState();
  const selected = masks.find((m) => m.id === selectedId) ?? null;
  const names = maskNames(masks);
  const full = masks.length >= MAX_MASKS;

  return (
    <>
      <div className={styles.tools} role="group" aria-label="New mask">
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            type="button"
            className={`${controls.button} ${styles.tool}`}
            aria-pressed={tool === t.kind}
            title={`${t.label} (${t.shortcut})`}
            disabled={disabled || full}
            onClick={() => setMaskTool(tool === t.kind ? null : t.kind)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tool && <p className={styles.hint}>Drag on the photo to place it. Esc cancels.</p>}
      {!tool && masks.length === 0 && <p className={styles.hint}>Brighten a sky or darken a corner: pick a gradient, then drag on the photo.</p>}
      {full && <p className={styles.hint}>Up to {MAX_MASKS} masks per photo.</p>}
      {masks.length > 0 && (
        <ul className={styles.list} aria-label="Masks">
          {masks.map((m) => (
            <li key={m.id} className={styles.row}>
              <button type="button" className={styles.item} aria-pressed={m.id === selectedId} onClick={() => selectMask(m.id === selectedId ? null : m.id)}>
                {names.get(m.id)}
              </button>
              <button type="button" className={styles.delete} aria-label={`Delete ${names.get(m.id) ?? 'mask'}`} onClick={() => removeMask(m.id)}>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div role="group" aria-label={`${names.get(selected.id) ?? 'Mask'} adjustments`}>
          <div className={`group-label ${styles.groupLabel}`}>{names.get(selected.id)}</div>
          {ADJUST_KEYS.map((k) => (
            <AdjustSlider key={`${selected.id}-${k}`} mask={selected} prop={k} disabled={disabled} />
          ))}
          {selected.kind === 'radial' && <RadialOptions mask={selected} disabled={disabled} />}
        </div>
      )}
    </>
  );
}
