import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import controls from '../../components/controls.module.css';
import { useThumbnailUrl } from '../../components/useThumbnailUrl';
import type { LogoRecord, PhotoRecord } from '../../db/db';
import {
  placementFractions,
  snapPlacement,
  watermarkFractionsAt,
  watermarkRect,
  WATERMARK_POSITIONS,
  type WatermarkAnchor,
  type WatermarkPosition,
} from '../../engine/watermark';
import { MAX_WATERMARK_TEXT, WATERMARK_RANGES, type WatermarkKind, type WatermarkOptions } from '../../model/exportOptions';
import { renderTextWatermark } from '../../render/textWatermark';
import { useExportStore } from '../../state/exportStore';
import { useLibraryStore } from '../../state/libraryStore';
import { renderEditedPreview } from '../../state/settingsSync';
import { LOGO_ACCEPT, useLogoStore } from '../../state/logoStore';
import dialog from './ExportDialog.module.css';
import styles from './WatermarkFieldset.module.css';

const POSITION_LABELS: Readonly<Record<WatermarkPosition, string>> = {
  'top-left': 'Top left',
  top: 'Top',
  'top-right': 'Top right',
  left: 'Left',
  center: 'Center',
  right: 'Right',
  'bottom-left': 'Bottom left',
  bottom: 'Bottom',
  'bottom-right': 'Bottom right',
};

interface WatermarkImage {
  url: string;
  width: number;
  height: number;
}

/** Object URL for a blob, revoked when it changes. */
function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

/** The text drawn the way the export draws it (render/textWatermark.ts), or null. */
function useTextImage(w: WatermarkOptions): { blob: Blob; width: number; height: number } | null {
  const [image, setImage] = useState<{ blob: Blob; width: number; height: number } | null>(null);
  const { kind, text, textColor, textShadow } = w;
  useEffect(() => {
    if (kind !== 'text') return;
    let current = true;
    void renderTextWatermark({ text, textColor, textShadow }).then((img) => current && setImage(img));
    return () => {
      current = false;
    };
  }, [kind, text, textColor, textShadow]);
  return kind === 'text' && text.trim() ? image : null;
}

/** What the watermark looks like: the chosen logo or the drawn text. */
function useWatermarkImage(w: WatermarkOptions, logo: LogoRecord | null): WatermarkImage | null {
  const text = useTextImage(w);
  const source = w.kind === 'text' ? text : logo;
  const url = useObjectUrl(source?.blob ?? null);
  return source && url ? { url, width: source.width, height: source.height } : null;
}

function Slider({ id, label, value, range, unit, disabled, onChange }: {
  id: string;
  label: string;
  value: number;
  range: { min: number; max: number };
  unit: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <>
      <label htmlFor={id} className={dialog.label}>
        {label}
      </label>
      <div className={dialog.quality}>
        <input id={id} className={dialog.range} type="range" min={range.min} max={range.max} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
        <output htmlFor={id} className={`num ${styles.sliderValue}`}>
          {value}
          {unit}
        </output>
      </div>
    </>
  );
}

