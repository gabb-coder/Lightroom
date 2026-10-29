/** Human-readable file size: "834 KB", "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const trimNumber = (v: number, digits: number) => String(Number(v.toFixed(digits)));

/** Shutter speed: "1/125 s" below a second (1/x rounded), "2.5 s" otherwise. */
export function formatExposureTime(seconds: number): string {
  if (seconds < 1) {
    const denominator = Math.round(1 / seconds);
    // 1/1.3 s and the like: show the decimal instead of a misleading "1/1".
    return denominator <= 1 ? `${trimNumber(seconds, 1)} s` : `1/${denominator} s`;
  }
  return `${trimNumber(seconds, 1)} s`;
}

/** Aperture: "f/8", "f/2.8". */
export function formatFNumber(f: number): string {
  return `f/${trimNumber(f, 1)}`;
}

/** "1/125 s at f/8" (design/Library.dc.html), or whichever part is known; null if neither. */
export function formatExposure(exposureTime: number | null | undefined, fNumber: number | null | undefined): string | null {
  const parts = [exposureTime ? formatExposureTime(exposureTime) : null, fNumber ? formatFNumber(fNumber) : null].filter((p): p is string => p !== null);
  return parts.length ? parts.join(' at ') : null;
}

/** Focal length: "35 mm", "4.3 mm". */
export function formatFocalLength(mm: number): string {
  return `${trimNumber(mm, 1)} mm`;
}

/** Local date and time, e.g. "14 Jun 2023, 18:42". */
export function formatDateTime(epochMs: number, locale?: string): string {
  return new Date(epochMs).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
