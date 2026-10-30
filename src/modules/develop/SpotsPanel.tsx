import { SliderRow } from '../../components/SliderRow';
import controls from '../../components/controls.module.css';
import { MAX_SPOTS, type SpotMode } from '../../model/editSettings';
import { SPOT_FEATHER_SLIDER, SPOT_OPACITY_SLIDER, SPOT_SIZE_SLIDER } from '../../model/sliders';
import { spotSize } from '../../model/spotEdit';
import { useDevelopStore } from '../../state/developStore';
import styles from './MasksPanel.module.css';

const MODES: readonly { mode: SpotMode; label: string; title: string }[] = [
  { mode: 'heal', label: 'Heal', title: 'Blend the patch into its surroundings' },
  { mode: 'clone', label: 'Clone', title: 'Copy the patch exactly' },
];

/**
 * Spot removal (M28). While this panel is open, a click on the photo covers
 * that spot with a nearby patch; the options apply to new spots and to the
 * selected one.
 */
export function SpotsPanel() {
  const disabled = useDevelopStore((s) => s.photo === null);
  const spots = useDevelopStore((s) => s.settings.spots);
  const selectedId = useDevelopStore((s) => s.selectedSpotId);
  const options = useDevelopStore((s) => s.spotOptions);
  const { setSpotOption, removeSpot, clearSpots, setInteracting } = useDevelopStore.getState();
  const selected = spots.find((sp) => sp.id === selectedId) ?? null;
  // A selected spot shows its own values.
  const shown = selected ? { mode: selected.mode, size: spotSize(selected.radius), feather: selected.feather, opacity: selected.opacity } : options;
  const full = spots.length >= MAX_SPOTS;
  const drag = { onDragStart: () => setInteracting(true), onDragEnd: () => setInteracting(false) };

  return (
    <>
      <p className={styles.hint}>
        {full ? `Up to ${MAX_SPOTS} spots per photo.` : 'Click a blemish or dust spot on the photo to remove it. Drag the dashed circle to choose another source.'}
      </p>
      <div className={`${controls.segmented} ${styles.paintMode}`} role="group" aria-label="Spot mode">
        {MODES.map((m) => (
          <button key={m.mode} type="button" className={controls.segment} aria-pressed={shown.mode === m.mode} title={m.title} disabled={disabled} onClick={() => setSpotOption('mode', m.mode)}>
            {m.label}
          </button>
        ))}
      </div>
      <SliderRow def={SPOT_SIZE_SLIDER} value={shown.size} disabled={disabled} onChange={(v) => setSpotOption('size', v)} {...drag} />
      <SliderRow def={SPOT_FEATHER_SLIDER} value={shown.feather} disabled={disabled} onChange={(v) => setSpotOption('feather', v)} {...drag} />
      <SliderRow def={SPOT_OPACITY_SLIDER} value={shown.opacity} disabled={disabled} onChange={(v) => setSpotOption('opacity', v)} {...drag} />
      {spots.length > 0 && (
        <div className={styles.tools}>
          <button type="button" className={`${controls.button} ${styles.tool}`} disabled={!selected} onClick={() => selected && removeSpot(selected.id)}>
            Delete spot
          </button>
          <button type="button" className={`${controls.button} ${styles.tool}`} onClick={clearSpots}>
            Clear all ({spots.length})
          </button>
        </div>
      )}
    </>
  );
}
