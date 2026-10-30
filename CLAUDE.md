# CLAUDE.md

A browser-based, non-destructive Lightroom-style photo editor. Static site,
no backend, deployed to Render. The app is called Darkroom (`src/appName.ts`);
the mockups' "Darkslide" is a placeholder. The repo, package and Render
service keep the name `lightroom-web`.

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
- The user's standing instruction: after every change, once the checks
  above pass, open a pull request to `main` and merge it yourself (Render
  deploys `main`). Restart the work branch from `main` for the next change.
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
- EXIF (`io/exif.ts`): capture date plus camera, lens, ISO, shutter,
  aperture and focal length, read at import (thumbnail worker) into
  `PhotoRecord.exif`; `state/exifBackfill.ts` fills it for older photos.
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
- Metadata filters and keywords (M11): `LibraryFilter` also has camera,
  lens, ISO range, capture-date range (local days) and keyword; search
  words must each match the file name, camera, lens or a keyword
  (`model/organize.ts`). Keywords live on `PhotoRecord.keywords`
  (`model/keywords.ts` normalizes, case-insensitive). The filter-bar row
  must stay one line at 1440px (e2e checks it). V2 plan: `docs/V2_PLAN.md`.
- Collections (M12): `model/collections.ts`, DB v4 table `collections`
  (rows list photo ids; nothing about a collection ever deletes a photo).
  The catalog view can be `collection:<id>` (`visiblePhotos`); actions in
  `state/collectionActions.ts`; grid cells drag their selection onto a
  collection (`PHOTO_DRAG_TYPE`).
- Virtual copies and snapshots (M13): a copy is a `PhotoRecord` with
  `masterId`/`copyName`; it shares the master's original — always read
  originals through `getOriginal()` (db.ts), never `db.originals.get(id)`.
  `model/virtualCopy.ts`, `state/virtualCopyActions.ts`. Snapshots: DB v5
  table `snapshots` (per photo), `state/snapshotStore.ts`; applying one is
  `applySettings` (one history step).
- Library grid is virtualized (`modules/library/gridLayout.ts` math mirrors
  the CSS); keep cell heights explicit so the math stays exact.
- Geometry (M6): `engine/geometry.ts` maps output px -> source px (affine)
  with manual bilinear sampling; GPU pass 2 mirrors it exactly. Identity
  geometry is a 1-pass fast path and must stay pixel-exact. Crop editing
  math (fit to straighten, aspect presets, handles, rotate/flip) is in
  `model/crop.ts`; crop rect is normalized to the oriented image.
- Lens and perspective (M29): `Geometry` also has distortion, vertical,
  horizontal, scale and fringeRed/fringeBlue (`engine/geometry.ts`
  lensParams). They act in the ORIENTED image between the output→oriented
  affine (crop, straighten) and oriented→source (turns, flips):
  `geometryMap` → `outputToSource` / `sourceToOutput` (Newton inverse, used
  by `maskView` so masks, spots and the eyedropper stay aligned) and
  `sampleOutput`. With all at defaults the single geometry matrix is used
  as before (pixel-exact). GLSL `GEOMETRY_MAP_GLSL` is shared by the
  geometry and display passes (`Renderer.setGeometryMap`).
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
- Presence (M26): Texture, Clarity, Dehaze in Basic (`engine/presence.ts`),
  applied in the detail stage on the developed image. Each uses a "level":
  the image block-averaged so its long edge is ≤ 1024 (Texture) or ≤ 256
  (Clarity, Dehaze), Gaussian-blurred there (sigma relative to the photo, so
  proxies look the same) and sampled back bilinearly; luminance and dark
  channel are stored 16-bit in RGBA8 (`LEVEL_DOWN`/`LEVEL_BLUR` shaders,
  `Renderer.levelPasses`). Dehaze is a simplified dark-channel haze model.
  Plan for M26–M35: `docs/V4_PLAN.md`.
