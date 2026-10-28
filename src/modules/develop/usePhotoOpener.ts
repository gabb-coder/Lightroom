import { useCallback, useState } from 'react';
import { loadPhotoFile } from '../../io/loadPhoto';
import { useDevelopStore } from '../../state/developStore';

/** Opens the first file of a selection or drop in Develop. */
export function usePhotoOpener() {
  const openPhoto = useDevelopStore((s) => s.openPhoto);
  const [error, setError] = useState<string | null>(null);

  const openFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      try {
        openPhoto(await loadPhotoFile(file));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not open ${file.name}.`);
      }
    },
    [openPhoto],
  );

  return { openFiles, error };
}
