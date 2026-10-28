# Design reference

These files are the UI mockups for the app. They are a **visual and behavioral reference, not code to reuse**.

- They use a custom template format (`<x-dc>`, `<sc-for>`, `<sc-if>`, `{{holes}}`, a `DCLogic` class) that only runs inside the design tool. They will not open correctly in a plain browser.
- Read them for layout, sizes, colors, spacing, type, copy, and how controls behave. Rebuild everything in the project's own stack (React + TypeScript, per SPEC.md).

| File | Screen | Use it for |
|------|--------|------------|
| `Develop.dc.html` | Develop module | M0–M3, M6, M8–M9: three-panel layout, top bar, filmstrip, histogram, slider rows, collapsible panels, history, presets, before/after |
| `Library.dc.html` | Library grid | M4–M5: folders panel, filter bar, grid cells (rating, flag, label, edited badge), metadata panel |
| `Export.dc.html` | Export dialog | M7: dialog layout and fields |
| `Kit.dc.html` | UI kit | Color tokens, type scale, slider states, buttons, toasts, empty state, keyboard shortcuts |

## Tokens (also in Kit.dc.html)

| Token | Value |
|-------|-------|
| Photo canvas | `#141414` |
| App background | `#1b1b1b` |
| Panel | `#232323` |
| Raised / input | `#2a2a2a` |
| Border | `#2f2f2f` |
| Text | `#cfcfcf` |
| Text muted | `#9e9e9e` |
| Accent (active and selected only) | `#4aa3ff` |

Font: Inter. 12px control labels, 11px uppercase group labels, 13px panel titles, tabular numerals for values.

## Behavior shown in the Develop mockup

- A slider's value text turns white when it differs from its default; double-click the label or slider to reset.
- Every edit adds a History entry; consecutive drags on the same slider merge into one entry. Clicking an entry or Undo/Redo moves through history; a new edit after undoing discards the undone steps.
- Presets replace all settings in one history step.
- Panels collapse; a dot on a panel header means something in it is edited.
- Before/After shows the original with no adjustments.

The photo in the mockups is a drawn placeholder. "Darkslide" is a placeholder app name.
