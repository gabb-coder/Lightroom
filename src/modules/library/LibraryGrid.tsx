import { memo, useCallback, useEffect, useMemo, useRef, useState, type UIEvent, type DragEvent } from 'react';
import { EditedIcon } from '../../components/EditedBadge';
import { PhotoThumb } from '../../components/PhotoThumb';
import { useElementSize } from '../../hooks/useElementSize';
import type { PhotoRecord } from '../../db/db';
import { LabelDot, PickedBadge, RatingText, RejectedBadge } from '../../components/OrganizeBadges';
import type { ClickModifiers } from '../../model/selection';
import { PHOTO_DRAG_TYPE } from '../../state/collectionActions';
import { isMacPlatform } from '../../shortcuts/platform';
import { useAppStore } from '../../state/appStore';
import { useLibraryStore } from '../../state/libraryStore';
import { GRID_GAP, GRID_PADDING, gridMetrics, rowTop, visibleRows, type GridMetrics } from './gridLayout';
import styles from './LibraryGrid.module.css';

interface CellProps {
  photo: PhotoRecord;
  number: number;
  selected: boolean;
  metrics: GridMetrics;
  onPick: (id: string, mods: ClickModifiers) => void;
}

const MAC = isMacPlatform();

/** Dragging a selected photo drags the whole selection; an unselected one drags just itself (onto a collection). */
function startPhotoDrag(e: DragEvent, id: string): void {
  const { selection } = useLibraryStore.getState();
  const ids = selection.ids.includes(id) ? selection.ids : [id];
  e.dataTransfer.setData(PHOTO_DRAG_TYPE, JSON.stringify(ids));
  e.dataTransfer.effectAllowed = 'copy';
}

const GridCell = memo(function GridCell({ photo, number, selected, metrics, onPick }: CellProps) {
  const select = useLibraryStore((s) => s.select);
  const setModule = useAppStore((s) => s.setModule);
  return (
    <button
      type="button"
      className={styles.cell}
      style={{ height: metrics.rowHeight }}
      aria-pressed={selected}
      aria-label={photo.fileName}
      data-testid="grid-cell"
      data-flag={photo.flag ?? 'none'}
      onClick={(e) => onPick(photo.id, { toggle: MAC ? e.metaKey : e.ctrlKey, range: e.shiftKey })}
      draggable
      onDragStart={(e) => startPhotoDrag(e, photo.id)}
      onDoubleClick={() => {
        select(photo.id);
        setModule('develop');
      }}
    >
      <span className={`num ${styles.cellHeader}`}>
        <span>{number}</span>
        <span className={styles.fileName}>{photo.fileName}</span>
      </span>
      <span className={styles.cellThumb}>
        <PhotoThumb photo={photo} dimmed={photo.flag === 'reject'} />
      </span>
      <span className={styles.cellFooter}>
        <RatingText rating={photo.rating} className={styles.rating} />
        <span className={styles.spacer} />
        {photo.edited && <EditedIcon />}
        {photo.flag === 'pick' && <PickedBadge />}
        {photo.flag === 'reject' && <RejectedBadge />}
        {photo.colorLabel && <LabelDot label={photo.colorLabel} />}
      </span>
    </button>
  );
});

/**
 * Virtualized photo grid (design/Library.dc.html). Only rows near the
 * viewport are in the DOM, so hundreds of photos scroll at full frame rate.
 */
export function LibraryGrid({ photos }: { photos: readonly PhotoRecord[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(scrollRef);
  const cellMin = useLibraryStore((s) => s.thumbSize);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const selection = useLibraryStore((s) => s.selection);
  const clickPhoto = useLibraryStore((s) => s.clickPhoto);
  const order = useMemo(() => photos.map((p) => p.id), [photos]);
  const selectedIds = useMemo(() => new Set(selection.ids), [selection]);
  const onPick = useCallback((id: string, mods: ClickModifiers) => clickPhoto(id, mods, order), [clickPhoto, order]);
  const contentWidth = Math.max(0, size.width - GRID_PADDING * 2);
  const metrics = useMemo(() => gridMetrics(contentWidth, cellMin), [contentWidth, cellMin]);
  const [scrollTop, setScrollTop] = useState(0);
  const window = visibleRows(photos.length, metrics, scrollTop, size.height);
  const windowKey = useRef('');

  const onScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const top = e.currentTarget.scrollTop;
      const w = visibleRows(photos.length, metrics, top, e.currentTarget.clientHeight);
      const key = `${w.firstRow}:${w.lastRow}`;
      // Re-render only when the set of rendered rows changes.
      if (key !== windowKey.current) {
        windowKey.current = key;
        setScrollTop(top);
      }
    },
    [photos.length, metrics],
  );

  // Keep the selected photo in view (arrow keys, filmstrip).
  useEffect(() => {
    const el = scrollRef.current;
    const index = photos.findIndex((p) => p.id === selectedId);
    if (!el || index < 0 || metrics.columns === 0) return;
    const top = rowTop(Math.floor(index / metrics.columns), metrics);
    if (top < el.scrollTop) el.scrollTop = top - GRID_PADDING;
    else if (top + metrics.rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + metrics.rowHeight - el.clientHeight + GRID_PADDING;
  }, [selectedId, photos, metrics]);

  const rows = [];
  for (let row = window.firstRow; row < window.lastRow; row++) {
    const items = photos.slice(row * metrics.columns, (row + 1) * metrics.columns);
    rows.push(
      <div
        key={row}
        role="presentation"
        className={styles.row}
        style={{
          transform: `translateY(${rowTop(row, metrics)}px)`,
          gridTemplateColumns: `repeat(${metrics.columns}, ${metrics.cellWidth}px)`,
          columnGap: GRID_GAP,
        }}
      >
        {items.map((photo, i) => (
          <GridCell
            key={photo.id}
            photo={photo}
            number={row * metrics.columns + i + 1}
            selected={selectedIds.has(photo.id)}
            metrics={metrics}
            onPick={onPick}
          />
        ))}
      </div>,
    );
  }

  return (
    <div ref={scrollRef} className={styles.scroll} onScroll={onScroll} data-testid="library-grid">
      <div className={styles.content} style={{ height: window.totalHeight }} role="list" aria-label="Photos">
        {size.width > 0 && rows}
      </div>
    </div>
  );
}
