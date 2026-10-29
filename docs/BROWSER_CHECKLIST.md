# Browser checklist

Automated tests run only in Chromium (headless, software WebGL). Before a
release, run through this list once in each of: current Firefox, current
Safari on macOS, Safari on iPhone/iPad, and Chrome or Edge on a machine with
a real graphics card. Use a few real camera JPEGs (one portrait-orientation
shot with EXIF rotation, one larger than 20 MP).

## Compatibility notes (audit, M18)

| Feature | Used for | Chrome/Edge | Firefox | Safari | Fallback |
| --- | --- | --- | --- | --- | --- |
| WebGL 2 | All rendering | yes | yes | 15+ | None: the app shows "can't run in this browser" |
| IndexedDB | The catalog | yes | yes (not in some private modes) | yes | None: same message |
| OffscreenCanvas 2D in workers | Thumbnails | yes | 105+ | 16.4+ | None: same message |
| WebGL 2 on OffscreenCanvas in workers | Export, background thumbnails | yes | 105+ | 17+ | Renders on the page instead (`render/mainThreadExport.ts`); a notice says exports pause the app briefly |
| `createImageBitmap` resize options | Export resize, proxies | yes | `resizeQuality` ignored | partly | Always draws at an explicit size, so the result is right; scaling quality may vary |
| `imageOrientation: 'from-image'` | EXIF rotation | yes | yes | yes | — |
| `navigator.storage.persist/estimate` | Keep data, storage use | yes | yes | 17+ (estimate) | Hidden when missing; the banner suggests regular backups |
| Module workers | Workers | yes | 114+ | 15+ | Worker failure falls back for export; thumbnails need them |
| `inert`, `structuredClone`, `crypto.randomUUID`, `Array.prototype.at` | UI, data | yes | yes | 15.4+ | — |
| `showDirectoryPicker` (File System Access) | Export into a chosen folder | 86+ | no | no | The "A folder you choose" option is hidden; ZIP or separate downloads instead |
| WebP / AVIF decoding | Import | yes | yes | 14+ / 16+ | The import message names the file |
| HEIC decoding | Import | no | no | 17+ | Elsewhere the import message says to convert it to JPEG |
| Float (RGBA32F) textures, sampled with NEAREST | Tone curve table | core WebGL 2 | yes | yes | — |

Large photos: the on-screen render and exports are capped at the GPU's
maximum texture size (often 4096 or 8192 px on phones). Exports from such
devices come out at that size.

## Checklist

1. **Start:** the app opens with no support banner (or only the "limits" note on Safari 16).
2. **Import:** drop 3 JPEGs, 1 PNG, 1 WebP and 1 AVIF (plus an iPhone HEIC on Safari). Thumbnails appear; a portrait photo is upright; Metadata shows camera, lens, ISO. Elsewhere the HEIC gets the "convert it to JPEG" message.
3. **Develop:** move Exposure, Contrast, the tone curve, a color mixer slider, color grading and sharpening. The photo updates smoothly while dragging and looks sharp after letting go.
4. **Zoom:** Fit, Fill, 1:1, Z, drag to pan, Navigator click.
5. **Crop:** straighten 10°, aspect 1:1, rotate 90°, flip.
6. **Masks:** a linear and a radial gradient with exposure (rotate the radial with its handle), and a brush mask (paint, Alt to erase); they stay put after rotating. Show overlay (O) tints the selected one.
7. **History:** undo/redo, Before/After with `\`.
8. **Export:** one photo as JPEG (resized) and as PNG (full size); open both and compare with the screen. Then a batch of 3 as one ZIP (unzip it), as separate downloads, and (Chrome/Edge) into a chosen folder twice: the second run adds `-2` names instead of replacing files.
9. **Backup:** back up the catalog, open the app in a private window (or another browser profile), restore, compare.
10. **Reload:** everything is still there.
11. **Phone/tablet:** steps 2, 3, 4 and 8 with touch. Nothing scrolls sideways; a vertical swipe on a fitted photo scrolls the page; sliders and buttons are easy to hit.
12. **Keyboard:** `?` lists the shortcuts; try a few from each group.

Note anything that differs, with the browser version, and file it.
