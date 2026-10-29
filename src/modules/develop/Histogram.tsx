import { histogramPath, histogramPeak } from '../../engine/histogram';
import { useHistogramStore } from '../../state/histogramStore';
import styles from './DevelopRightPanel.module.css';

const W = 268;
const H = 84;
const CHANNELS = [
  { key: 'r', color: '#d9534f' },
  { key: 'g', color: '#5cb85c' },
  { key: 'b', color: '#4a7fe0' },
] as const;

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
      </div>
    </section>
  );
}