- Noise reduction (M27): Detail panel Luminance / Color (`engine/denoise.ts`),
  on the developed image BEFORE presence and sharpening (its own RGBA8
  result `denoised`). Luminance = separable bilateral on Y; Color =
  separable cross-bilateral on (R − Y, B − Y) guided by Y; row passes
  stored 16-bit (`DENOISE_*` shaders, `Renderer.denoisePasses`); spatial
  sigma in full-resolution pixels × render scale, like sharpening.
- Spot removal (M28): `settings.spots` (max 32; normalized to the uploaded
  photo, radius a fraction of its long edge, so they follow crop/rotate and
  proxies). `engine/spots.ts` retouches the ORIGINAL first (GPU
  `RETOUCH` pass into `retouched`, then develop as usual); every spot reads
  the original, clone copies, heal adds an inverse-distance-interpolated rim
  correction (24 directions). Editing math + automatic source pick in
  `model/spotEdit.ts`; overlay `SpotOverlay.tsx` while the Spot removal
  panel is open (Q; Esc deselects then closes). Presets and default copy
  panels leave spots alone, like masks.
- Color grading (M14): `engine/colorGrading.ts` runs after B&W (so it
  split-tones monochrome); zero-luma tint + gray offset on encoded values,
  weighted by shadows/midtones/highlights curves (pivot = balance, width =
  blending). Skipped when every wheel is neutral. Wheel math:
  `model/colorWheel.ts` (hue counter-clockwise from the right).
- Masks (M15): `settings.masks` (linear/radial, max 8) stored normalized to
  the uploaded photo, so they follow crop/rotate/flip. `engine/masks.ts`:
  per-pixel weight (source pixel space) and a local WB/exposure/tone/
  saturation blended after the global tone stage; GLSL in the develop pass
  (`MASKS_GLSL`). `processRgba8` takes the width to place masks. Editing
  math (source ↔ frame px through the geometry matrix) in
  `model/maskEdit.ts`; overlay `MaskOverlay.tsx` shows while the Masks panel
  is open (`masksOpen`); M / Shift+M pick a tool. Presets and the default
  copy panels leave masks alone (they belong to one picture).
- Zoom and Navigator (M16): `model/zoom.ts` (Fit / Fill / 1:1 = one photo
  px per device px, visible rect, scroll-for-center), `state/viewStore.ts`
  (zoom, visible rect, pan requests). `PhotoCanvas` pans in code
  (`overflow: hidden`, drag/wheel), click toggles 1:1 at the point, Z
  toggles; the crop tool always shows Fit. Navigator draws the renderer's
  small preview (display only). Improvement plan: `docs/V3_PLAN.md`.
- Catalog safety (M17): `io/zip.ts` (store-only ZIP writer/reader with
  ZIP64, CRC-checked), `model/backup.ts` (manifest format + validation;
  untrusted on restore), `state/catalogActions.ts` (backup, restore merges
  by id and never overwrites, `deletePhotos` removes every trace; a master
  takes its virtual copies). Delete key / "Remove from catalog…" asks first.
