# Conventions & gotchas

## TypeScript & tooling

- `tsc` only type-checks (`--noEmit`); Vite/esbuild transpile and own the build.
  `npm run build` runs both.
- `npm test` uses Node's native test runner with type-stripping
  (`node --experimental-strip-types --test`), one process per test file. Because
  Node won't rewrite a `.js` specifier to a `.ts` file, every module reachable from
  a test (pitch, sound, instrument, layout, timing, songs, scoring, presets,
  gameEngineCore) uses explicit **`.ts`** relative _value_ imports (e.g.
  `./layout.ts`); type-only imports are erased, so they can stay extensionless.
  `.tsx` UI files aren't in the test graph and use the `#…` aliases as normal —
  as does `useGameEngine.ts`, since nothing in the test graph imports it.
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

- The engine is split into a stateless core and an impure shell:
  - `hooks/gameEngineCore.ts` exports `createInitialState(song)` and
    `stepEngine(state, input) -> { state, events }`. It is a plain function of
    its arguments — no DOM, no audio, no `performance.now()`, no `console.log` —
    which is what lets `gameEngineCore.test.ts` assert on it directly with
    made-up input instead of driving a real rAF loop or mic.
  - `hooks/useGameEngine.ts` is the shell: it owns rAF, keyboard listeners,
    sampling the mic (`detectChord()`), and applying the `EngineEvent`s a step
    returns (playing sounds, logging, calling `onFinish`). It keeps the engine
    state in a single ref (`stateRef`) and re-renders once per animation frame
    via `setElapsed`. Don't convert that ref to React state in the hot loop.
  - `stepEngine` mutates and returns its `state` argument's notes/maps/sets in
    place for speed (a run can have hundreds of notes at 60fps) but always
    returns a **new top-level object**, so `stateRef.current = next` still gets
    a fresh reference each frame.
  - Pausing works by the shell simply not calling `stepEngine` for that frame —
    there is no clock to rewind on resume, since the step function only ever
    advances by the `dtMs` it's given. A backgrounded tab isn't gated the same
    way: `document.hidden` can be true for an otherwise fully interactive page
    (e.g. under automated browser control), so the loop still steps normally and
    instead just resets its dt anchor on `visibilitychange` — so a _genuinely_
    throttled/suspended tab's next frame is one frame's worth of dt, not a wall
    of misses for the whole time away.
  - A key/tap press is queued with a `gameTime` computed at the instant it
    happened (extrapolated forward from the last processed step by the real
    time since then, capped at `MAX_EXTRAPOLATION_MS`), not applied to the
    engine state until the next `stepEngine` call. Extrapolating (rather than
    just reading the last-known clock) matters once frames aren't landing every
    ~16ms: without it, a run of presses arriving before the next step all
    collapse onto the same stale "now" and can silently miss their notes. The
    cap keeps that estimate from overshooting a clock that's genuinely frozen
    (paused, waiting for a note).

## Reusable building blocks

Prefer the existing `ui/components/` over new one-offs: `Modal`, `Accordion`,
`SegmentedControl`, `Switch`, `ListRow` (song/preset rows), and `UploadButton`
(JSON file upload).
