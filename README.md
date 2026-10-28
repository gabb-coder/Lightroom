# Lightroom Web

A browser-based, Lightroom-style, non-destructive photo editor with a Library module (organize
photos) and a Develop module (edit photos). It is a static web app with no
backend: photos, edits and presets stay in the browser (IndexedDB) and are
never uploaded. The name shown in the app, "Darkslide", is a placeholder
from the design mockups; change it in `src/appName.ts`.

Stack: Vite, React 18, TypeScript (strict), Zustand, Dexie, raw WebGL2,
Vitest, Playwright.

## Development

Requires Node 20+.

```bash
npm install
```

```bash
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright tests against the production build |

The dev and preview servers send the same cross-origin isolation headers as
production (see `vite.config.ts`), so `window.crossOriginIsolated` is `true`
locally too. Because of those headers, every font, script and image must be
served from this site; nothing may load from a CDN.

The Inter font is self-hosted in `public/fonts/` under the SIL Open Font
License (`public/fonts/OFL.txt`).

## Deploy to Render

The app deploys to [Render](https://render.com) as a **static site**. Render
runs the build and serves `dist/`; there is no server in production. The
settings live in the `render.yaml` Blueprint at the repo root.

1. **Push to GitHub.** Push this repo, including `render.yaml`, to the `main`
   branch.
2. **Create the site in Render.** In the Render Dashboard choose
   **New > Blueprint**, pick this repo, and confirm. Render reads
   `render.yaml` and creates the `lightroom-web` static site with:
   - Build command: `npm ci && npm run build`
   - Publish directory: `dist`
   - Auto-deploy: on every commit to `main`
   - Response headers: `Cross-Origin-Opener-Policy: same-origin` and
     `Cross-Origin-Embedder-Policy: require-corp` on `/*`, plus
     `X-Content-Type-Options`, `Referrer-Policy`, long-lived caching for
     `/assets/*`, and `no-cache` for `index.html`.

   If you prefer **New > Static Site** instead, enter the build command and
   publish directory above, then add the same headers under the site's
   **Settings > Headers** (Render keeps Dashboard header rules that aren't in
   the Blueprint).
3. **Check that the headers are live.** Open the deployed site, open the
   browser DevTools console, and run:

   ```js
   crossOriginIsolated
   ```

   It should print `true`. If it prints `false`, check the response headers
   of the page in the DevTools Network tab for the two `Cross-Origin-*`
   headers.

No rewrite rules are needed: Library / Develop / Export are app state, not
URLs.
