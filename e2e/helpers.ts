import { expect, type Page, type Locator } from '@playwright/test'
import path from 'node:path'

// Shared setup for the Start screen: expand Settings (collapsed by default),
// flip "Wait for correct note" so gameplay tests don't depend on real-time
// timing, then pick and start a song.

export async function expandSettings(page: Page): Promise<void> {
  const header = page.getByRole('button', { name: 'Settings', exact: true })
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click()
    await expect(header).toHaveAttribute('aria-expanded', 'true')
  }
}

export async function setWaitForNote(page: Page, on: boolean): Promise<void> {
  await expandSettings(page)
  const toggle = page.getByRole('switch', { name: /Wait for correct note/ })
  if ((await toggle.getAttribute('aria-checked')) !== String(on))
    await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', String(on))
}

// Switches "Play style" to the microphone. `startMic()` is async (it awaits
// getUserMedia), so wait for the radio to actually report checked rather than
// just firing the click — the permission grant + fake-device setup can take a
// moment (see playwright.config.ts's `permissions`/`launchOptions`).
export async function enableMic(page: Page): Promise<void> {
  await expandSettings(page)
  await page.getByRole('radio', { name: /Mic/ }).click()
  await expect(page.getByRole('radio', { name: /Mic/ })).toBeChecked()
}

// Selects `songName`'s card and clicks Play, without waiting for the
// countdown — use this instead of `startSong` when the caller needs to react
// at the exact instant the countdown ends (see `waitForCountdownEnd` and
// audio-taps-held.spec.ts, which starts its fake mic recording right then).
export async function selectAndPlaySong(
  page: Page,
  songName: string,
): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp('^' + songName) })
    .first()
    .click()
  await page
    .getByRole('button', { name: new RegExp('Play ' + songName) })
    .click()
}

// Waits out the real-time 3-2-1 countdown. Waits for the overlay to actually
// appear before waiting for it to go away — otherwise, if this ran before
// the Game screen had even mounted it yet, waiting for "hidden" would resolve
// immediately (nothing to hide) and hand control back before gameplay had
// actually started.
export async function waitForCountdownEnd(page: Page): Promise<void> {
  const countdown = page.locator('.countdown')
  await countdown.waitFor({ state: 'visible' })
  await countdown.waitFor({ state: 'hidden' })
}

// Selects `songName`'s card, then starts it, waiting out the real-time 3-2-1
// countdown. Every song's notes are further shifted by a fixed lead-in after
// that (so the fall animation has room to play), so the first note still
// isn't reachable the instant this returns — see `pressUntilCombo`.
export async function startSong(page: Page, songName: string): Promise<void> {
  await selectAndPlaySong(page, songName)
  await waitForCountdownEnd(page)
}

export function comboValue(page: Page): Locator {
  return page.locator('.hud__block.combo .hud__value')
}

// Repeats `press` until the combo shows `expected`, instead of trying to time
// a single press against the note's window. With "Wait for correct note" on,
// a press before the note is reachable is just a harmless no-op (the note
// hasn't arrived yet, or the barrier hasn't caught up to it in real time), so
// retrying is exactly how a player would react to nothing happening — and it
// sidesteps needing to know a song's exact BPM/lead-in, or account for
// whatever latency a given step happens to take.
export async function pressUntilCombo(
  page: Page,
  press: () => Promise<void>,
  expected: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await press()
    try {
      await expect(comboValue(page)).toHaveText(expected, { timeout: 300 })
      return
    } catch (err) {
      if (Date.now() >= deadline) throw err
    }
  }
}

export function scoreValue(page: Page): Locator {
  return page.locator('.hud__block:not(.combo) .hud__value').first()
}

// Replaces the app's microphone with a fake one that plays `wavPath` through
// a MediaStreamDestination — used by both mic tests (audio-taps.spec.ts,
// audio-taps-held.spec.ts) instead of Chromium's `--use-file-for-fake-audio-
// capture` launch flag, which is fixed for the whole browser and starts
// feeding its file the instant the mic is enabled, with no way to control
// exactly when or swap the file per test. This instead exposes
// `startFakeMic` so a test can trigger playback (once, or looping) at a
// precise moment of its choosing — needed to line a recording's timing up
// with the game's clock (see audio-taps-held.spec.ts).
//
// Must be called before `page.goto()` — `addInitScript` only affects scripts
// that run on the next navigation.
export async function mockMicFromWav(
  page: Page,
  wavPath: string,
  options: { loop?: boolean } = {},
): Promise<void> {
  const { loop = false } = options
  const fixtureUrl = '/__e2e_fixtures__/' + path.basename(wavPath)
  await page.route(fixtureUrl, (route) => route.fulfill({ path: wavPath }))
  await page.addInitScript(
    ({ url, loop }: { url: string; loop: boolean }) => {
      const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      )
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!constraints?.audio) return realGetUserMedia(constraints)
        const ctx = new AudioContext()
        await ctx.resume()
        const bytes = await fetch(url).then((r) => r.arrayBuffer())
        const audioBuffer = await ctx.decodeAudioData(bytes)
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.loop = loop
        const dest = ctx.createMediaStreamDestination()
        source.connect(dest)
        Object.assign(window, { __startFakeMic: () => source.start() })
        return dest.stream
      }
    },
    { url: fixtureUrl, loop },
  )
}

// Starts the fake mic recording set up by `mockMicFromWav`, once the mic has
// been enabled in the app (which is what actually calls `getUserMedia` and
// arms `__startFakeMic`).
export async function startFakeMic(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { __startFakeMic: () => void }).__startFakeMic(),
  )
}

// Waits for the countdown to end, then *immediately* starts the fake mic
// recording armed by `mockMicFromWav` — in the same in-page check that
// detected the countdown was gone, rather than a separate
// `waitForCountdownEnd()` + `startFakeMic()` round trip afterwards. That gap
// is normally small, but under the kind of CPU contention a full parallel
// test run creates it can grow enough to throw off a recording's alignment
// with the game's clock (see audio-taps-held.spec.ts). Playwright polls a
// `waitForFunction` predicate inside the page itself, so folding the trigger
// into it keeps the two events exactly as close as they can be.
//
// Waits for the countdown to actually appear first (same reason as
// `waitForCountdownEnd`): otherwise, if this ran before the Game screen had
// even mounted it, the "gone" check would pass instantly and fire the trigger
// long before the countdown really starts.
export async function waitForCountdownEndAndStartFakeMic(
  page: Page,
): Promise<void> {
  await page.locator('.countdown').waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    if (document.querySelector('.countdown')) return false
    ;(window as unknown as { __startFakeMic: () => void }).__startFakeMic()
    return true
  })
}
