import { useEffect, useRef, useState, type FormEvent } from 'react';
import controls from '../../components/controls.module.css';
import {
  BUILTIN_EXPORT_PRESETS,
  DESTINATION_LABELS,
  exportFileName,
  LONG_EDGE_RANGE,
  METADATA_LABELS,
  NAMING_LABELS,
  OUTPUT_SHARPEN_LABELS,
  SHARPEN_AMOUNT_LABELS,
  QUALITY_RANGE,
  type ExportDestination,
  type ExportNaming,
  type ExportPreset,
  type MetadataPolicy,
} from '../../model/exportOptions';
import type { OutputSharpenAmount, OutputSharpenTarget } from '../../engine/outputSharpen';
import { closeExportDialog, runExport, useExportStore } from '../../state/exportStore';
import { supportsFolderExport } from '../../io/folderAccess';
import { useLibraryStore } from '../../state/libraryStore';
import styles from './ExportDialog.module.css';
import { WatermarkFieldset } from './WatermarkFieldset';

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

const DESTINATIONS: readonly ExportDestination[] = supportsFolderExport() ? ['downloads', 'zip', 'folder'] : ['downloads', 'zip'];

function locationHint(destination: ExportDestination, folderName: string | null): string {
  if (destination === 'downloads') return 'Your browser decides where downloads are saved.';
  if (destination === 'zip') return 'Several photos download as one ZIP; a single photo downloads as is.';
  return folderName ? `Saving into “${folderName}”. Existing files are never replaced.` : 'You’ll be asked for a folder when you export.';
}

function Location() {
  const options = useExportStore((s) => s.options);
  const setOptions = useExportStore((s) => s.setOptions);
  const folder = useExportStore((s) => s.folder);
  const chooseFolder = useExportStore((s) => s.chooseFolder);
  const destination = DESTINATIONS.includes(options.destination) ? options.destination : 'zip';
  // Downloads can't go into subfolders; a ZIP or a chosen folder can.
  const canSubfolder = destination !== 'downloads';
  const choose = () => {
    void chooseFolder().then((picked) => picked && setOptions({ destination: 'folder' }));
  };

  return (
    <Fieldset legend="Location">
      <label htmlFor="ex-dest" className={styles.label}>
        Export to
      </label>
      <div className={styles.dest}>
        <select id="ex-dest" className={styles.select} value={destination} onChange={(e) => setOptions({ destination: e.target.value as ExportDestination })}>
          {DESTINATIONS.map((d) => (
            <option key={d} value={d}>
              {DESTINATION_LABELS[d]}
            </option>
          ))}
        </select>
        {DESTINATIONS.includes('folder') && (
          <button type="button" className={controls.button} onClick={choose}>
            Choose…
          </button>
        )}
      </div>
      <span />
      <span className={styles.hint} data-testid="export-destination">
        {locationHint(destination, folder?.name ?? null)}
      </span>
      <span />
      <label className={styles.check}>
        <input type="checkbox" checked={options.useSubfolder && canSubfolder} disabled={!canSubfolder} onChange={(e) => setOptions({ useSubfolder: e.target.checked })} />
        Put in subfolder
      </label>
      <label htmlFor="ex-sub" className={styles.label}>
        Subfolder name
      </label>
      <input
        id="ex-sub"
        className={styles.input}
        value={options.subfolder}
        disabled={!canSubfolder || !options.useSubfolder}
        onChange={(e) => setOptions({ subfolder: e.target.value })}
      />
    </Fieldset>
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
      <Location />

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

      <Fieldset legend="Output sharpening">
        <label htmlFor="ex-sharpen" className={styles.label}>
          Sharpen for
        </label>
        <select
          id="ex-sharpen"
          className={`${styles.select} ${styles.narrow}`}
          value={options.outputSharpen}
          onChange={(e) => setOptions({ outputSharpen: e.target.value as OutputSharpenTarget })}
        >
          {(Object.keys(OUTPUT_SHARPEN_LABELS) as OutputSharpenTarget[]).map((t) => (
            <option key={t} value={t}>
              {OUTPUT_SHARPEN_LABELS[t]}
            </option>
          ))}
        </select>
        <label htmlFor="ex-sharpen-amount" className={styles.label}>
          Amount
        </label>
        <select
          id="ex-sharpen-amount"
          className={`${styles.select} ${styles.narrow}`}
          value={options.sharpenAmount}
          disabled={options.outputSharpen === 'none'}
          onChange={(e) => setOptions({ sharpenAmount: e.target.value as OutputSharpenAmount })}
        >
          {(Object.keys(SHARPEN_AMOUNT_LABELS) as OutputSharpenAmount[]).map((a) => (
            <option key={a} value={a}>
              {SHARPEN_AMOUNT_LABELS[a]}
            </option>
          ))}
        </select>
      </Fieldset>

      <WatermarkFieldset />

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

const photoCount = (n: number) => `Export ${n} ${n === 1 ? 'photo' : 'photos'}`;

/** Export dialog (design/Export.dc.html). Exports every selected photo. */
export function ExportDialog() {
  const count = useLibraryStore((s) => s.selection.ids.length);
  const hasPhoto = count > 0;
  const running = useExportStore((s) => s.job?.status === 'running');
  const dialogRef = useRef<HTMLDivElement>(null);
  const title = hasPhoto ? photoCount(count) : 'No photo selected';

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
          {hasPhoto ? photoCount(count) : 'Export'}
        </button>
      </div>
    </div>
  );
}
