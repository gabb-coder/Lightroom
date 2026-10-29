# CLAUDE.md

A browser-based, non-destructive Lightroom-style photo editor. Static site,
no backend, deployed to Render. The UI name "Darkslide" is a placeholder from
the mockups; it lives only in `src/appName.ts`.

- `SPEC.md` is the source of truth for scope.
- `design/README.md` explains the mockups, tokens and expected behavior; read
  it first. `design/*.dc.html` are the mockups (Develop, Library, Export,
  Kit). They use a custom template format: read them for layout, sizes,
  colors, copy and behavior, never copy or run their code. They load Google
  Fonts; we don't.
- Where design and SPEC disagree on scope, follow SPEC and tell the user.
  Where they disagree on visuals, follow the design.

## Ground rules

- Work one milestone at a time. When a milestone's "Done when" checks pass,
  stop and report. Do not start the next milestone until the user says so.
- Before calling anything done, run
  `npm run typecheck && npm run lint && npm test` and make sure all three
  pass. Also run `npm run build` and make sure it succeeds, because the live
  site is built from it.
- Commit at the end of each milestone with a message like
  `M2: Basic panel, histogram, before/after`. Commit smaller steps in between
  when it helps. Never commit secrets or `.env` files.
- No new dependencies beyond the stack without asking first. Explain what it
  is for and why we can't write it ourselves.
- Never claim a visual result you haven't checked. Verify UI with a
  Playwright screenshot and look at it.
- Keep functions small and typed. No `any` unless a comment explains why.
- All color math lives in `src/engine/` as pure TypeScript functions with unit
  tests; shaders must match them. UI never touches WebGL directly.
- If something is ambiguous, pick the simplest reasonable option, write the
  assumption in the report, and keep going. Only stop to ask if a wrong guess
  would be expensive to undo.

## Stack

Vite + React 18 + TypeScript (strict), Zustand, Dexie, raw WebGL2 (no
three.js or image libraries), Vitest, Playwright, Web Workers with
OffscreenCanvas. Plain CSS with custom properties (CSS modules OK); no UI
component library.

## Architecture rules (summary)

- Originals are never modified. What's on screen is always original +
  `EditSettings` rendered by the pipeline.
- All color math lives in `src/engine/` as pure, unit-tested CPU reference
  functions; each WebGL2 stage must match its reference within ±2/255.
- UI never touches WebGL; components read/write `EditSettings` through the
  store and one renderer module subscribes to it.
- Nothing loads from another origin (COOP/COEP isolation). Fonts are
  self-hosted in `public/fonts/`.
- Canvas 2D / CSS filters are never used for the edits themselves.

## Code map

- `src/model/` EditSettings (v1, extends SPEC with treatment, grainSize,
  rotation) and slider definitions (ranges/steps/defaults from the design).
  `history.ts` (snapshots + cursor; same-key edits at the tip merge),
  `presets.ts` (presets replace everything except geometry; JSON format),
  `validate.ts` (`parseEditSettings` for any untrusted/stored settings).
- Copy / paste / sync (M10): `model/copySettings.ts` (panels, `pasteSettings`
  replaces whole panels; a pasted crop is re-fitted to the target photo).
  `state/settingsSync.ts` applies settings to photos as exactly ONE history
  step each (`applySettings` for the open photo, a stored-history push for
  the rest) and re-renders edited thumbnails of photos that aren't open
  through a second export-worker client. Paste targets: the open photo in
  Develop, every selected photo in Library; Sync: focused photo → the other
  selected ones. `state/copyPasteStore.ts` holds the session clipboard and
  the dialog (`components/SettingsDialog.tsx`). Batch export
  (`exportStore.runExport`) exports the selection in grid order, one file
  per photo, with `uniqueFileNames`.
- `src/state/developStore.ts`: every edit goes through `commit()` into the
  history; `settings` is always `history.entries[cursor].settings`. Use a
  stable history key per control (`basic.exposure`) so drags merge.
- `src/engine/` CPU reference: one file per stage + `pipeline.ts`.
  `pipelineParams()` maps settings to numbers used by BOTH CPU and GPU.
  Tone (contrast/highlights/shadows/whites/blacks) is a per-channel curve on
  q = x^(1/2.2) composed of individually monotonic parts; keep it that way.
- Histogram: computed from a 512px rendered copy after every render
  (`rendererController.ts`), never from the original.
