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
is pinned to the version of the pre-installed Chromium.
