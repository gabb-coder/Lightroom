import { SliderRow } from '../../components/SliderRow';
import controls from '../../components/controls.module.css';
import { EyedropperIcon } from '../../components/icons';
import { defaultMaskRange, MAX_MASKS, type Mask, type MaskAdjustKey, type MaskKind, type MaskRange, type RadialMask } from '../../model/editSettings';
import { maskNames } from '../../model/maskEdit';
import { BRUSH_FEATHER_SLIDER, BRUSH_SIZE_SLIDER, MASK_ANGLE_SLIDER, MASK_FEATHER_SLIDER, maskSliderDef, RANGE_SLIDERS } from '../../model/sliders';
import { useDevelopStore } from '../../state/developStore';
import { useViewStore } from '../../state/viewStore';
import styles from './MasksPanel.module.css';

const ADJUST_KEYS: readonly MaskAdjustKey[] = ['exposure', 'contrast', 'highlights', 'shadows', 'temp', 'tint', 'saturation'];
const TOOLS: readonly { kind: MaskKind; label: string; short: string; shortcut: string }[] = [
  { kind: 'linear', label: 'Linear gradient', short: 'Linear', shortcut: 'M' },
  { kind: 'radial', label: 'Radial gradient', short: 'Radial', shortcut: 'Shift+M' },
  { kind: 'brush', label: 'Brush', short: 'Brush', shortcut: 'K' },
];

const TOOL_HINTS: Readonly<Record<MaskKind, string>> = {
  linear: 'Drag on the photo to place it. Esc cancels.',
  radial: 'Drag on the photo to place it. Esc cancels.',
  brush: 'Paint on the photo; hold Alt to erase. Esc stops.',
};

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
        def={MASK_ANGLE_SLIDER}
        value={Math.round(mask.angle)}
        disabled={disabled}
        onChange={(angle) => updateMask(mask.id, { angle }, 'Rotate mask', `masks.${mask.id}.angle`)}
        onDragStart={() => setInteracting(true)}
        onDragEnd={() => setInteracting(false)}
      />
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

/** Size, feather and paint/erase for new brush strokes (session settings, not history). */
function BrushOptions({ disabled }: { disabled: boolean }) {
  const brush = useDevelopStore((s) => s.brush);
  const setBrush = useDevelopStore((s) => s.setBrush);
  return (
    <div role="group" aria-label="Brush options" className={styles.brushOptions}>
      <SliderRow def={BRUSH_SIZE_SLIDER} value={brush.size} disabled={disabled} onChange={(size) => setBrush({ size })} />
      <SliderRow def={BRUSH_FEATHER_SLIDER} value={brush.feather} disabled={disabled} onChange={(feather) => setBrush({ feather })} />
      <div className={`${controls.segmented} ${styles.paintMode}`} role="group" aria-label="Brush mode">
        {([false, true] as const).map((erase) => (
          <button key={String(erase)} type="button" className={controls.segment} aria-pressed={brush.erase === erase} disabled={disabled} onClick={() => setBrush({ erase })}>
            {erase ? 'Erase' : 'Paint'}
          </button>
        ))}
      </div>
    </div>
  );
}

const RANGE_KINDS: readonly { kind: MaskRange['kind']; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'color', label: 'Color' },
  { kind: 'luminance', label: 'Luminance' },
];

/** Range mask (M30): limit the selected mask to a color or a brightness band. */
function RangeControls({ mask, disabled }: { mask: Mask; disabled: boolean }) {
  const updateMask = useDevelopStore((s) => s.updateMask);
  const setInteracting = useDevelopStore((s) => s.setInteracting);
  const picking = useDevelopStore((s) => s.rangePicking);
  const setRangePicking = useDevelopStore((s) => s.setRangePicking);
  const range = mask.range ?? defaultMaskRange();
  const set = (patch: Partial<MaskRange>, prop: string) => {
    const next = { ...range, ...patch };
    // Keep the band ordered.
    if (prop === 'lo' && next.hi < next.lo) next.hi = next.lo;
    if (prop === 'hi' && next.lo > next.hi) next.lo = next.hi;
    updateMask(mask.id, { range: next }, 'Mask range', prop === 'kind' ? null : `masks.${mask.id}.range.${prop}`);
  };
  const slider = (prop: 'lo' | 'hi' | 'smooth' | 'hue' | 'width') => (
    <SliderRow
      key={prop}
      def={RANGE_SLIDERS[prop]}
      value={range[prop]}
      disabled={disabled}
      onChange={(v) => set({ [prop]: v }, prop)}
      onDragStart={() => setInteracting(true)}
      onDragEnd={() => setInteracting(false)}
    />
  );
  return (
    <div role="group" aria-label="Range" className={styles.range}>
      <div className={styles.rangeHeader}>
        <div className={`group-label ${styles.groupLabel}`}>Range</div>
        <div className={controls.segmented} role="group" aria-label="Range mask">
          {RANGE_KINDS.map((k) => (
            <button key={k.kind} type="button" className={controls.segment} aria-pressed={range.kind === k.kind} disabled={disabled} onClick={() => set({ kind: k.kind }, 'kind')}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {range.kind === 'color' && (
        <>
          <div className={styles.rangePick}>
            <button
              type="button"
              className={`${controls.button} ${styles.tool}`}
              aria-pressed={picking}
              disabled={disabled}
              title="Click a color on the photo"
              onClick={() => setRangePicking(!picking)}
            >
              <EyedropperIcon /> Pick a color
            </button>
          </div>
          {picking && <p className={styles.hint}>Click the color to limit this mask to. Esc cancels.</p>}
          {slider('hue')}
          {slider('width')}
        </>
      )}
      {range.kind === 'luminance' && (
        <>
          {slider('lo')}
          {slider('hi')}
          {slider('smooth')}
        </>
      )}
    </div>
  );
}

/** O: tint the selected mask's area on the photo. */
function OverlayToggle({ disabled }: { disabled: boolean }) {
  const show = useViewStore((s) => s.showMaskOverlay);
  const setShow = useViewStore((s) => s.setShowMaskOverlay);
  return (
    <label className={styles.check} title="Show the selected mask's area in red (O)">
      <input type="checkbox" checked={show} disabled={disabled} onChange={(e) => setShow(e.target.checked)} />
      Show overlay
    </label>
  );
}

/**
 * Masks (M15, M21): linear and radial gradients and brush masks, each with
 * its own adjustments. Pick a tool and drag (or paint) on the photo; select
 * a mask to edit it.
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
            aria-label={t.label}
            title={`${t.label} (${t.shortcut})`}
            // The brush can still paint into a selected brush mask when the list is full.
            disabled={disabled || (full && !(t.kind === 'brush' && selected?.kind === 'brush'))}
            onClick={() => setMaskTool(tool === t.kind ? null : t.kind)}
          >
            {t.short}
          </button>
        ))}
      </div>
      {tool && <p className={styles.hint}>{TOOL_HINTS[tool]}</p>}
      {(tool === 'brush' || selected?.kind === 'brush') && <BrushOptions disabled={disabled} />}
      {!tool && masks.length === 0 && <p className={styles.hint}>Brighten a sky or darken a corner: pick a gradient or the brush, then drag on the photo.</p>}
      {masks.length > 0 && <OverlayToggle disabled={disabled} />}
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
          <RangeControls mask={selected} disabled={disabled} />
        </div>
      )}
    </>
  );
}
