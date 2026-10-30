import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Every file under `dir`, as site paths ("/fonts/Inter.woff2"). */
function publicFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? publicFiles(path) : [`/${relative('public', path).split('\\').join('/')}`];
  });
}

/**
 * Builds dist/sw.js (M33) from scripts/service-worker.js with the list of
 * every built and public file, and a version that changes with them, so the
 * app can be installed and start offline.
 */
function serviceWorker(): Plugin {
  return {
    name: 'darkroom-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map'));
      const files = ['/', ...built.map((f) => `/${f}`), ...publicFiles('public')].sort();
      const version = createHash('sha256').update(files.join('\n')).update(Object.values(bundle).map((b) => ('code' in b ? b.code : String(b.source))).join('')).digest('hex').slice(0, 12);
      const source = readFileSync('scripts/service-worker.js', 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/**
 * Cross-origin isolation headers. These must match the `/*` headers in
 * render.yaml so local dev/preview behave like production.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
