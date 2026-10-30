import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { PhotoRecord } from '../db/db';
import { useLibraryStore } from '../state/libraryStore';
import { fullLongEdge, screenLongEdge, usePreviewUrl } from '../state/previewCache';
import { stepCandidate } from '../state/viewerActions';
import { useViewerStore } from '../state/viewerStore';
import controls from './controls.module.css';
import styles from './Viewer.module.css';

type Zoom = 'fit' | '1:1';

/** What both panes look at: the zoom and, at 1:1, the photo point at the pane's center (0–1). */
interface Look {
  zoom: Zoom;
  cx: number;
  cy: number;
}

/** One photo of the comparison. At 1:1 one photo pixel is one device pixel, centered on the shared point. */
function Pane({ photo, label, look, onPan }: { photo: PhotoRecord; label: string; look: Look; onPan: (dx: number, dy: number, w: number, h: number) => void }) {
  const url = usePreviewUrl(photo, look.zoom === '1:1' ? fullLongEdge(photo) : screenLongEdge());
  const fitUrl = usePreviewUrl(photo, screenLongEdge());
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dpr = window.devicePixelRatio || 1;
  const w = photo.width / dpr;
  const h = photo.height / dpr;
  const clampOffset = (pane: number, size: number, c: number) => (size <= pane ? (pane - size) / 2 : Math.min(0, Math.max(pane - size, pane / 2 - c * size)));
  const style = look.zoom === '1:1' ? { width: w, height: h, left: clampOffset(box.width, w, look.cx), top: clampOffset(box.height, h, look.cy) } : undefined;
  // Until the full-size render arrives, show the screen-size one (stretched) so the pane isn't empty.
  const shown = look.zoom === '1:1' ? (url ?? fitUrl) : url;

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (look.zoom !== '1:1' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    onPan(e.clientX - d.x, e.clientY - d.y, w, h);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  return (
    <div
      ref={ref}
      className={styles.pane}
      data-zoom={look.zoom}
      data-testid="compare-pane"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <span className={styles.paneLabel}>
        {label}: {photo.fileName}
      </span>
      {shown ? <img src={shown} alt={`${label}: ${photo.fileName}`} style={style} draggable={false} data-testid="compare-image" data-sharp={look.zoom !== '1:1' || url !== null ? 'true' : 'false'} /> : <span className={styles.loading}>Rendering…</span>}
    </div>
  );
}

/**
 * Compare (C, M31): the select and a candidate side by side. Z or the button
 * toggles 1:1 for both; dragging either pans both. ← → pick another
 * candidate, Swap makes the candidate the select. Esc closes.
 */
export function CompareView() {
  const compare = useViewerStore((s) => s.compare);
  const { swap, closeCompare } = useViewerStore.getState();
  const photos = useLibraryStore((s) => s.photos);
  const select = photos.find((p) => p.id === compare?.select) ?? null;
  const candidate = photos.find((p) => p.id === compare?.candidate) ?? null;
  const [look, setLook] = useState<Look>({ zoom: 'fit', cx: 0.5, cy: 0.5 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compare) ref.current?.focus();
  }, [compare]);

  if (!compare || !select || !candidate) return null;
  const toggleZoom = () => setLook((l) => ({ ...l, zoom: l.zoom === 'fit' ? '1:1' : 'fit' }));
  const pan = (dx: number, dy: number, w: number, h: number) =>
    setLook((l) => ({ ...l, cx: Math.min(1, Math.max(0, l.cx - dx / w)), cy: Math.min(1, Math.max(0, l.cy - dy / h)) }));
  return (
    <div
      ref={ref}
      className={styles.viewer}
      role="dialog"
      aria-modal="true"
      aria-label="Compare"
      tabIndex={-1}
      data-testid="compare-view"
      data-zoom={look.zoom}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key.toLowerCase() === 'c') closeCompare();
        else if (e.key.toLowerCase() === 'z') toggleZoom();
        else if (e.key === 'ArrowRight') stepCandidate(1);
        else if (e.key === 'ArrowLeft') stepCandidate(-1);
        else return;
        e.preventDefault();
      }}
    >
      <div className={styles.panes}>
        <Pane photo={select} label="Select" look={look} onPan={pan} />
        <Pane photo={candidate} label="Candidate" look={look} onPan={pan} />
      </div>
      <div className={styles.bar}>
        <span>← → another candidate</span>
        <div className={styles.spacer} />
        <button type="button" className={controls.button} aria-pressed={look.zoom === '1:1'} onClick={toggleZoom}>
          {look.zoom === '1:1' ? 'Fit' : '1:1'}
        </button>
        <button type="button" className={controls.button} onClick={swap} title="Make the candidate the select">
          Swap
        </button>
        <button type="button" className={controls.button} onClick={closeCompare}>
          Close
        </button>
      </div>
    </div>
  );
}
