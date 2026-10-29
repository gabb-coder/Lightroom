import { useState, type DragEvent } from 'react';
import { importAndSelect } from '../state/importActions';

/** Drag-and-drop handlers that import dropped files. `dragOver` drives the highlight. */
export function useFileDrop() {
  const [dragOver, setDragOver] = useState(false);
  return {
    dragOver,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        void importAndSelect(Array.from(e.dataTransfer.files));
      },
    },
  };
}
