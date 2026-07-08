# Conventions & gotchas

## TypeScript & tooling

- `tsc` only type-checks (`--noEmit`); Vite/esbuild transpile and own the build.
  `npm run build` runs both.
- `npm test` uses Node's native test runner with type-stripping
  (`node --experimental-strip-types --test`). Because Node won't rewrite a `.js`
  specifier to a `.ts` file, the pitch/sound/instrument test-graph files use
  explicit **`.ts`** relative imports (e.g. `./sound.ts`). Everything else uses
  the `#…` aliases or extensionless relative imports.
- Two imports stay relative rather than aliased: `../utils` and the test-graph
  files above.

## CSS

- Hand-written, no framework. `src/index.css` holds the theme (CSS vars),
  base/app/view-transition styles, and the shared primitives `.paper`, `.btn`,
  `.title`, `.diff`. Every component imports its own co-located `*.css`.
- Co-located CSS loads _before_ `index.css` in the bundle. To override a shared
  primitive of equal specificity (e.g. `.song-card` over `.paper`), use a
  higher-specificity selector (`.paper.song-card`) rather than relying on order.
- Push/pull are unified via the `--push-fill` (solid light orange) and
  `--pull-fill` (blue diagonal stripes) CSS vars — reuse them anywhere push/pull
  is shown.

## The game loop

- `useGameEngine` keeps mutable state (notes, score, combo, feedback) in refs and
  re-renders once per animation frame via `setElapsed`. Don't convert these to
  React state in the hot loop.
- The clock auto-pauses when the tab is hidden (and on manual Space pause) so a
  backgrounded tab doesn't dump a wall of misses.

## Reusable building blocks

Prefer the existing `ui/components/` over new one-offs: `Modal`, `Accordion`,
`SegmentedControl`, `Switch`, `ListRow` (song/preset rows), and `UploadButton`
(JSON file upload).
