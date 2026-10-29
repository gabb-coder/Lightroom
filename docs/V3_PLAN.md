# Improvements plan (after V2)

The improvement list from the V2 review, grouped into milestones in the same
style as M0–M15. Each ends with its "Done when" checks passing, a full test
run and a commit.

| #   | Milestone | Done when |
| --- | --------- | --------- |
| M16 | Zoom and Navigator: Fit / Fill / 1:1 (Z toggles), drag to pan at 1:1 and Fill, Navigator shows the photo with the visible area; drag there to pan | e2e: at 1:1 one photo pixel is one screen pixel (checked on a pixel pattern), panning moves the view, the Navigator box matches the visible part |
| M17 | Catalog safety: backup to one file and restore from it, storage usage shown, delete photos from the catalog (with confirmation; a master takes its virtual copies with it) | e2e: backup → empty catalog → restore gives byte-identical originals and identical edits, collections, snapshots and presets; deleting removes every trace of a photo and nothing else |
| M18 | Compatibility and memory: audit every browser API for Firefox/Safari with fallbacks where needed, a manual test checklist, smaller GPU memory for sharpening/grain, and the pre-M9 preset-file fix | Unit tests for each fallback decision; GPU tests still within ±2/255; intermediate memory measured lower; checklist in `docs/BROWSER_CHECKLIST.md` |
| M19 | Import and export formats: WebP and AVIF import (HEIC where the browser can decode it), batch export as one ZIP or into a chosen folder (where supported) | Unit tests for the ZIP writer (CRC, layout) and the format checks; e2e: a 3-photo batch gives one ZIP whose files match the CPU reference; a WebP imports and edits |
| M20 | Editing aids: white balance eyedropper, Auto tone, highlight/shadow clipping warnings, split Before/After view | CPU reference unit tests (eyedropper neutralizes the picked color; Auto tone lands in range); GPU clipping overlay matches its reference; e2e for each; screenshots checked |
| M21 | Mask tools: rotate radial masks, show the mask as an overlay, brush masks (paint and erase) | CPU reference for brush rasterization and mask display; GPU within ±2/255; e2e: painting changes only painted areas and is undoable |
| M22 | Interface polish: collapsible Library panel sections, keyboard shortcuts help (top-bar keyboard icon and ?), phone and touch layout | e2e: shortcuts dialog lists every shortcut; panels collapse and remember it; at 390 px wide every module is usable without horizontal scrolling; screenshots checked |
