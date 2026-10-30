import { defineConfig, devices } from '@playwright/test';

const PREVIEW_PORT = 4173;
export const DEV_PORT = 5174;

const CHROMIUM = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  // Headless Chromium has no GPU; allow WebGL2 on SwiftShader.
  launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
};

// App tests run against the production build served by `vite preview`, so
// they exercise the same headers and bundles that ship to Render. The GPU
// harness (e2e/harness) is test-only and is served by the dev server.
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PREVIEW_PORT}`,
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: /@perf/,
      use: CHROMIUM,
    },
    {
      // Timing tests (titles tagged @perf) run after everything else, so other
      // tests don't share the CPU while they measure frame times.
      name: 'performance',
      grep: /@perf/,
      dependencies: ['chromium'],
      fullyParallel: false,
      use: CHROMIUM,
    },
  ],
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}/e2e/harness/gpu.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
