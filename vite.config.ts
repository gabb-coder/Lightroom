import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Cross-origin isolation headers. These must match the `/*` headers in
 * render.yaml so local dev/preview behave like production.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
