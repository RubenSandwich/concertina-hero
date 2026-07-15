# AGENTS.md

**Concertina Hero** — a Guitar-Hero-style rhythm game for toy concertinas, built
with React 19 + Vite 8 + TypeScript in a Paper Mario / paper-mache visual style.

## Commands

```bash
npm run dev           # Vite dev server (http://localhost:5173/)
npm run build         # tsc type-check, then production build — verify changes with this
npm run typecheck     # tsc --noEmit only
npm test              # unit tests: mic detection, scoring, timing, layout, songs,
                      #   instrument key map, per-size presets, the game engine core
                      #   (Node's test runner, pure logic, no browser)
npm run test:e2e       # browser tests (Playwright + Chromium): screen flow, real
                      #   keyboard input — starts its own dev server automatically
npm run format        # format everything with Prettier
npm run format:check  # verify formatting, no writes
```

## Working here

- **TypeScript, strict.** Vite/esbuild transpile and own the build; `tsc` only
  type-checks. Keep new code typed — avoid `any` and `@ts-expect-error`.
- **Verify before finishing:** `npm run build` must pass, run `npm run format`,
  and `npm test` for any audio/detection change. Run `npm run test:e2e` for any
  change to the game loop, input handling, or screen flow — it drives a real
  browser and catches what pure-function tests can't (rAF timing, keyboard
  events, audio-unlock gestures).
- **Imports** use subpath aliases — `#components/*`, `#modals/*`, `#screens/*`,
  `#hooks/*`, `#data/*`, `#audio/*` (the `imports` map in `package.json`) — not
  deep `../../..` paths.
- **Hand-written CSS, no framework.** Don't add runtime dependencies or a CSS
  framework without being asked.
- Keep edits minimal and in the existing style.

## Deeper docs

- [docs/architecture.md](docs/architecture.md) — the `src/` map: what each file owns.
- [docs/domain.md](docs/domain.md) — buttons, push/pull, the chart format, timing, mic mode, adding a song.
- [docs/storage.md](docs/storage.md) — note-frequency presets and the song library (localStorage).
- [docs/conventions.md](docs/conventions.md) — CSS, the game loop, tooling gotchas, reusable components.
