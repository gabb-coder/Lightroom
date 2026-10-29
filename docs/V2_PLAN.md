# Version 2 plan

SPEC.md lists the Version 2 scope without milestones. This is the breakdown
used to build it, in SPEC order, each with "Done when" checks in the same
spirit as M0–M10. The brush (local adjustments, "later" in SPEC) is not in
this plan.

| #   | Milestone | Done when |
| --- | --------- | --------- |
| M11 | Metadata filters and keywords: filter by camera, lens, ISO range and capture date range; keywords on photos (add/remove on the selection); search covers file name, camera, lens and keywords | Each filter has unit tests and combines with the others (AND); e2e: filtering narrows the grid, keywords added to several photos survive a reload and are searchable |
| M12 | Collections: create, rename, delete; add/remove the selected photos; show a collection in the grid | e2e: a collection keeps its photos across a reload; removing a photo from a collection or deleting the collection never deletes the photo |
| M13 | Virtual copies and snapshots: a virtual copy is a second catalog entry that shares the original but has its own edits and history; snapshots are named, saved settings per photo | e2e: a virtual copy stores no second original and edits independently; applying a snapshot restores exactly its pixels and is one undo step |
| M14 | Color grading: shadows / midtones / highlights / global wheels (hue, saturation, luminance), blending and balance | CPU reference unit tests; GPU matches within ±2/255; wheels are draggable and keyboard accessible; screenshot checked |
| M15 | Local adjustments: linear and radial gradients with their own exposure, contrast, highlights, shadows, temperature, tint and saturation; on-canvas handles | CPU reference unit tests; GPU matches within ±2/255; e2e: dragging a gradient on the canvas changes only the masked side; masks follow crop/rotate, persist and undo |