/** 3 × 3 grid of positions. */
function PositionPicker({ value, disabled, onChange }: { value: WatermarkAnchor; disabled: boolean; onChange: (p: WatermarkPosition) => void }) {
  return (
    <div className={styles.positions} role="radiogroup" aria-label="Watermark position">
      {WATERMARK_POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          className={styles.position}
          aria-checked={value === p}
          aria-label={POSITION_LABELS[p]}
          title={POSITION_LABELS[p]}
          disabled={disabled}
          onClick={() => onChange(p)}
        >
          <span aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

type Size = { width: number; height: number };

/** Where a dragged watermark goes (engine/watermark.ts `snapPlacement`). */
type Placement = Pick<WatermarkOptions, 'position' | 'x' | 'y'>;

/** Dragging within this share of the free room of a grid position lands on it. */
const SNAP = 0.02;

/** A large virtual copy of an image of `size`, so whole-pixel rounding doesn't show at preview size. */
function virtualImage(size: Size): Size {
  const scale = 4000 / Math.max(size.width, size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

/** Where the watermark sits on an image of `size`, as fractions of it (same math as the export). */
function useMarkFractions(size: Size | null, mark: WatermarkImage, w: WatermarkOptions) {
  return useMemo(() => {
    if (!size) return null;
    const image = virtualImage(size);
    const r = watermarkRect(image, mark, w);
    return { left: r.x / image.width, top: r.y / image.height, width: r.width / image.width, height: r.height / image.height };
  }, [size, mark, w]);
}

/** Arrow keys move a watermark by 2% of its free room (Shift: 10%). */
function nudged(e: KeyboardEvent<HTMLElement>, w: WatermarkOptions): Placement | null {
  const step = e.shiftKey ? 0.1 : 0.02;
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const move = moves[e.key];
  if (!move) return null;
  const f = placementFractions(w);
  return snapPlacement(f.x + move[0], f.y + move[1], 1e-6);
}

/**
 * A photo with the watermark laid over it where the export will put it.
 * Display only, except that with `onPlace` the watermark can be dragged
 * (or moved with the arrow keys) to a new spot.
 */
function MarkedImage({ src, alt, mark, w, className, testId, onPlace }: {
  src: string;
  alt: string;
  mark: WatermarkImage;
  w: WatermarkOptions;
  className: string | undefined;
  testId: string;
  onPlace?: (p: Placement) => void;
}) {
  const [size, setSize] = useState<Size | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null);
  const rect = useMarkFractions(size, mark, w);
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  const logoStyle: CSSProperties | undefined = rect
    ? { left: pct(rect.left), top: pct(rect.top), width: pct(rect.width), height: pct(rect.height), opacity: w.opacity / 100 }
    : undefined;
  const frameStyle = size ? ({ aspectRatio: `${size.width} / ${size.height}`, '--aspect': size.width / size.height } as CSSProperties) : undefined;

  const startDrag = (e: PointerEvent<HTMLImageElement>) => {
    if (!size || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = watermarkRect(virtualImage(size), mark, w);
    drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, left: r.x, top: r.y };
  };
  const moveDrag = (e: PointerEvent<HTMLImageElement>) => {
    const d = drag.current;
    const frame = frameRef.current;
    if (!d || d.pointer !== e.pointerId || !size || !frame || !onPlace) return;
    const image = virtualImage(size);
    const scale = image.width / frame.getBoundingClientRect().width;
    const f = watermarkFractionsAt(image, mark, w, d.left + (e.clientX - d.x) * scale, d.top + (e.clientY - d.y) * scale);
    onPlace(snapPlacement(f.x, f.y, SNAP));
  };
  const endDrag = (e: PointerEvent<HTMLImageElement>) => {
    if (drag.current?.pointer === e.pointerId) drag.current = null;
  };

  return (
    <div ref={frameRef} className={className} style={frameStyle} onClick={onPlace ? (e) => e.stopPropagation() : undefined}>
      <img src={src} alt={alt} onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
      {rect && !onPlace && <img className={styles.previewLogo} src={mark.url} alt="" style={logoStyle} data-testid={testId} />}
      {rect && onPlace && (
        <img
          className={`${styles.previewLogo} ${styles.movable}`}
          src={mark.url}
          alt=""
          role="button"
          tabIndex={0}
          aria-label="Watermark: drag or use the arrow keys to move it"
          title="Drag to move"
          draggable={false}
          style={logoStyle}
          data-testid={testId}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => {
            const p = nudged(e, w);
            if (!p) return;
            e.preventDefault();
            onPlace(p);
          }}
        />
      )}
    </div>
  );
}

/** Long edge of the enlarged preview's render: about the screen's size in device pixels. */
function zoomLongEdge(): number {
  return Math.min(2048, Math.ceil(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1)));
}

/** The last sharp render, kept for reopening; replaced (and its URL revoked) when the photo or its edits change. */
let sharpRender: { key: string; url: Promise<string | null> } | null = null;

function sharpUrl(photoId: string, key: string, longEdge: number): Promise<string | null> {
  if (sharpRender?.key !== key) {
    const old = sharpRender;
    const url = renderEditedPreview(photoId, longEdge)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    sharpRender = { key, url };
    void old?.url.then((u) => u && URL.revokeObjectURL(u));
  }
  return sharpRender.url;
}

/** The photo rendered with its edits at about screen size, or null while that runs (the thumbnail is too small to enlarge). */
function useSharpImage(photo: PhotoRecord): string | null {
  const [longEdge] = useState(zoomLongEdge);
  const key = `${photo.id}:${photo.thumbVersion}:${longEdge}`;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    let current = true;
    void sharpUrl(photo.id, key, longEdge).then((url) => current && url && setLoaded({ key, url }));
    return () => {
      current = false;
    };
  }, [photo.id, key, longEdge]);
  return loaded?.key === key ? loaded.url : null;
}

