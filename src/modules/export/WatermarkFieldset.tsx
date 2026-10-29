import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import controls from '../../components/controls.module.css';
import { useThumbnailUrl } from '../../components/useThumbnailUrl';
import type { LogoRecord, PhotoRecord } from '../../db/db';
import { watermarkRect, WATERMARK_POSITIONS, type WatermarkPosition } from '../../engine/watermark';
import { WATERMARK_RANGES, type WatermarkOptions } from '../../model/exportOptions';
import { useExportStore } from '../../state/exportStore';
import { useLibraryStore } from '../../state/libraryStore';
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

/** Object URL for a stored logo, revoked when it changes. */
function useLogoUrl(logo: LogoRecord | null): string | null {
  const url = useMemo(() => (logo ? URL.createObjectURL(logo.blob) : null), [logo]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
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
function PositionPicker({ value, disabled, onChange }: { value: WatermarkPosition; disabled: boolean; onChange: (p: WatermarkPosition) => void }) {
  return (
    <div className={styles.positions} role="radiogroup" aria-label="Logo position">
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

/**
 * The selected photo's thumbnail with the logo where the export will put it,
 * using the same placement math (engine/watermark.ts). Display only.
 */
function Preview({ photo, logo, w }: { photo: PhotoRecord; logo: LogoRecord; w: WatermarkOptions }) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = useThumbnailUrl(photo, ref);
  const logoUrl = useLogoUrl(logo);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // Work in a large virtual image so whole-pixel rounding doesn't show at preview size.
  const rect = useMemo(() => {
    if (!size) return null;
    const scale = 4000 / Math.max(size.width, size.height);
    const image = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
    const r = watermarkRect(image, logo, w);
    return { left: r.x / image.width, top: r.y / image.height, width: r.width / image.width, height: r.height / image.height };
  }, [size, logo, w]);
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  const logoStyle: CSSProperties | undefined = rect
    ? { left: pct(rect.left), top: pct(rect.top), width: pct(rect.width), height: pct(rect.height), opacity: w.opacity / 100 }
    : undefined;
  return (
    <div ref={ref} className={styles.preview} data-testid="watermark-preview">
      {thumb && (
        <div className={styles.previewFrame} style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}>
          <img src={thumb} alt={`Preview of ${photo.fileName} with the logo`} onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
          {logoUrl && rect && <img className={styles.previewLogo} src={logoUrl} alt="" style={logoStyle} data-testid="watermark-preview-logo" />}
        </div>
      )}
    </div>
  );
}

/** Export dialog: a logo on every exported photo (M23), like Lightroom's watermark. */
export function WatermarkFieldset() {
  const w = useExportStore((s) => s.options.watermark);
  const setOptions = useExportStore((s) => s.setOptions);
  const { logos, error, load, add, remove } = useLogoStore();
  const photo = useLibraryStore((s) => s.photos.find((p) => p.id === s.selectedId) ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logo = logos.find((l) => l.id === w.logoId) ?? null;
  const off = !w.enabled;
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
          Add a logo
        </label>

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

        <span className={dialog.label}>Position</span>
        <PositionPicker value={w.position} disabled={off} onChange={(position) => set({ position })} />
        <Slider id="ex-wm-size" label="Size" value={w.size} range={WATERMARK_RANGES.size} unit="%" disabled={off} onChange={(size) => set({ size })} />
        <Slider id="ex-wm-opacity" label="Opacity" value={w.opacity} range={WATERMARK_RANGES.opacity} unit="%" disabled={off} onChange={(opacity) => set({ opacity })} />
        <Slider id="ex-wm-inset" label="Margin" value={w.inset} range={WATERMARK_RANGES.inset} unit="%" disabled={off} onChange={(inset) => set({ inset })} />
        {w.enabled && logo && photo && (
          <>
            <span className={dialog.label}>Preview</span>
            <Preview photo={photo} logo={logo} w={w} />
          </>
        )}
      </div>
    </fieldset>
  );
}
