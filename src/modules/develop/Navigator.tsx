import { useEffect, useRef, type PointerEvent } from 'react';
import controls from '../../components/controls.module.css';
import { containSize } from '../../hooks/fitSize';
import { useElementSize } from '../../hooks/useElementSize';
import { ZOOM_MODES } from '../../model/zoom';
import { useDevelopStore } from '../../state/developStore';
import { usePreviewStore } from '../../state/previewStore';
import { useViewStore } from '../../state/viewStore';
import styles from './DevelopLeftPanel.module.css';

/**
 * Navigator (design/Develop.dc.html): the whole photo, the visible part
 * outlined when zoomed in. Click or drag in it to pan (from Fit, a click
 * zooms to 1:1 there). The thumbnail is the renderer's latest small copy,
 * drawn for display only.
 */
export function Navigator() {
  const zoom = useViewStore((s) => s.zoom);
  const visible = useViewStore((s) => s.visible);
  const preview = usePreviewStore((s) => s.preview);
  const photoId = useDevelopStore((s) => s.photo?.id ?? null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useElementSize(boxRef);
  const image = preview && preview.photoId === photoId ? preview.image : null;
  const fit = image ? containSize(box, image.width / image.height) : { width: 0, height: 0 };
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  }, [image]);

  const panAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const center = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    const view = useViewStore.getState();
    if (view.zoom === 'fit') view.setZoom('1:1', center);
    else view.panTo(center);
  };

  return (
    <section className={styles.navigator} aria-label="Navigator">
      <div className={styles.navHeader}>
        <span className={styles.title}>Navigator</span>
        <div className={controls.segmented} role="group" aria-label="Zoom">
          {ZOOM_MODES.map((z) => (
            <button
              key={z.id}
              type="button"
              className={controls.segment}
              aria-pressed={zoom === z.id}
              disabled={!photoId}
              onClick={() => useViewStore.getState().setZoom(z.id)}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={boxRef} className={styles.navPreview} data-testid="navigator-preview">
        {image && (
          <div
            className={styles.navImage}
            style={{ width: fit.width, height: fit.height }}
            data-testid="navigator-image"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragging.current = true;
              panAt(e);
            }}
            onPointerMove={(e) => dragging.current && panAt(e)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <canvas ref={canvasRef} className={styles.navCanvas} aria-hidden="true" />
            {zoom !== 'fit' && (visible.w < 1 || visible.h < 1) && (
              <div
                className={styles.navRect}
                data-testid="navigator-rect"
                style={{ left: `${visible.x * 100}%`, top: `${visible.y * 100}%`, width: `${visible.w * 100}%`, height: `${visible.h * 100}%` }}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
