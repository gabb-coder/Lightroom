import { useEffect, useRef, useState, type FormEvent } from 'react';
import controls from '../../components/controls.module.css';
import {
  BUILTIN_EXPORT_PRESETS,
  exportFileName,
  LONG_EDGE_RANGE,
  METADATA_LABELS,
  NAMING_LABELS,
  QUALITY_RANGE,
  type ExportNaming,
  type ExportPreset,
  type MetadataPolicy,
} from '../../model/exportOptions';
import { closeExportDialog, runExport, useExportStore } from '../../state/exportStore';
import { useLibraryStore } from '../../state/libraryStore';
import styles from './ExportDialog.module.css';

function PresetList() {
  const presetId = useExportStore((s) => s.presetId);
  const userPresets = useExportStore((s) => s.userPresets);
  const applyPreset = useExportStore((s) => s.applyPreset);
  const savePreset = useExportStore((s) => s.savePreset);
  const [naming, setNaming] = useState<string | null>(null);

  const item = (p: ExportPreset) => (
    <button key={p.id} type="button" className={styles.preset} aria-current={presetId === p.id ? 'true' : undefined} onClick={() => applyPreset(p)}>
      {p.name}
    </button>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (naming?.trim()) savePreset(naming);
    setNaming(null);
  };

  return (
    <div className={styles.presets} role="group" aria-label="Export presets">
      <div className={`group-label ${styles.presetsLabel}`}>Export presets</div>
      {BUILTIN_EXPORT_PRESETS.map(item)}
      {userPresets.map(item)}
      {naming === null ? (
        <button type="button" className={styles.savePreset} onClick={() => setNaming('')}>
          <span aria-hidden="true">+</span>Save as preset
        </button>
      ) : (
        <form className={styles.presetForm} onSubmit={submit}>
          <input
            className={styles.input}
            aria-label="Export preset name"
            placeholder="Preset name"
            value={naming}
            autoFocus
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setNaming(null);
              }
            }}
          />
        </form>
      )}
    </div>
  );
}

/** Used for the file-name example when no photo is selected. */
const EXAMPLE_PHOTO = { fileName: 'IMG_0418.jpg', captureDate: new Date(2023, 5, 14).getTime() };

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.grid}>{children}</div>
    </fieldset>
  );
}