/** The preview filling the window: click anywhere or press Esc to close. */
function PreviewZoom({ photo, thumb, mark, w, onPlace, onClose }: {
  photo: PhotoRecord;
  thumb: string;
  mark: WatermarkImage;
  w: WatermarkOptions;
  onPlace: (p: Placement) => void;
  onClose: () => void;
}) {
  const sharp = useSharpImage(photo);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return createPortal(
    <div className={styles.zoomScrim} onClick={onClose}>
      <div
        className={styles.zoom}
        role="dialog"
        aria-modal="true"
        aria-label="Watermark preview"
        data-testid="watermark-zoom"
        data-sharp={sharp ? 'true' : 'false'}
        onKeyDown={(e) => {
          // Keep the Export dialog open, and focus inside this view.
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            const stops = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[tabindex="0"], button'));
            const at = stops.indexOf(document.activeElement as HTMLElement);
            stops[(at + (e.shiftKey ? stops.length - 1 : 1)) % stops.length]?.focus();
          }
        }}
      >
        <MarkedImage src={sharp ?? thumb} alt={`${photo.fileName} with the watermark, enlarged`} mark={mark} w={w} className={styles.zoomFrame} testId="watermark-zoom-logo" onPlace={onPlace} />
        <div className={styles.zoomBar}>
          <span>{sharp ? 'Drag the watermark to move it. Esc or a click outside the photo closes.' : 'Rendering a sharper preview…'}</span>
          <button ref={closeRef} type="button" className={controls.iconButton} aria-label="Close preview" onClick={onClose}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The selected photo's thumbnail with the watermark where the export will
 * put it, using the same placement math (engine/watermark.ts). Display only.
 * Clicking it shows it enlarged.
 */
function Preview({ photo, mark, w, onPlace }: { photo: PhotoRecord; mark: WatermarkImage; w: WatermarkOptions; onPlace: (p: Placement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const thumb = useThumbnailUrl(photo, ref);
  const [zoomed, setZoomed] = useState(false);
  const close = () => {
    setZoomed(false);
    buttonRef.current?.focus();
  };
  return (
    <div ref={ref} className={styles.preview} data-testid="watermark-preview">
      {thumb && (
        <button ref={buttonRef} type="button" className={styles.previewButton} aria-label="Enlarge the watermark preview" title="Click to enlarge; drag the watermark there to move it" onClick={() => setZoomed(true)}>
          <MarkedImage src={thumb} alt={`Preview of ${photo.fileName} with the watermark`} mark={mark} w={w} className={styles.previewFrame} testId="watermark-preview-logo" />
          <span className={styles.enlargeIcon} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9" />
            </svg>
          </span>
        </button>
      )}
      {zoomed && thumb && <PreviewZoom photo={photo} thumb={thumb} mark={mark} w={w} onPlace={onPlace} onClose={close} />}
    </div>
  );
}

const KINDS: readonly { kind: WatermarkKind; label: string }[] = [
  { kind: 'logo', label: 'Logo' },
  { kind: 'text', label: 'Text' },
];

/** Text, color and shadow for a text watermark (M24). */
function TextFields({ w, off, set }: { w: WatermarkOptions; off: boolean; set: (patch: Partial<WatermarkOptions>) => void }) {
  return (
    <>
      <label htmlFor="ex-wm-text" className={dialog.label}>
        Text
      </label>
      <input
        id="ex-wm-text"
        className={dialog.input}
        value={w.text}
        maxLength={MAX_WATERMARK_TEXT}
        placeholder="© Your Name"
        disabled={off}
        onChange={(e) => set({ text: e.target.value })}
      />
      <label htmlFor="ex-wm-color" className={dialog.label}>
        Color
      </label>
      <div className={styles.logoRow}>
        <input id="ex-wm-color" className={styles.color} type="color" value={w.textColor} disabled={off} onChange={(e) => set({ textColor: e.target.value })} />
        <label className={dialog.check}>
          <input type="checkbox" checked={w.textShadow} disabled={off} onChange={(e) => set({ textShadow: e.target.checked })} />
          Shadow
        </label>
      </div>
    </>
  );
}

/** Choose, add or remove the logo (M23). */
function LogoFields({ w, logo, off, set }: { w: WatermarkOptions; logo: LogoRecord | null; off: boolean; set: (patch: Partial<WatermarkOptions>) => void }) {
  const { logos, error, add, remove } = useLogoStore();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <label htmlFor="ex-logo" className={dialog.label}>
        Logo
      </label>
      <div className={styles.logoRow}>
        <select id="ex-logo" className={dialog.select} value={w.logoId ?? ''} disabled={off || logos.length === 0} onChange={(e) => set({ logoId: e.target.value || null })}>
          {logos.length === 0 && <option value="">No logo yet</option>}
          {logos.length > 0 && !logo && <option value="">Choose a logo</option>}
          {logos.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="button" className={controls.button} disabled={off} onClick={() => fileRef.current?.click()}>
          Add logo…
        </button>
        {logo && (
          <button type="button" className={controls.iconButton} aria-label={`Remove logo ${logo.name}`} title="Remove this logo" disabled={off} onClick={() => void remove(logo.id)}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={LOGO_ACCEPT}
          hidden
          data-testid="logo-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void add(file);
          }}
        />
      </div>
      {error && (
        <>
          <span />
          <span className={styles.error} role="alert">
            {error}
          </span>
        </>
      )}
      {!error && w.enabled && !logo && (
        <>
          <span />
          <span className={dialog.hint}>Add a PNG with a transparent background for the cleanest result.</span>
        </>
      )}
    </>
  );
}

/** Export dialog: a logo (M23) or a line of text (M24) on every exported photo, like Lightroom's watermark. */
export function WatermarkFieldset() {
  const w = useExportStore((s) => s.options.watermark);
  const setOptions = useExportStore((s) => s.setOptions);
  const { logos, load } = useLogoStore();
  const photo = useLibraryStore((s) => s.photos.find((p) => p.id === s.selectedId) ?? null);
  const logo = logos.find((l) => l.id === w.logoId) ?? null;
  const mark = useWatermarkImage(w, logo);
  const off = !w.enabled;
  const isText = w.kind === 'text';
  const set = (patch: Partial<WatermarkOptions>) => setOptions({ watermark: { ...w, ...patch } });

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <fieldset className={dialog.fieldset}>
      <legend className={dialog.legend}>Watermark</legend>
      <div className={dialog.grid}>
        <span />
        <label className={dialog.check}>
          <input type="checkbox" checked={w.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Add a watermark
        </label>

        <span className={dialog.label}>Type</span>
        <div className={`${controls.segmented} ${styles.kinds}`} role="group" aria-label="Watermark type">
          {KINDS.map(({ kind, label }) => (
            <button key={kind} type="button" className={controls.segment} aria-pressed={w.kind === kind} disabled={off} onClick={() => set({ kind })}>
              {label}
            </button>
          ))}
        </div>

        {isText && <TextFields w={w} off={off} set={set} />}
        {isText && w.enabled && !w.text.trim() && (
          <>
            <span />
            <span className={dialog.hint}>Type the text to put on your photos, like “© Your Name”.</span>
          </>
        )}

        {!isText && <LogoFields w={w} logo={logo} off={off} set={set} />}

        <span className={dialog.label}>Position</span>
        <PositionPicker value={w.position} disabled={off} onChange={(position) => set({ position, ...placementFractions({ ...w, position }) })} />
        {w.position === 'custom' && (
          <>
            <span />
            <span className={dialog.hint}>Custom spot, dragged in the enlarged preview. Pick a square to snap it back.</span>
          </>
        )}
        <Slider id="ex-wm-size" label="Size" value={w.size} range={WATERMARK_RANGES.size} unit="%" disabled={off} onChange={(size) => set({ size })} />
        <Slider id="ex-wm-opacity" label="Opacity" value={w.opacity} range={WATERMARK_RANGES.opacity} unit="%" disabled={off} onChange={(opacity) => set({ opacity })} />
        <Slider id="ex-wm-inset" label="Margin" value={w.inset} range={WATERMARK_RANGES.inset} unit="%" disabled={off} onChange={(inset) => set({ inset })} />
        {w.enabled && mark && photo && (
          <>
            <span className={dialog.label}>Preview</span>
            <Preview photo={photo} mark={mark} w={w} onPlace={set} />
          </>
        )}
      </div>
    </fieldset>
  );
}
