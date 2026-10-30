# Improvements plan (after V3)

The user asked for every item of the post-M25 improvement list. SPEC.md's
"Deliberately left out" names noise reduction and healing/clone; the user
chose to add them now, so they are in this plan. RAW decoding and AI masks
stay out (a decoder per camera brand without new dependencies; models
needed). Each milestone ends with its "Done when" checks, a full test run,
a pull request merged into `main`, and the work branch restarted from it.

| #   | Milestone | Done when |
| --- | --------- | --------- |
| M26 | Presence: Texture, Clarity and Dehaze sliders in Basic | CPU reference unit tests (local contrast up/down, midtones only for Clarity, Dehaze deepens hazy areas and adds haze when negative, look independent of render size); GPU within ±2/255; e2e: each slider changes the photo, defaults are pixel-exact; screenshots checked |
| M27 | Noise reduction: Luminance and Color in Detail | CPU reference unit tests (noise variance drops on a flat noisy patch, edges kept, color noise removed without shifting luminance); GPU within ±2/255; e2e + screenshots |
| M28 | Spot removal: heal and clone spots, with a source that can be moved | CPU reference for the patch (clone copies, heal matches the surrounding tone); GPU within ±2/255; e2e: a spot on a test photo disappears, undo brings it back; stays in place after crop/rotate |
| M29 | Lens and perspective: Distortion, Vertical / Horizontal perspective, Defringe (lateral color) in Geometry | CPU reference for the new mapping (identity stays a pixel-exact fast path); GPU within ±2/255; e2e + screenshots |
| M30 | Range masks: limit a mask to a color range or a brightness range | CPU reference for the range weight; GPU within ±2/255; e2e: a color range changes only that color |
| M31 | Compare and full screen: two photos side by side (linked zoom), full-screen view, slideshow | e2e: compare shows both and zooms together; full screen and slideshow open, advance and close with Esc; screenshots |
| M32 | Faster decisions: preset previews on hover, Auto tone for many photos in Library, RGB readout under the cursor | e2e for each (hover shows the preset without a history step; batch auto tone is one step per photo; readout matches the CPU reference) |
| M33 | App and big photos: install as an app, works offline, large-photo check | Manifest + service worker (same origin, cache-first for the built files); e2e: offline reload works; a 50 MP photo opens and exports without errors, memory measured |
| M34 | Export extras: output sharpening, contact sheet | CPU reference for output sharpening; e2e: contact sheet of 3 photos has the right grid and names |
| M35 | Watermark extras: text style, rotation, repeated pattern, a second watermark | Unit tests for the placement math; e2e export vs CPU reference; screenshots |