- `src/db/db.ts` Dexie catalog: photos, originals (never modified),
  thumbnails (base + edited), edits (history per photo), presets. Anything
  read back goes through `parseEditSettings` / `parseStoredHistory`.
- `src/state/bootstrap.ts` starts the catalog services: liveQuery -> library
  store, photo session (selected photo -> Develop, only while Develop is open),
  debounced edit persistence (`flushEdits()`), edited-thumbnail updater.
- `src/workers/thumbnail.worker.ts` decode + EXIF date + JPEG thumbnails, and
  JPEG-encodes rendered previews for edited thumbnails.
- Organize (M5): `model/organize.ts` (filter/sort/filmstrip filter, pure),
  `model/selection.ts` (click/toggle/range). Lists come from memoized
  selectors `selectLibraryList` / `selectFilmstripList` — never build a new
  array inside a zustand selector. Ratings/flags/labels are catalog data
  written via `state/organizeActions.ts`, not edit history.
- Library grid is virtualized (`modules/library/gridLayout.ts` math mirrors
  the CSS); keep cell heights explicit so the math stays exact.
- Geometry (M6): `engine/geometry.ts` maps output px -> source px (affine)
  with manual bilinear sampling; GPU pass 2 mirrors it exactly. Identity
  geometry is a 1-pass fast path and must stay pixel-exact. Crop editing
  math (fit to straighten, aspect presets, handles, rotate/flip) is in
  `model/crop.ts`; crop rect is normalized to the oriented image.
- Tone curve / color mixer (M8): `engine/curve.ts` (monotone cubic spline,
  RGB curve composed with each channel into one 1024-entry RGBA32F table,
  sampled identically on CPU and GPU, applied on sRGB-encoded values) and
  `engine/hsl.ts` (8 hue centers, cos² cross-fade between neighbours so a
  range has zero effect at/after its neighbours' centers; scaled by
  saturation). Both stages are skipped when at defaults (pixel-exact).
  Curve editing rules: `model/curveEdit.ts`.
- Detail / effects (M9): `engine/sharpen.ts` (unsharp mask on luminance,
  separable Gaussian, sigma = radius × render scale; GPU stores the
  horizontal blur as 16-bit in RGBA8), `engine/grain.ts` (seeded value noise
  in full-resolution pixel coordinates, integer hash identical in GLSL) and
  `engine/vignette.ts` (post-crop: applied in output space in the geometry
  pass, so it follows the crop). GPU passes: develop → [blur → detail] →
  geometry + vignette; with nothing after color, develop renders straight to
  the output (pixel-exact fast path). Sharpening defaults to 0 (design shows
  40); catalog v3 migrates the old stored default (`model/migrate.ts`).
- Export (M7): `workers/export.worker.ts` runs the same `Renderer` on an
  OffscreenCanvas at full resolution (readPixels), resizes with the browser
  scaler only when asked, encodes, and copies EXIF per policy
  (`io/exifWrite.ts`). `state/exportStore.ts` runs jobs + the toast. The
  Export tab is a dialog over an inert Library view. DB v2 adds exportPresets.
- `src/render/shaders.ts` GLSL twin of each engine stage; `Renderer.ts` owns
  WebGL2; `rendererController.ts` is the only store->GPU bridge (rAF
  coalescing, proxy while `interacting`, full-res otherwise).
- `e2e/harness/` test-only page served by the Vite dev server (port 5174);
  `e2e/gpu.spec.ts` compares readPixels output with the CPU reference
  (±2/255). Set `LOG_GPU_DIFF=1` to print the max differences.

## UI conventions

- Tokens live in `src/styles/tokens.css`; shared buttons/segmented controls in
  `src/components/controls.module.css`. Use tokens, not raw hex, in new CSS.
- Module layout (`src/modules/layout.module.css`) mirrors the mockups: side
  panels with fixed flex bases, center with flex-grow 999, wrap below 900px.
- Controls from later milestones are rendered disabled until they work, so
  the shell keeps the design's layout.

## Commands

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run typecheck` / `npm run lint` / `npm test` / `npm run test:e2e`

E2E tests run against `vite preview` on port 4173 (built first). Playwright
is pinned to the version of the pre-installed Chromium. WebGL runs on
SwiftShader in headless tests, so it is slow: use `smallPhotoPng` for tests
that render many times, and `test.slow()` for long loops. Pixel comparisons
use canvas screenshots (`canvasPixels`), which hide overlay badges.
Each test gets a fresh browser context, so IndexedDB starts empty. No
fake-indexeddb in unit tests: DB behavior is covered by e2e tests.
