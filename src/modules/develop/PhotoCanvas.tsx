import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { orientedSize, outputSize } from '../../engine/geometry';
import { displayGeometry } from '../../model/crop';
import { maskView } from '../../model/maskEdit';
import { pickWhiteBalance } from '../../state/editingAids';
import { containSize } from '../../hooks/fitSize';
import { useElementSize } from '../../hooks/useElementSize';
import { displaySize, FULL_VIEW, rectCenter, scrollForCenter, visibleRect, zoomScale } from '../../model/zoom';
import { attachRenderer } from '../../render/rendererController';
import { selectShowingBefore, useDevelopStore, type LoadedPhoto } from '../../state/developStore';
import { useViewStore } from '../../state/viewStore';
import { CropOverlay } from './CropOverlay';
import { MaskOverlay } from './MaskOverlay';
import { SplitDivider } from './SplitDivider';
import styles from './PhotoCanvas.module.css';

/** Pointer travel (px) below which a press counts as a click, not a pan. */
const CLICK_SLOP = 3;

interface Pan {
  x: number;
  y: number;
  left: number;
  top: number;
  moved: boolean;
}

/**
 * Shows the rendered photo on the stage at the current zoom (M16): fitted,
 * filling the stage, or 1:1 (one photo pixel per device pixel). When the
 * photo is larger than the stage, drag or scroll to pan; click toggles 1:1
 * at the clicked point. The canvas is handed to the renderer module; this
 * component never touches WebGL itself.
 */
export function PhotoCanvas({ photo }: { photo: LoadedPhoto }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pan = useRef<Pan | null>(null);
  const lastPhotoId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stage = useElementSize(areaRef);
  const showingBefore = useDevelopStore(selectShowingBefore);
  const cropping = useDevelopStore((s) => s.cropping);
  const geometry = useDevelopStore((s) => s.settings.geometry);
  const masksOpen = useDevelopStore((s) => s.masksOpen);
  const wbPicking = useDevelopStore((s) => s.wbPicking);
  const split = useViewStore((s) => s.split);
  const zoom = useViewStore((s) => (cropping ? 'fit' : s.zoom));
  const panToken = useViewStore((s) => s.panToken);
  const shownGeometry = useMemo(() => displayGeometry(geometry, { before: showingBefore, cropping }), [geometry, showingBefore, cropping]);
  const shown = useMemo(() => outputSize(photo, shownGeometry), [photo, shownGeometry]);
  const display = zoom === 'fit' ? containSize(stage, shown.width / shown.height) : displaySize(shown, zoomScale(zoom, stage, shown, window.devicePixelRatio || 1));
  const pannable = display.width > stage.width + 0.5 || display.height > stage.height + 0.5;
  const showOverlay = cropping && !showingBefore;
  const showMasks = masksOpen && !cropping && !showingBefore && !wbPicking;
  const showSplit = split && !cropping && !showingBefore;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return attachRenderer(canvas, setError);
  }, []);

  // Keep the requested point centered when the zoom, photo or stage changes, or a pan is requested.
  useEffect(() => {
    const area = areaRef.current;
    if (!area || display.width === 0) return;
    // A different photo starts centered.
    if (lastPhotoId.current !== photo.id) {
      lastPhotoId.current = photo.id;
      useViewStore.setState({ panTarget: { x: 0.5, y: 0.5 } });
    }
    const target = useViewStore.getState().panTarget;
    const s = scrollForCenter(stage, display, target);
    area.scrollLeft = s.left;
    area.scrollTop = s.top;
    report();
    // display/stage are recomputed every render; their sizes are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, panToken, photo.id, display.width, display.height, stage.width, stage.height]);

  /** Publishes the visible part (Navigator) and remembers its center for the next zoom change. */
  function report() {
    const area = areaRef.current;
    if (!area) return;
    const visible = display.width ? visibleRect(stage, display, area.scrollLeft, area.scrollTop) : FULL_VIEW;
    useViewStore.getState().setVisible(visible);
    useViewStore.setState({ panTarget: rectCenter(visible) });
  }

  const scrollBy = (dx: number, dy: number) => {
    const area = areaRef.current;
    if (!area) return;
    area.scrollLeft += dx;
    area.scrollTop += dy;
    report();
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button === 0 && wbPicking) {
      // Eyedropper: frame px → normalized photo point, through the shown geometry.
      const box = e.currentTarget.getBoundingClientRect();
      const p = maskView(photo, shownGeometry, display).fromFrame(e.clientX - box.left, e.clientY - box.top);
      pickWhiteBalance(p.x, p.y);
      return;
    }
    if (e.button !== 0 || cropping || showMasks) return;
    const area = areaRef.current;
    if (!area) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, left: area.scrollLeft, top: area.scrollTop, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    const area = areaRef.current;
    if (!p || !area) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP) p.moved = true;
    if (!p.moved || !pannable) return;
    area.scrollLeft = p.left - (e.clientX - p.x);
    area.scrollTop = p.top - (e.clientY - p.y);
    report();
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    pan.current = null;
    if (!p || p.moved) return;
    // A click: toggle 1:1 centered on the clicked point.
    const box = e.currentTarget.getBoundingClientRect();
    useViewStore.getState().toggleZoom({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height });
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (pannable) scrollBy(e.deltaX, e.deltaY);
  };

  const frameLeft = Math.max(0, (stage.width - display.width) / 2);
  const frameTop = Math.max(0, (stage.height - display.height) / 2);
  const cursor = wbPicking ? 'crosshair' : cropping || showMasks ? undefined : zoom === '1:1' ? (pannable ? 'grab' : 'zoom-out') : 'zoom-in';

  return (
    <div ref={areaRef} className={styles.area} onWheel={onWheel} data-testid="photo-stage" data-zoom={zoom}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <div className={styles.scroller} style={{ width: Math.max(stage.width, display.width), height: Math.max(stage.height, display.height) }}>
          <div
            className={styles.frame}
            style={{ left: frameLeft, top: frameTop, width: display.width, height: display.height, cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (pan.current = null)}
          >
            <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={`Edited photo: ${photo.name}`} data-testid="photo-canvas" />
            {showOverlay && <CropOverlay oriented={orientedSize(photo, geometry.rotation)} />}
            {showMasks && display.width > 0 && <MaskOverlay source={photo} frame={display} />}
            {showSplit && display.width > 0 && <SplitDivider />}
            {showingBefore && (
              <div className={styles.beforeBadge} data-testid="before-badge">
                Before
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
