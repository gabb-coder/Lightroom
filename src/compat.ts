/**
 * Browser support check (M18). Darkroom needs a few modern features; when
 * one is missing the app says so plainly instead of failing somewhere deep.
 * `checkSupport` is pure (tested with fake environments); `detectSupport`
 * reads the real browser.
 */

export interface SupportEnvironment {
  indexedDB: boolean;
  webgl2: boolean;
  workers: boolean;
  createImageBitmap: boolean;
  /** Blob.arrayBuffer / Blob.slice (reading photos and backups). */
  blobReading: boolean;
  /** navigator.storage.persist (asking the browser to keep the catalog). */
  persistentStorage: boolean;
  /** OffscreenCanvas with 2D (thumbnails are made in a worker). */
  offscreenCanvas: boolean;
  /** WebGL 2 on an OffscreenCanvas (exports render in a worker; without it, on the page). */
  offscreenWebgl2: boolean;
}

export interface SupportReport {
  /** Darkroom can't work without these. */
  missing: string[];
  /** It works, with these limits. */
  limits: string[];
}

export function checkSupport(env: SupportEnvironment): SupportReport {
  const missing: string[] = [];
  const limits: string[] = [];
  if (!env.indexedDB) missing.push('IndexedDB (to keep your photos and edits; it may be blocked in private browsing)');
  if (!env.webgl2) missing.push('WebGL 2 (to render edits on the graphics card)');
  if (!env.workers) missing.push('Web Workers');
  if (!env.createImageBitmap) missing.push('createImageBitmap (to decode photos)');
  if (!env.blobReading) missing.push('reading files (Blob.arrayBuffer)');
  if (!env.offscreenCanvas) missing.push('OffscreenCanvas (to make thumbnails in the background)');
  else if (!env.offscreenWebgl2) limits.push('Exports render on the page, so the app pauses briefly while each photo exports.');
  if (!env.persistentStorage) limits.push('This browser can’t be asked to keep the catalog; back it up regularly.');
  return { missing, limits };
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

function hasOffscreenWebGL2(): boolean {
  try {
    if (typeof OffscreenCanvas === 'undefined') return false;
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

export function detectSupport(): SupportEnvironment {
  return {
    indexedDB: typeof indexedDB !== 'undefined',
    webgl2: hasWebGL2(),
    workers: typeof Worker !== 'undefined',
    createImageBitmap: typeof createImageBitmap === 'function',
    blobReading: typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer === 'function' && typeof Blob.prototype.slice === 'function',
    persistentStorage: typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype.convertToBlob === 'function',
    offscreenWebgl2: hasOffscreenWebGL2(),
  };
}
