import { useEffect, useMemo, useRef, useState } from 'react';
import { orientedSize, outputSize } from '../../engine/geometry';
import { displayGeometry } from '../../model/crop';
import { containSize } from '../../hooks/fitSize';
import { useElementSize } from '../../hooks/useElementSize';
import { attachRenderer } from '../../render/rendererController';
import { selectShowingBefore, useDevelopStore, type LoadedPhoto } from '../../state/developStore';
import { CropOverlay } from './CropOverlay';
import styles from './PhotoCanvas.module.css';

/**
 * Shows the rendered photo fitted to the stage. The canvas is handed to the
 * renderer module; this component never touches WebGL itself.
 */
export function PhotoCanvas({ photo }: { photo: LoadedPhoto }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useElementSize(areaRef);
  const showingBefore = useDevelopStore(selectShowingBefore);
  const cropping = useDevelopStore((s) => s.cropping);
  const geometry = useDevelopStore((s) => s.settings.geometry);
  const shown = useMemo(
    () => outputSize(photo, displayGeometry(geometry, { before: showingBefore, cropping })),
    [photo, geometry, showingBefore, cropping],
  );
  const fit = containSize(area, shown.width / shown.height);
  const showOverlay = cropping && !showingBefore;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return attachRenderer(canvas, setError);
  }, []);

  return (
    <div ref={areaRef} className={styles.area}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <div className={styles.frame} style={{ width: fit.width, height: fit.height }}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            role="img"
            aria-label={`Edited photo: ${photo.name}`}
            data-testid="photo-canvas"
          />
          {showOverlay && <CropOverlay oriented={orientedSize(photo, geometry.rotation)} />}
          {showingBefore && (
            <div className={styles.beforeBadge} data-testid="before-badge">
              Before
            </div>
          )}
        </div>
      )}
    </div>
  );
}