- Compatibility (M18): `src/compat.ts` (support check → `SupportBanner`);
  `render/exportRender.ts` is shared by the export worker and the
  main-thread fallback (`render/mainThreadExport.ts`, used when the worker
  can't do WebGL2, or with `?export=main`). Renderer scratch: blur target
  is RG8; `releaseScratch()` after exports. Manual cross-browser checklist:
  `docs/BROWSER_CHECKLIST.md` (only Chromium is automated).
- Logo watermark (M23): `ExportOptions.watermark` (logo id, 3×3 position,
  size % of width, opacity, margin % of the shorter side); like the export
  location it is a kept setting (`KEPT_KEYS` / `withKept`: presets don't
  change it). Logos live in DB v6 table `logos` (`state/logoStore.ts`;
  PNG/JPEG/WebP) and in backups. `engine/watermark.ts` (placement,
  premultiplied area/bilinear resampling, "over" compositing) runs on the
  final export pixels in `render/exportRender.ts`, after any resize; no
  GPU twin. The dialog preview uses the same `watermarkRect`.
  Text watermarks (M24, `watermark.kind: 'text'`, text/color/shadow):
  `render/textWatermark.ts` draws the line once in Inter on a transparent
  PNG (main thread, fonts loaded), which then goes through the exact logo
  path (export worker, preview).
  Clicking the preview enlarges it (portal over everything, Esc/click
  closes only it): the photo is re-rendered with its live edits at about
  screen size (`settingsSync.renderEditedPreview`, on the thumbnail
  client, no watermark) and the mark is overlaid with the same math.
  There the mark can be dragged or moved with the arrow keys (M25):
  `position: 'custom'` with `x`/`y` = fractions of the room between the
  margins (grid positions are 0, ½, 1, pixel-identical);
  `watermarkFractionsAt` inverts `watermarkRect`, `snapPlacement` snaps
  within 2% back onto a named grid position.
- Interface (M22): every shortcut is listed in `shortcuts/shortcutList.ts`
  (the `?` / top-bar dialog renders it; a unit test reads the handler
  sources and fails if a handled key is missing, so add new shortcuts
  there). Library panel sections use `CollapsibleSection` (open state in
  `state/sectionStore.ts`, remembered in uiPrefs). Phones: below 900px the
  columns stack (the Library grid keeps a min height), `pointer: coarse`
  enlarges sliders/buttons/headers, the photo lets vertical swipes scroll
  the page when nothing needs the gesture; e2e checks 390px for overflow.
- Mask tools (M21): `BrushMask` (strokes normalized to the photo + its
  `aspect`). `engine/brush.ts` rasterizes strokes on the CPU into an 8-bit
  map (long edge 1024) that the GPU gets as an R8 texture-array layer and
  samples with the same manual bilinear (`sampleBrush`); a per-mask cache
  redraws only the stroke being painted. `BrushRaster` serializes to a key
  so params stay cheap to compare. Shared GLSL `shapeWeight` (linear,
  radial, brush) serves the develop pass and the mask overlay (selected
  mask tinted in the display pass, O / "Show overlay"). Each stroke is one
  history step (Alt erases, K picks the brush); radial masks rotate with a
  handle (Shift: 15°) or the Angle slider.
- Editing aids (M20): `engine/display.ts` is a display-only pass (clipping
  overlay on pure white/black, split Before/After by column) run by the
  Renderer's display pass on RGBA8 textures, so GPU = CPU exactly; it is
  skipped when off (normal path unchanged) and never reaches exports or the
  histogram. Toggles live in `viewStore` (J, Y, histogram triangles). The
  Renderer caches the After/Before images so moving the divider only re-runs
  the display pass (the controller reuses the params object when unchanged).
  WB eyedropper (W, `developStore.wbPicking`) and Auto tone (Ctrl/Cmd+U) in
  `state/editingAids.ts`: they read the original's pixels (canvas 2D, for
  measuring only) and apply ONE history step; math in
  `engine/whiteBalance.ts` (`neutralizingWhiteBalance`) and
  `engine/autoTone.ts` (per-channel tables equal to the pipeline's stages).
- Formats (M19): import accepts JPEG/PNG/WebP/AVIF/HEIC (`io/loadPhoto.ts`
  `importTypeOf`, also by extension when the type is empty; HEIC only
  where the browser decodes it, otherwise its own message). Export
  destination (`ExportOptions.destination`: downloads / zip / folder, plus
  subfolder) is a location setting: presets keep it (`withLocation`) and
  changing it keeps the preset highlighted. `exportStore.runExport` picks
  the folder first (needs the click's gesture), then delivers per
  destination; a single photo never gets a ZIP. `io/folderAccess.ts` never
  overwrites (`name-2.ext`). e2e mocks `showDirectoryPicker`.
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
