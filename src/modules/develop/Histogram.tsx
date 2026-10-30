import { clipIndicatorColor, clipShares } from '../../engine/display';
import { histogramPath, histogramPeak, type Histogram as HistogramData } from '../../engine/histogram';
import { useDevelopStore } from '../../state/developStore';
import { useHistogramStore } from '../../state/histogramStore';
import { useViewStore } from '../../state/viewStore';
import styles from './DevelopRightPanel.module.css';

const W = 268;
const H = 84;
const CHANNELS = [
  { key: 'r', color: '#d9534f' },
  { key: 'g', color: '#5cb85c' },
  { key: 'b', color: '#4a7fe0' },
] as const;

const CLIP_BUTTONS = {
  shadows: { label: 'Show shadow clipping', path: 'M0 10L10 0V10Z' },
  highlights: { label: 'Show highlight clipping', path: 'M0 0L10 10H0Z' },
} as const;

/**
 * A clipping triangle (M20): its color shows which channels clip at that end
 * (gray when none); pressing it paints clipped pixels on the photo. J toggles both.
 */
function ClipButton({ end, histogram }: { end: 'shadows' | 'highlights'; histogram: HistogramData | null }) {
  const pressed = useViewStore((s) => (end === 'shadows' ? s.clipShadows : s.clipHighlights));
  const toggleClip = useViewStore((s) => s.toggleClip);
  const hasPhoto = useDevelopStore((s) => s.photo !== null);
  const color = histogram ? clipIndicatorColor(clipShares(histogram, end)) : null;
  const { label, path } = CLIP_BUTTONS[end];
  return (
    <button
      type="button"
      className={`${styles.clipButton} ${end === 'shadows' ? styles.clipShadows : styles.clipHighlights}`}
      aria-label={label}
      aria-pressed={pressed}
      title={`${label} (J)`}
      disabled={!hasPhoto}
      data-clipping={color ? 'yes' : 'no'}
      style={color ? { color } : undefined}
      onClick={() => toggleClip(end)}
    >
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d={path} />
      </svg>
    </button>
  );
}

/** RGB values (0–255) of the rendered photo under the pointer (M32), from the small rendered copy. */
function PixelReadout() {
  const hover = useViewStore((s) => s.hover);
  const image = useHistogramStore((s) => s.image);
  if (!hover || !image || hover.x < 0 || hover.y < 0 || hover.x >= 1 || hover.y >= 1) return null;
  const x = Math.min(image.width - 1, Math.floor(hover.x * image.width));
  const y = Math.min(image.height - 1, Math.floor(hover.y * image.height));
  const i = (y * image.width + x) * 4;
  if ((image.data[i + 3] ?? 0) === 0) return null; // outside the straightened photo
  return (
    <div className={`num ${styles.readout}`} data-testid="pixel-readout" aria-live="off">
      R {image.data[i]} G {image.data[i + 1]} B {image.data[i + 2]}
    </div>
  );
}

/** Live RGB histogram of the rendered image (design/Develop.dc.html). */
export function Histogram() {
  const histogram = useHistogramStore((s) => s.histogram);
  const peak = histogram ? histogramPeak(histogram) : 1;
  return (
    <section className={styles.histogram} aria-label="Histogram">
      <div className={styles.histBox} data-testid="histogram">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={histogram ? 'Histogram of the edited photo' : 'Histogram (no photo)'}
        >
          <path d="M0 21H268M0 42H268M0 63H268M67 0V84M134 0V84M201 0V84" stroke="#262626" strokeWidth="1" />
          {histogram &&
            CHANNELS.map(({ key, color }) => (
              <path key={key} data-channel={key} d={histogramPath(histogram[key], peak, W, H)} fill={color} opacity={0.5} />
            ))}
        </svg>
        <ClipButton end="shadows" histogram={histogram} />
        <ClipButton end="highlights" histogram={histogram} />
        <PixelReadout />
      </div>
    </section>
  );
}
