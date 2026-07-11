# Conventions & gotchas

## TypeScript & tooling

- `tsc` only type-checks (`--noEmit`); Vite/esbuild transpile and own the build.
  `npm run build` runs both.
- `npm test` uses Node's native test runner with type-stripping
  (`node --experimental-strip-types --test`), one process per test file. Because
  Node won't rewrite a `.js` specifier to a `.ts` file, every module reachable from
  a test (pitch, sound, instrument, layout, timing, songs, scoring, presets) uses
  explicit **`.ts`** relative _value_ imports (e.g. `./layout.ts`); type-only
  imports are erased, so they can stay extensionless. `.tsx` UI files aren't in the
  test graph and use the `#…` aliases as normal.
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

## Layout & sizing

- **Minimum app width is 1024px** (`MIN_APP_WIDTH` in `ScreenGuard`). Below it a
  blocking, non-dismissable `.screen-guard` overlay covers the app — asking to
  widen the window, or (if the device screen can't reach 1024) to use a bigger
  device. Design for ≥1024px; test the 20/30-button game at exactly 1024.
- Screens scroll when taller than the viewport: `.screen-stage` is `overflow-y:
auto` with `margin: auto` on its child (centres when it fits, scrolls from the
  top when it doesn't). Start also scrolls internally (`.start-screen`).
- Keyboard circle size comes from the layout's **tightest lane gap** (`--key-frac`,
  set on `.playfield` in `Game.tsx`) times the playfield width, capped by the row
  height — so even the staggered 20/30-button rows never collide across the
  bellows divider. Each drawn button has three states: idle (muted), `.is-active`
  (a note is in its lane — ringed, tinted, **not** filled), `.is-pressed` (being
  played — the only state filled in solid/striped).

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
