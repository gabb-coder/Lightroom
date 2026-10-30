import { useEffect, useRef } from 'react';
import { useLibraryStore } from '../state/libraryStore';
import { previewUrl, screenLongEdge, usePreviewUrl } from '../state/previewCache';
import { exitBrowserFullscreen } from '../state/viewerActions';
import { SLIDE_SECONDS, useViewerStore } from '../state/viewerStore';
import controls from './controls.module.css';
import styles from './Viewer.module.css';

/**
 * Full screen (F) and slideshow (Ctrl/Cmd+Enter), M31: one photo at a time
 * with its edits, on black. ← → step, Space plays / pauses the slideshow,
 * Esc (or leaving the browser's full screen) closes.
 */
export function PhotoViewer() {
  const mode = useViewerStore((s) => s.mode);
  const ids = useViewerStore((s) => s.ids);
  const index = useViewerStore((s) => s.index);
  const playing = useViewerStore((s) => s.playing);
  const seconds = useViewerStore((s) => s.seconds);
  const { close, step, setPlaying, setSeconds } = useViewerStore.getState();
  const photos = useLibraryStore((s) => s.photos);
  const photo = photos.find((p) => p.id === ids[index]) ?? null;
  const edge = screenLongEdge();
  const url = usePreviewUrl(photo, edge);
  const ref = useRef<HTMLDivElement>(null);
  const slideshow = mode === 'slideshow';

  useEffect(() => {
    if (mode) ref.current?.focus();
  }, [mode]);

  // Have the next photo ready.
  useEffect(() => {
    if (!mode || ids.length < 2) return;
    const next = photos.find((p) => p.id === ids[(index + 1) % ids.length]);
    if (next) void previewUrl(next, edge);
  }, [mode, ids, index, photos, edge]);

  useEffect(() => {
    if (!slideshow || !playing) return;
    const timer = window.setTimeout(() => step(1), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [slideshow, playing, seconds, index, step]);

  // Leaving the browser's full screen (its own Esc) closes the viewer too.
  useEffect(() => {
    if (!mode) return;
    const onChange = () => {
      if (!document.fullscreenElement) useViewerStore.getState().close();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [mode]);

  if (!mode) return null;
  const end = () => {
    exitBrowserFullscreen();
    close();
  };
  return (
    <div
      ref={ref}
      className={styles.viewer}
      role="dialog"
      aria-modal="true"
      aria-label={slideshow ? 'Slideshow' : 'Full screen'}
      tabIndex={-1}
      data-testid="photo-viewer"
      data-index={index}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key.toLowerCase() === 'f' && !slideshow)) end();
        else if (e.key === 'ArrowRight') step(1);
        else if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === ' ' && slideshow) setPlaying(!playing);
        else return;
        e.preventDefault();
      }}
    >
      <div className={styles.stage}>
        {url ? <img key={url} src={url} alt={photo ? `${photo.fileName}, edited` : ''} data-testid="viewer-image" /> : <span className={styles.loading}>Rendering…</span>}
      </div>
      <div className={styles.bar}>
        <span className={styles.name}>{photo?.fileName}</span>
        <span className="num" data-testid="viewer-position">
          {index + 1} / {ids.length}
        </span>
        <div className={styles.spacer} />
        <button type="button" className={controls.button} onClick={() => step(-1)} disabled={ids.length < 2} aria-label="Previous photo">
          ←
        </button>
        {slideshow && (
          <>
            <button type="button" className={controls.button} onClick={() => setPlaying(!playing)}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <label>
              <span className="visually-hidden">Seconds per photo</span>
              <select aria-label="Seconds per photo" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                {SLIDE_SECONDS.map((s) => (
                  <option key={s} value={s}>
                    {s} s
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button type="button" className={controls.button} onClick={() => step(1)} disabled={ids.length < 2} aria-label="Next photo">
          →
        </button>
        <button type="button" className={controls.button} onClick={end}>
          Close
        </button>
      </div>
    </div>
  );
}
