import { expect, type Page, type Locator } from '@playwright/test'

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
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
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

// Selects `songName`'s card, then starts it, waiting out the real-time 3-2-1
// countdown. Every song's notes are further shifted by a fixed lead-in after
// that (so the fall animation has room to play), so the first note still
// isn't reachable the instant this returns — see `pressUntilCombo`.  Waits for
// the countdown overlay to actually appear before waiting for it to go away —
// otherwise, if this ran before the Game screen had even mounted it yet,
// waiting for "hidden" would resolve immediately (nothing to hide) and hand
// control back before gameplay had actually started.
export async function startSong(page: Page, songName: string): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp('^' + songName) })
    .first()
    .click()
  await page.getByRole('button', { name: new RegExp('Play ' + songName) }).click()
  const countdown = page.locator('.countdown')
  await countdown.waitFor({ state: 'visible' })
  await countdown.waitFor({ state: 'hidden' })
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
