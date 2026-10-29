import { useEffect, useRef } from 'react';
import { ACCEPT_ATTRIBUTE } from '../io/loadPhoto';
import { importAndSelect, registerImportInput } from '../state/importActions';

/** The app's one hidden file input; Import buttons open it via openImportPicker(). */
export function ImportInput() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    registerImportInput(ref.current);
    return () => registerImportInput(null);
  }, []);
  return (
    <input
      ref={ref}
      type="file"
      multiple
      accept={ACCEPT_ATTRIBUTE}
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="file-input"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        void importAndSelect(files);
      }}
    />
  );
}
