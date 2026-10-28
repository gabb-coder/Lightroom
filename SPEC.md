# Lightroom-style Photo Editor: Spec for Claude Code

A browser-based, non-destructive photo editor and library. Develop module first, Library second.

## Working agreement (copy into CLAUDE.md)
- Build one milestone at a time. Do not start the next until the current one's "Done when" checks pass.
- Run `npm run typecheck && npm test` before calling anything done.
- All color math lives in `src/engine/` as pure TypeScript functions with unit tests. Shaders must match these CPU reference functions within a small tolerance.
- UI must never touch WebGL directly. It reads and writes the edit settings object only.
- No new dependencies without asking. Keep the stack below.
- Verify visual work with a Playwright screenshot, not by assumption.

## Stack
- Vite + React + TypeScript
- Zustand (state), Dexie (IndexedDB catalog)
- Raw WebGL2 for the render pipeline (no three.js)
- Vitest (unit), Playwright (visual/e2e)
- Web Workers for thumbnails, EXIF, export

## Core architecture: non-destructive editing
- The original file is never modified.
- Each photo has `EditSettings`, a versioned, serializable JSON object.
- Rendering = original pixels + EditSettings -> one GPU pass chain.
- Presets, copy/paste, history, and virtual copies are all just EditSettings.

```ts
type EditSettings = {
  version: 1
  basic: { temp: number; tint: number; exposure: number; contrast: number;
           highlights: number; shadows: number; whites: number; blacks: number;
           vibrance: number; saturation: number }
  curve: { rgb: Point[]; r: Point[]; g: Point[]; b: Point[] }
  hsl: Record<'red'|'orange'|'yellow'|'green'|'aqua'|'blue'|'purple'|'magenta',
              { hue: number; sat: number; lum: number }>
  detail: { sharpAmount: number; sharpRadius: number }
  effects: { vignette: number; grain: number }
  geometry: { cropRect: Rect; angle: number; flipH: boolean; flipV: boolean }
}
```

Pipeline order (linear light): decode -> white balance -> exposure -> tone (contrast/highlights/shadows/whites/blacks) -> curve -> HSL/vibrance/saturation -> detail -> effects -> crop -> display transform.

Performance rule: render a downscaled proxy while dragging a slider, full resolution on release and on export.

## Milestones

| # | Build | Done when |
|---|-------|-----------|
| M0 | Scaffold, CLAUDE.md, lint/test/typecheck scripts, dark theme tokens | `npm test` runs green on a trivial test; app shows empty 3-panel layout |
| M1 | WebGL2 canvas, load image, exposure + contrast + saturation sliders | Dragging a slider updates the canvas live; unit tests match shader math on sample pixels |
| M2 | Full Basic panel, live histogram, before/after (`\`), double-click to reset, scrub labels | Screenshot test: each slider at min/max changes output; reset returns identical pixels |
| M3 | EditSettings store, undo/redo history panel, presets (save/apply) | Undo/redo restores exact settings; preset round-trips through JSON |
| M4 | Library: import (drag/drop, JPEG/PNG), thumbnail worker, grid view, filmstrip, IndexedDB persistence | Reload keeps photos and edits; 200 photos scroll smoothly |
| M5 | Ratings, flags, color labels, filtering, keyboard shortcuts | Shortcuts work; filters combine correctly |
| M6 | Crop, rotate, straighten overlay | Crop is non-destructive and re-editable |
| M7 | Export (JPEG/PNG, resize, quality) | Exported file matches on-screen look; original untouched |
| M8 | Tone curve editor, HSL/color mixer | Curve points editable; HSL affects only target hues |
| M9 | Sharpening, vignette, grain | Each effect has a unit test and a screenshot test |
| M10 | Copy/paste settings, sync across selection, batch export | Sync applies to all selected photos in one undo step |

## Version 2 (only after M10)
- EXIF filtering and search (camera, ISO, date), keywords, collections
- Virtual copies and snapshots
- Local adjustments: linear and radial gradients first, brush later
- Color grading wheels

## Deliberately left out (poor fit for Claude Code, or too risky early)
- **RAW decoding** (LibRaw via WASM): hard to debug and verify. Add last, as a separate experiment.
- **Healing/clone and AI masks:** need models or heavy algorithms and are hard to test.
- **Cloud sync, plugins, accounts.**
- **Noise reduction** (needs real algorithmic tuning).

## Design

**Layout**
- Top bar: Library | Develop | Export tabs
- Left: folders/collections, presets, history
- Center: canvas (zoom with `Z`, pan with space-drag)
- Right (Develop): histogram, then collapsible Basic, Curve, HSL, Detail, Effects, Geometry
- Bottom: filmstrip

**Visual tokens**
- Neutral grays only: bg `#1b1b1b`, panels `#232323`, borders `#2f2f2f`, text `#cfcfcf` (no color cast on the UI)
- One accent (e.g. `#4aa3ff`), used only for active states and slider fill
- Dense controls: 11-12px labels, 22px row height, tabular numerals for values

**Interactions**
- Double-click slider = reset; drag label = scrub; click value = type
- Shortcuts: `G` grid, `D` develop, `1-5` rate, `P`/`X` flag, `\` before/after, `Z` zoom, `Ctrl/Cmd+Z` undo
- Hold `\` to peek at the original

## First prompt to give Claude Code
"Read SPEC.md. Do M0 only: scaffold the project with the stack described, create CLAUDE.md from the working agreement, set up typecheck/test scripts, and render the empty three-panel dark layout. Stop and show me when the M0 checks pass."