function Settings() {
  const options = useExportStore((s) => s.options);
  const setOptions = useExportStore((s) => s.setOptions);
  const photo = useLibraryStore((s) => s.photos.find((p) => p.id === s.selectedId) ?? null);
  const example = exportFileName(options, photo ?? EXAMPLE_PHOTO, 1);
  const jpeg = options.format === 'jpeg';

  return (
    <div className={styles.settings}>
      <Fieldset legend="Location">
        <span className={styles.label}>Export to</span>
        <span className={styles.value} data-testid="export-destination">
          Browser downloads
        </span>
        <span />
        <span className={styles.hint}>Your browser decides where downloads are saved.</span>
      </Fieldset>

      <Fieldset legend="File naming">
        <label htmlFor="ex-name" className={styles.label}>
          Rename to
        </label>
        <select id="ex-name" className={styles.select} value={options.naming} onChange={(e) => setOptions({ naming: e.target.value as ExportNaming })}>
          {(Object.keys(NAMING_LABELS) as ExportNaming[]).map((n) => (
            <option key={n} value={n}>
              {NAMING_LABELS[n]}
            </option>
          ))}
        </select>
        {options.naming === 'custom' && (
          <>
            <label htmlFor="ex-custom" className={styles.label}>
              Custom name
            </label>
            <input id="ex-custom" className={styles.input} value={options.customName} onChange={(e) => setOptions({ customName: e.target.value })} />
          </>
        )}
        <span />
        <span className={styles.hint} data-testid="export-example">
          Example: {example}
        </span>
      </Fieldset>

      <Fieldset legend="File settings">
        <span className={styles.label}>Format</span>
        <div className={`${controls.segmented} ${styles.formats}`} role="group" aria-label="Format">
          {(['jpeg', 'png'] as const).map((f) => (
            <button key={f} type="button" className={`${controls.segment} ${styles.format}`} aria-pressed={options.format === f} onClick={() => setOptions({ format: f })}>
              {f === 'jpeg' ? 'JPEG' : 'PNG'}
            </button>
          ))}
        </div>
        <label htmlFor="ex-q" className={styles.label}>
          Quality
        </label>
        <div className={styles.quality}>
          <input
            id="ex-q"
            className={styles.range}
            type="range"
            min={QUALITY_RANGE.min}
            max={QUALITY_RANGE.max}
            value={options.quality}
            disabled={!jpeg}
            onChange={(e) => setOptions({ quality: Number(e.target.value) })}
          />
          <output htmlFor="ex-q" className={`num ${styles.qualityValue}`}>
            {jpeg ? options.quality : '—'}
          </output>
        </div>
        <label htmlFor="ex-cs" className={styles.label}>
          Color space
        </label>
        <select id="ex-cs" className={`${styles.select} ${styles.narrow}`} value="srgb" onChange={() => undefined}>
          <option value="srgb">sRGB</option>
        </select>
      </Fieldset>

      <Fieldset legend="Image sizing">
        <span />
        <label className={styles.check}>
          <input type="checkbox" checked={options.resize} onChange={(e) => setOptions({ resize: e.target.checked })} />
          Resize to fit
        </label>
        <span className={styles.label}>Fit</span>
        <div className={styles.fit}>
          <span className={styles.value}>Long edge</span>
          <label htmlFor="ex-px" className="visually-hidden">
            Long edge in pixels
          </label>
          <input
            id="ex-px"
            className={`num ${styles.input} ${styles.px}`}
            type="number"
            min={LONG_EDGE_RANGE.min}
            max={LONG_EDGE_RANGE.max}
            value={options.longEdge}
            disabled={!options.resize}
            onChange={(e) => setOptions({ longEdge: Number(e.target.value) })}
          />
          <span className={styles.hint}>px</span>
        </div>
      </Fieldset>

      <Fieldset legend="Metadata">
        <label htmlFor="ex-meta" className={styles.label}>
          Include
        </label>
        <select
          id="ex-meta"
          className={`${styles.select} ${styles.narrow}`}
          value={options.metadata}
          disabled={!jpeg}
          onChange={(e) => setOptions({ metadata: e.target.value as MetadataPolicy })}
        >
          {(Object.keys(METADATA_LABELS) as MetadataPolicy[]).map((m) => (
            <option key={m} value={m}>
              {METADATA_LABELS[m]}
            </option>
          ))}
        </select>
        {!jpeg && (
          <>
            <span />
            <span className={styles.hint}>PNG exports never include metadata.</span>
          </>
        )}
      </Fieldset>
    </div>
  );
}

/** Export dialog (design/Export.dc.html). Exports the focused photo. */
export function ExportDialog() {
  const hasPhoto = useLibraryStore((s) => s.selectedId !== null);
  const running = useExportStore((s) => s.job?.status === 'running');
  const dialogRef = useRef<HTMLDivElement>(null);
  const title = hasPhoto ? 'Export 1 photo' : 'No photo selected';

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      ref={dialogRef}
      className={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exp-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeExportDialog();
      }}
    >
      <div className={styles.header}>
        <h2 id="exp-title" className={styles.title}>
          {title}
        </h2>
        <button type="button" className={controls.iconButton} aria-label="Close" onClick={closeExportDialog}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        <PresetList />
        <Settings />
      </div>
      <div className={styles.footer}>
        <span className={styles.note}>Originals are never changed. Edits are applied at full resolution.</span>
        <div className={styles.spacer} />
        <button type="button" className={controls.button} onClick={closeExportDialog}>
          Cancel
        </button>
        <button type="button" className={`${controls.primary} ${styles.exportButton}`} disabled={!hasPhoto || running} onClick={() => void runExport()}>
          {hasPhoto ? 'Export 1 photo' : 'Export'}
        </button>
      </div>
    </div>
  );
}
